/**
 * @file backend/src/services/orchestrator.service.js
 * @description CallOrchestratorModule (MOD-05) — background campaign execution engine.
 *
 * This service runs a polling loop every POLLING_INTERVAL_MS (10s), queries
 * active campaigns, selects eligible leads, and dispatches outbound Twilio
 * calls with rate limiting and concurrency control.
 *
 * Exported API:
 *   - startOrchestrator()                        — Idempotent: starts the poll loop.
 *   - stopOrchestrator()                         — Clears interval and resets state.
 *   - initiateCall(leadId, phoneNumber, campaignId) — Dials one lead via Twilio.
 *   - handleCallStatusUpdate(leadId, twilioStatus, callSid, errorCode)
 *                                                — Processes Twilio status callbacks.
 *   - evaluateCampaignCompletion(campaignId, businessId)
 *                                                — Checks if a campaign is done.
 *
 * Design principles:
 *   - Firestore is the source of truth; in-memory state is only for polling
 *     concurrency tracking and is rebuilt on restart.
 *   - All Firestore writes use req.user-independent paths (background service),
 *     but business_id is always bound to queries for tenant isolation.
 *   - Side effects (Twilio calls, Firestore writes) are separated from pure
 *     selection logic to keep the service testable.
 */

const { admin, db } = require('../config/firebase');
const { twilioClient, TWILIO_NUMBER } = require('../config/twilio');

const FieldValue = admin.firestore.FieldValue;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Configuration Constants
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** How often the orchestrator polls for work (milliseconds). */
const POLLING_INTERVAL_MS = 10_000;

/** Maximum number of simultaneously active calls across all campaigns. */
const MAX_CONCURRENT_CALLS = 10;

/** Delay between consecutive call initiations (milliseconds). */
const INTER_CALL_DELAY_MS = 2_000;

/** Minimum cooling period before a retry_queued lead is re-eligible (ms). */
const RETRY_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes

/** Default retry limit if campaign.retry_limit is not set. */
const DEFAULT_RETRY_LIMIT = 2;

/**
 * Backend URL for constructing Twilio webhook callbacks.
 * Falls back to localhost for development.
 */
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8080';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// In-Memory State (volatile — rebuilt from Firestore on restart)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** Active call count — tracks calls in "calling" state across all campaigns. */
let activeCallCount = 0;

/** Polling interval reference — null when stopped. */
let pollingInterval = null;

/** Guard flag to prevent overlapping poll cycles. */
let isPolling = false;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Helpers — Pure selection logic (testable, no side effects)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * isLeadEligible — Determines if a lead is ready to be dialed right now.
 *
 * @param {object} lead — Firestore lead document data.
 * @param {number} retryLimit — Campaign retry limit.
 * @param {number} nowMs — Current timestamp in milliseconds.
 * @returns {boolean}
 */
const isLeadEligible = (lead, retryLimit, nowMs) => {
  // Pending leads are always eligible.
  if (lead.call_status === 'pending') {
    return true;
  }

  // Retry-queued leads must meet attempt limit and cooldown.
  if (lead.call_status === 'retry_queued') {
    if (lead.attempt_count >= retryLimit) {
      return false;
    }

    // Check 5-minute cooldown from last attempt.
    const lastAttempt = lead.last_attempt_at;
    if (lastAttempt) {
      const lastAttemptMs = lastAttempt.toMillis
        ? lastAttempt.toMillis()
        : new Date(lastAttempt).getTime();
      if (nowMs - lastAttemptMs < RETRY_COOLDOWN_MS) {
        return false; // Still in cooldown.
      }
    }

    return true;
  }

  return false;
};

/**
 * sleep — Promise-based delay for rate limiting.
 * @param {number} ms
 * @returns {Promise<void>}
 */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Core — Call Initiation
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * initiateCall — Dials a single lead via the Twilio REST API.
 *
 * On success:
 *   - Updates lead to `calling`, increments `attempt_count`,
 *     sets `twilio_call_sid`, `called_at`, and `last_attempt_at`.
 *   - Increments in-memory `activeCallCount`.
 *
 * On Twilio failure:
 *   - Logs the error and does NOT increment `attempt_count`.
 *   - The lead remains in its current state for the next polling cycle.
 *
 * @param {string} leadId
 * @param {string} phoneNumber — E.164 format.
 * @param {string} campaignId
 * @returns {Promise<string|null>} — Twilio Call SID on success, null on failure.
 */
const initiateCall = async (leadId, phoneNumber, campaignId) => {
  if (!twilioClient) {
    console.error('[Orchestrator] Twilio client not initialized. Skipping call.');
    return null;
  }

  try {
    const call = await twilioClient.calls.create({
      to: phoneNumber,
      from: TWILIO_NUMBER,
      url: `${BACKEND_URL}/twilio/twiml/${leadId}`,
      statusCallback: `${BACKEND_URL}/twilio/status/${leadId}`,
      statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
      record: true,
      recordingStatusCallback: `${BACKEND_URL}/twilio/recording/${leadId}`,
    });

    // ── Update lead in Firestore ─────────────────────────────────────────────
    const now = FieldValue.serverTimestamp();
    await db.collection('leads').doc(leadId).update({
      call_status: 'calling',
      attempt_count: FieldValue.increment(1),
      twilio_call_sid: call.sid,
      called_at: now,
      last_attempt_at: now,
    });

    activeCallCount++;
    console.log(`[Orchestrator] Call initiated: lead=${leadId}, sid=${call.sid}`);
    return call.sid;
  } catch (err) {
    // Do NOT increment attempt_count on Twilio failure — allow retry next cycle.
    console.error(`[Orchestrator] Call initiation failed for lead=${leadId}:`, err.message);
    return null;
  }
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Core — Status Callback Handling
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * handleCallStatusUpdate — Processes Twilio status webhooks.
 *
 * Terminal statuses (completed, no-answer, busy, failed, canceled):
 *   - Decrement activeCallCount.
 *   - For no-answer/busy/failed: check retry eligibility.
 *     - If retries remain → retry_queued.
 *     - Otherwise → failed.
 *   - For completed: mark lead as completed and trigger campaign evaluation.
 *
 * Non-terminal statuses (initiated, ringing, in-progress):
 *   - Logged but no state change needed.
 *
 * @param {string} leadId
 * @param {string} twilioStatus — Twilio CallStatus string.
 * @param {string} callSid — Twilio Call SID for correlation.
 * @param {string} [errorCode] — Twilio error code if present.
 * @returns {Promise<void>}
 */
const handleCallStatusUpdate = async (leadId, twilioStatus, callSid, errorCode) => {
  try {
    const leadRef = db.collection('leads').doc(leadId);
    const leadSnap = await leadRef.get();

    if (!leadSnap.exists) {
      console.error(`[Orchestrator] Status update for unknown lead: ${leadId}`);
      return;
    }

    const lead = leadSnap.data();
    const normalizedStatus = (twilioStatus || '').toLowerCase();

    // ── Non-terminal statuses: log and ignore ────────────────────────────────
    const nonTerminal = ['initiated', 'ringing', 'in-progress', 'queued'];
    if (nonTerminal.includes(normalizedStatus)) {
      return;
    }

    // ── Terminal status: decrement active call count ──────────────────────────
    if (activeCallCount > 0) {
      activeCallCount--;
    }

    // ── Successful completion ────────────────────────────────────────────────
    if (normalizedStatus === 'completed') {
      await leadRef.update({
        call_status: 'completed',
        completed_at: FieldValue.serverTimestamp(),
      });

      // Update campaign called_count.
      if (lead.campaign_id) {
        await db.collection('campaigns').doc(lead.campaign_id).update({
          called_count: FieldValue.increment(1),
          updated_at: FieldValue.serverTimestamp(),
        });
      }

      // Evaluate if the campaign is now done.
      await evaluateCampaignCompletion(lead.campaign_id, lead.business_id);
      return;
    }

    // ── Failure / no-answer / busy / canceled ────────────────────────────────
    const failureStatuses = ['no-answer', 'busy', 'failed', 'canceled'];
    if (failureStatuses.includes(normalizedStatus)) {
      // Determine retry limit from the campaign.
      let retryLimit = DEFAULT_RETRY_LIMIT;
      if (lead.campaign_id) {
        const campaignSnap = await db.collection('campaigns').doc(lead.campaign_id).get();
        if (campaignSnap.exists) {
          retryLimit = campaignSnap.data().retry_limit || DEFAULT_RETRY_LIMIT;
        }
      }

      // Check if retries remain.
      if (lead.attempt_count < retryLimit) {
        await leadRef.update({
          call_status: 'retry_queued',
          last_attempt_at: FieldValue.serverTimestamp(),
        });
        console.log(
          `[Orchestrator] Lead ${leadId} queued for retry ` +
          `(attempt ${lead.attempt_count}/${retryLimit}, status: ${normalizedStatus})`
        );
      } else {
        await leadRef.update({
          call_status: 'failed',
          completed_at: FieldValue.serverTimestamp(),
        });
        console.log(
          `[Orchestrator] Lead ${leadId} marked failed — retries exhausted ` +
          `(${lead.attempt_count}/${retryLimit}, status: ${normalizedStatus})`
        );

        // Update campaign called_count for failed calls too.
        if (lead.campaign_id) {
          await db.collection('campaigns').doc(lead.campaign_id).update({
            called_count: FieldValue.increment(1),
            updated_at: FieldValue.serverTimestamp(),
          });
        }
      }

      // Evaluate campaign completion in all failure cases.
      await evaluateCampaignCompletion(lead.campaign_id, lead.business_id);
      return;
    }

    // ── Unknown status — log for debugging ───────────────────────────────────
    console.warn(`[Orchestrator] Unhandled Twilio status "${twilioStatus}" for lead ${leadId}`);
  } catch (err) {
    console.error(`[Orchestrator] handleCallStatusUpdate error for lead=${leadId}:`, err.message);
  }
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Core — Campaign Completion Evaluation
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * evaluateCampaignCompletion — Checks whether all leads for a campaign have
 * reached a terminal state (completed or failed). If so, marks the campaign
 * as `completed`.
 *
 * This is based entirely on Firestore state (not in-memory assumptions),
 * making it safe across process restarts.
 *
 * @param {string} campaignId
 * @param {string} businessId
 * @returns {Promise<boolean>} — True if campaign was marked completed.
 */
const evaluateCampaignCompletion = async (campaignId, businessId) => {
  if (!campaignId || !businessId) return false;

  try {
    // Query for any lead that is still in an active state.
    const activeStatuses = ['pending', 'calling', 'retry_queued'];

    const activeLeads = await db
      .collection('leads')
      .where('campaign_id', '==', campaignId)
      .where('business_id', '==', businessId)
      .where('call_status', 'in', activeStatuses)
      .limit(1) // We only need to know if ANY exist.
      .get();

    if (activeLeads.empty) {
      // All leads are terminal — mark campaign completed.
      await db.collection('campaigns').doc(campaignId).update({
        status: 'completed',
        updated_at: FieldValue.serverTimestamp(),
      });
      console.log(`[Orchestrator] Campaign ${campaignId} marked as completed.`);
      return true;
    }

    return false;
  } catch (err) {
    console.error(`[Orchestrator] evaluateCampaignCompletion error for campaign=${campaignId}:`, err.message);
    return false;
  }
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Polling Loop
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * syncActiveCallCount — Rebuilds the in-memory activeCallCount from Firestore.
 *
 * Called once at orchestrator start to recover from process restart.
 * Queries all leads with call_status === 'calling' across all campaigns.
 *
 * @returns {Promise<void>}
 */
const syncActiveCallCount = async () => {
  try {
    const callingLeads = await db
      .collection('leads')
      .where('call_status', '==', 'calling')
      .select() // Empty select — we just need the count.
      .get();

    activeCallCount = callingLeads.size;
    console.log(`[Orchestrator] Synced active call count from Firestore: ${activeCallCount}`);
  } catch (err) {
    console.error('[Orchestrator] Failed to sync active call count:', err.message);
    activeCallCount = 0;
  }
};

/**
 * pollAndDispatch — The core polling function executed every interval.
 *
 * Flow:
 *   1. Skip if another poll cycle is still running (guard).
 *   2. Query all active campaigns (ordered by created_at for stability).
 *   3. For each campaign, find eligible leads.
 *   4. Initiate calls with rate limiting and concurrency control.
 *
 * @returns {Promise<void>}
 */
const pollAndDispatch = async () => {
  // Guard: prevent overlapping poll cycles.
  if (isPolling) return;
  isPolling = true;

  try {
    // ── Skip if at concurrency limit ─────────────────────────────────────────
    if (activeCallCount >= MAX_CONCURRENT_CALLS) {
      return;
    }

    // ── 1. Query active campaigns (stable order) ─────────────────────────────
    const campaignsSnap = await db
      .collection('campaigns')
      .where('status', '==', 'active')
      .orderBy('created_at', 'asc')
      .get();

    if (campaignsSnap.empty) return;

    const nowMs = Date.now();

    // ── 2. Process each campaign ─────────────────────────────────────────────
    for (const campaignDoc of campaignsSnap.docs) {
      if (activeCallCount >= MAX_CONCURRENT_CALLS) break;

      const campaign = campaignDoc.data();
      const campaignId = campaignDoc.id;
      const retryLimit = campaign.retry_limit || DEFAULT_RETRY_LIMIT;

      // ── 3. Find eligible leads for this campaign ───────────────────────────
      // Query pending leads first, then retry_queued leads, both oldest-first.
      const pendingLeads = await db
        .collection('leads')
        .where('campaign_id', '==', campaignId)
        .where('business_id', '==', campaign.business_id)
        .where('call_status', '==', 'pending')
        .orderBy('__name__') // Stable order by doc ID (effectively creation order).
        .limit(MAX_CONCURRENT_CALLS - activeCallCount)
        .get();

      const retryLeads = await db
        .collection('leads')
        .where('campaign_id', '==', campaignId)
        .where('business_id', '==', campaign.business_id)
        .where('call_status', '==', 'retry_queued')
        .orderBy('last_attempt_at', 'asc')
        .limit(MAX_CONCURRENT_CALLS - activeCallCount)
        .get();

      // Merge and filter for eligibility.
      const allCandidates = [];
      pendingLeads.forEach((doc) => allCandidates.push({ id: doc.id, ...doc.data() }));
      retryLeads.forEach((doc) => allCandidates.push({ id: doc.id, ...doc.data() }));

      const eligibleLeads = allCandidates.filter((lead) =>
        isLeadEligible(lead, retryLimit, nowMs)
      );

      // ── 4. Dial eligible leads with rate limiting ──────────────────────────
      for (const lead of eligibleLeads) {
        if (activeCallCount >= MAX_CONCURRENT_CALLS) break;

        await initiateCall(lead.id, lead.phone_number, campaignId);
        await sleep(INTER_CALL_DELAY_MS);
      }
    }
  } catch (err) {
    console.error('[Orchestrator] pollAndDispatch error:', err.message);
  } finally {
    isPolling = false;
  }
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Public API — Start / Stop
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * startOrchestrator — Boots the polling loop. Idempotent: calling this
 * multiple times does not create duplicate intervals.
 *
 * On start:
 *   1. Syncs activeCallCount from Firestore (recovery after restart).
 *   2. Runs one immediate poll cycle.
 *   3. Sets up the repeating interval.
 */
const startOrchestrator = async () => {
  if (pollingInterval !== null) {
    console.log('[Orchestrator] Already running. Ignoring duplicate start.');
    return;
  }

  console.log('[Orchestrator] Starting call orchestrator...');
  console.log(`[Orchestrator] Config: poll=${POLLING_INTERVAL_MS}ms, maxConcurrent=${MAX_CONCURRENT_CALLS}, callDelay=${INTER_CALL_DELAY_MS}ms`);

  // Sync in-memory state from Firestore on boot.
  await syncActiveCallCount();

  // Run one cycle immediately.
  await pollAndDispatch();

  // Start periodic polling.
  pollingInterval = setInterval(pollAndDispatch, POLLING_INTERVAL_MS);

  console.log('[Orchestrator] Polling loop started.');
};

/**
 * stopOrchestrator — Stops the polling loop and resets in-memory state.
 * Used for graceful shutdown and testing.
 */
const stopOrchestrator = () => {
  if (pollingInterval !== null) {
    clearInterval(pollingInterval);
    pollingInterval = null;
  }
  activeCallCount = 0;
  isPolling = false;
  console.log('[Orchestrator] Stopped.');
};

module.exports = {
  startOrchestrator,
  stopOrchestrator,
  initiateCall,
  handleCallStatusUpdate,
  evaluateCampaignCompletion,
  // Exported for testing:
  isLeadEligible,
  // Constants exported for testing / reference:
  POLLING_INTERVAL_MS,
  MAX_CONCURRENT_CALLS,
  INTER_CALL_DELAY_MS,
  RETRY_COOLDOWN_MS,
};
