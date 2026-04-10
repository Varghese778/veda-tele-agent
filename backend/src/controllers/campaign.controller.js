/**
 * @file backend/src/controllers/campaign.controller.js
 * @description Controller logic for the CampaignModule (MOD-03).
 *
 * Manages the full campaign lifecycle:
 *   - listCampaigns   : All campaigns belonging to the authenticated business.
 *   - getCampaign     : Single campaign detail (ownership-gated).
 *   - createCampaign  : New campaign in `draft` state + atomic stats update.
 *   - updateCampaign  : Edits allowed only while status === 'draft'.
 *   - startCampaign   : Transitions draft → active.
 *   - pauseCampaign   : Transitions active → paused.
 *   - getAnalytics    : Aggregates lead metrics for a specific campaign.
 *
 * Ownership enforcement:
 *   Every read and mutation verifies `campaign.business_id === req.user.uid`.
 *   List queries include `.where('business_id', '==', uid)` to prevent
 *   enumeration attacks (PRS §12, MOD-03 §12).
 *
 * Lifecycle rules:
 *   draft → active → paused → (re-start allowed: paused → active)
 *   `completed` is set exclusively by CallOrchestratorModule (MOD-05).
 */

const { admin, db } = require('../config/firebase');
const { DEFAULT_RETRY_LIMIT } = require('../validators/campaign.validator');

const FieldValue = admin.firestore.FieldValue;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * fetchOwnedCampaign — Retrieves a campaign document and verifies ownership.
 *
 * Returns the Firestore document reference and snapshot if owned by the
 * authenticated user. Otherwise, sends the appropriate HTTP error and
 * returns null so the caller can short-circuit.
 *
 * @param {string} campaignId
 * @param {string} uid — Authenticated user's UID.
 * @param {import('express').Response} res
 * @returns {Promise<{ ref: FirebaseFirestore.DocumentReference, data: object } | null>}
 */
const fetchOwnedCampaign = async (campaignId, uid, res) => {
  const ref = db.collection('campaigns').doc(campaignId);
  const snapshot = await ref.get();

  if (!snapshot.exists) {
    res.status(404).json({
      error: 'Not Found',
      message: 'Campaign not found.',
    });
    return null;
  }

  const data = snapshot.data();
  if (data.business_id !== uid) {
    // Return 404 (not 403) to avoid leaking document existence to other tenants.
    res.status(404).json({
      error: 'Not Found',
      message: 'Campaign not found.',
    });
    return null;
  }

  return { ref, data };
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /api/campaigns
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * listCampaigns — Returns all campaigns owned by the authenticated business.
 *
 * The query uses `.where('business_id', '==', uid)` to enforce tenant
 * isolation at the query level, preventing enumeration.
 */
const listCampaigns = async (req, res) => {
  try {
    const { uid } = req.user;

    const snapshot = await db
      .collection('campaigns')
      .where('business_id', '==', uid)
      .orderBy('created_at', 'desc')
      .get();

    const campaigns = snapshot.docs.map((doc) => {
      const d = doc.data();
      return {
        campaign_id: doc.id,
        campaign_name: d.campaign_name,
        purpose: d.purpose,
        product_description: d.product_description || '',
        target_audience: d.target_audience || '',
        key_details: d.key_details || '',
        status: d.status,
        total_leads: d.total_leads || 0,
        called_count: d.called_count || 0,
        created_at: d.created_at,
        updated_at: d.updated_at,
      };
    });

    return res.status(200).json({ campaigns });
  } catch (err) {
    console.error('[CampaignController] listCampaigns error:', err.message);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to retrieve campaigns.',
    });
  }
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /api/campaigns/:id
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * getCampaign — Returns full details for a single campaign (ownership-gated).
 */
const getCampaign = async (req, res) => {
  try {
    const { uid } = req.user;
    const result = await fetchOwnedCampaign(req.params.id, uid, res);
    if (!result) return; // Response already sent by helper.

    const { data } = result;

    return res.status(200).json({
      campaign_id: req.params.id,
      business_id: data.business_id,
      campaign_name: data.campaign_name,
      purpose: data.purpose,
      script_guidelines: data.script_guidelines,
      product_description: data.product_description,
      target_audience: data.target_audience,
      key_details: data.key_details,
      status: data.status,
      total_leads: data.total_leads || 0,
      called_count: data.called_count || 0,
      retry_limit: data.retry_limit,
      created_at: data.created_at,
      updated_at: data.updated_at,
    });
  } catch (err) {
    console.error('[CampaignController] getCampaign error:', err.message);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to retrieve campaign.',
    });
  }
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// POST /api/campaigns
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * createCampaign — Creates a new campaign in `draft` status.
 *
 * Prerequisites:
 *   - The business profile must exist AND have `profile_complete === true`.
 *     If not, returns 403 with a message the frontend can use to redirect
 *     the user to onboarding.
 *
 * Atomic operations:
 *   - Creates the campaign document.
 *   - Increments `platform_stats/global.total_campaigns` via batch write.
 */
const createCampaign = async (req, res) => {
  try {
    const { uid } = req.user;

    // ── Verify business profile is complete ──────────────────────────────────
    const businessSnap = await db.collection('businesses').doc(uid).get();

    if (!businessSnap.exists) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Business profile not found. Please complete onboarding first.',
        redirect: '/onboarding',
      });
    }

    if (!businessSnap.data().profile_complete) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Business profile is incomplete. Please complete onboarding before creating campaigns.',
        redirect: '/onboarding',
      });
    }

    // ── Build campaign document ──────────────────────────────────────────────
    // Sanitize: Firestore rejects `undefined` — default optional fields to ''.
    const campaign_name = (req.body.campaign_name || '').trim();
    const purpose = (req.body.purpose || '').trim();
    const script_guidelines = (req.body.script_guidelines || '').trim();
    const product_description = (req.body.product_description || '').trim();
    const target_audience = (req.body.target_audience || '').trim();
    const key_details = (req.body.key_details || '').trim();

    const now = FieldValue.serverTimestamp();
    const campaignRef = db.collection('campaigns').doc(); // Auto-generate ID.

    const campaignData = {
      campaign_id: campaignRef.id,
      business_id: uid,
      campaign_name,
      purpose,
      script_guidelines,
      product_description,
      target_audience,
      key_details,
      status: 'draft', // Always initialize as draft — client cannot override.
      total_leads: 0,
      called_count: 0,
      retry_limit: DEFAULT_RETRY_LIMIT,
      created_at: now,
      updated_at: now,
    };

    // ── Batch: create campaign + increment global counter ────────────────────
    const batch = db.batch();

    batch.set(campaignRef, campaignData);

    const statsRef = db.collection('platform_stats').doc('global');
    batch.set(
      statsRef,
      {
        total_campaigns: FieldValue.increment(1),
        last_updated: now,
      },
      { merge: true }
    );

    await batch.commit();

    return res.status(201).json({
      message: 'Campaign created successfully.',
      campaign_id: campaignRef.id,
      campaign_name,
      purpose,
      status: 'draft',
    });
  } catch (err) {
    console.error('[CampaignController] createCampaign error:', err.message);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to create campaign.',
    });
  }
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PUT /api/campaigns/:id
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * updateCampaign — Edits campaign configuration.
 *
 * Only allowed when the campaign status is `draft`. Once a campaign is
 * active/paused/completed, its script and targeting are frozen to ensure
 * consistency with in-progress or completed calls.
 */
const updateCampaign = async (req, res) => {
  try {
    const { uid } = req.user;
    const result = await fetchOwnedCampaign(req.params.id, uid, res);
    if (!result) return;

    const { ref, data } = result;

    // ── Lifecycle guard: only draft campaigns are editable ───────────────────
    if (data.status !== 'draft') {
      return res.status(409).json({
        error: 'Conflict',
        message: `Campaign cannot be edited while in "${data.status}" status. Only draft campaigns can be modified.`,
      });
    }

    // ── Apply update ─────────────────────────────────────────────────────────
    const updatePayload = {
      ...req.body,
      updated_at: FieldValue.serverTimestamp(),
    };

    await ref.update(updatePayload);

    // Re-read for the response so timestamps resolve.
    const updatedSnap = await ref.get();
    const updated = updatedSnap.data();

    return res.status(200).json({
      message: 'Campaign updated successfully.',
      campaign_id: req.params.id,
      campaign_name: updated.campaign_name,
      purpose: updated.purpose,
      script_guidelines: updated.script_guidelines,
      product_description: updated.product_description,
      target_audience: updated.target_audience,
      key_details: updated.key_details,
      status: updated.status,
      updated_at: updated.updated_at,
    });
  } catch (err) {
    console.error('[CampaignController] updateCampaign error:', err.message);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to update campaign.',
    });
  }
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// POST /api/campaigns/:id/start
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * startCampaign — Transitions a campaign to `active` status.
 *
 * Valid transitions:
 *   - draft  → active
 *   - paused → active (resume)
 *
 * Invalid transitions return 409 Conflict.
 */
const startCampaign = async (req, res) => {
  try {
    const { uid } = req.user;
    const result = await fetchOwnedCampaign(req.params.id, uid, res);
    if (!result) return;

    const { ref, data } = result;

    // ── Lifecycle guard ──────────────────────────────────────────────────────
    const allowedFrom = ['draft', 'paused'];
    if (!allowedFrom.includes(data.status)) {
      return res.status(409).json({
        error: 'Conflict',
        message: `Cannot start a campaign that is currently "${data.status}". Only draft or paused campaigns can be started.`,
      });
    }

    await ref.update({
      status: 'active',
      updated_at: FieldValue.serverTimestamp(),
    });

    return res.status(200).json({
      message: 'Campaign started.',
      campaign_id: req.params.id,
      status: 'active',
    });
  } catch (err) {
    console.error('[CampaignController] startCampaign error:', err.message);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to start campaign.',
    });
  }
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// POST /api/campaigns/:id/pause
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * pauseCampaign — Transitions a campaign to `paused` status.
 *
 * Valid transitions:
 *   - active → paused
 *
 * Invalid transitions return 409 Conflict.
 */
const pauseCampaign = async (req, res) => {
  try {
    const { uid } = req.user;
    const result = await fetchOwnedCampaign(req.params.id, uid, res);
    if (!result) return;

    const { ref, data } = result;

    // ── Lifecycle guard ──────────────────────────────────────────────────────
    if (data.status !== 'active') {
      return res.status(409).json({
        error: 'Conflict',
        message: `Cannot pause a campaign that is currently "${data.status}". Only active campaigns can be paused.`,
      });
    }

    await ref.update({
      status: 'paused',
      updated_at: FieldValue.serverTimestamp(),
    });

    return res.status(200).json({
      message: 'Campaign paused.',
      campaign_id: req.params.id,
      status: 'paused',
    });
  } catch (err) {
    console.error('[CampaignController] pauseCampaign error:', err.message);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to pause campaign.',
    });
  }
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /api/campaigns/:id/analytics
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * getAnalytics — Aggregates lead-level metrics for a specific campaign.
 *
 * Computed metrics:
 *   - total_leads, completed_calls, failed_calls
 *   - intent_breakdown : { INTERESTED, NOT_INTERESTED, CALLBACK }
 *   - call_status_breakdown : { pending, calling, completed, failed, retry_queued }
 *   - conversion_rate : (INTERESTED / completed_calls) * 100
 *   - avg_duration : average call_duration_sec across completed leads
 *
 * The query enforces both `campaign_id` AND `business_id` to guarantee
 * tenant isolation even at the analytics layer.
 */
const getAnalytics = async (req, res) => {
  try {
    const { uid } = req.user;

    // ── Verify campaign ownership first ──────────────────────────────────────
    const result = await fetchOwnedCampaign(req.params.id, uid, res);
    if (!result) return;

    // ── Query leads scoped to both campaign and business ─────────────────────
    const leadsSnap = await db
      .collection('leads')
      .where('campaign_id', '==', req.params.id)
      .where('business_id', '==', uid)
      .get();

    // ── Aggregate in memory ──────────────────────────────────────────────────
    let totalLeads = 0;
    let totalDuration = 0;
    let durationCount = 0;

    const intentBreakdown = {
      INTERESTED: 0,
      NOT_INTERESTED: 0,
      CALLBACK: 0,
    };

    const callStatusBreakdown = {
      pending: 0,
      email_sent: 0,
      widget_started: 0,
      qualified: 0,
      call_booked: 0,
      calling: 0,
      completed: 0,
      failed: 0,
      not_interested: 0,
      callback: 0,
      retry_queued: 0,
      email_bounced: 0,
    };

    leadsSnap.forEach((doc) => {
      const lead = doc.data();
      totalLeads++;

      // Call status counts — track every possible status.
      const status = lead.call_status || 'pending';
      if (status in callStatusBreakdown) {
        callStatusBreakdown[status]++;
      } else {
        callStatusBreakdown.pending++; // Unknown statuses default to pending.
      }

      // Intent counts (only meaningful for completed calls with extracted data).
      const intent = lead.extracted_data?.intent;
      if (intent && intent in intentBreakdown) {
        intentBreakdown[intent]++;
      }

      // Duration aggregation (only for calls that have a recorded duration).
      if (typeof lead.call_duration_sec === 'number' && lead.call_duration_sec > 0) {
        totalDuration += lead.call_duration_sec;
        durationCount++;
      }
    });

    // ── Derived metrics ──────────────────────────────────────────────────────
    const completedCalls = callStatusBreakdown.completed;
    const conversionRate =
      completedCalls > 0
        ? parseFloat(((intentBreakdown.INTERESTED / completedCalls) * 100).toFixed(2))
        : 0;

    const avgDuration =
      durationCount > 0
        ? parseFloat((totalDuration / durationCount).toFixed(1))
        : 0;

    return res.status(200).json({
      campaign_id: req.params.id,
      total_leads: totalLeads,
      total_calls: totalLeads,
      completed_calls: completedCalls,
      failed_calls: callStatusBreakdown.failed,
      qualified_leads: intentBreakdown.INTERESTED + intentBreakdown.CALLBACK,
      conversion_rate: conversionRate,
      avg_duration: avgDuration,
      intent_breakdown: intentBreakdown,
      call_status_breakdown: callStatusBreakdown,
      status_breakdown: callStatusBreakdown,
    });
  } catch (err) {
    console.error('[CampaignController] getAnalytics error:', err.message);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to retrieve campaign analytics.',
    });
  }
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// DELETE /api/campaigns/:id
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * deleteCampaign — Deletes a campaign and all its associated leads.
 */
const deleteCampaign = async (req, res) => {
  try {
    const { uid } = req.user;
    const result = await fetchOwnedCampaign(req.params.id, uid, res);
    if (!result) return;

    const { ref } = result;

    // Delete all leads for this campaign.
    const leadsSnap = await db
      .collection('leads')
      .where('campaign_id', '==', req.params.id)
      .where('business_id', '==', uid)
      .get();

    // Batch delete in chunks.
    const batchSize = 400;
    const docs = leadsSnap.docs;
    for (let i = 0; i < docs.length; i += batchSize) {
      const batch = db.batch();
      const chunk = docs.slice(i, i + batchSize);
      chunk.forEach((doc) => batch.delete(doc.ref));
      await batch.commit();
    }

    // Delete the campaign document.
    await ref.delete();

    return res.status(200).json({
      message: 'Campaign and all leads deleted.',
      campaign_id: req.params.id,
      leads_deleted: docs.length,
    });
  } catch (err) {
    console.error('[CampaignController] deleteCampaign error:', err.message);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to delete campaign.',
    });
  }
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// DELETE /api/campaigns/:id/leads
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * clearLeads — Deletes all leads for a campaign and resets the total_leads counter.
 */
const clearLeads = async (req, res) => {
  try {
    const { uid } = req.user;
    const result = await fetchOwnedCampaign(req.params.id, uid, res);
    if (!result) return;

    const { ref } = result;

    // Delete all leads.
    const leadsSnap = await db
      .collection('leads')
      .where('campaign_id', '==', req.params.id)
      .where('business_id', '==', uid)
      .get();

    const batchSize = 400;
    const docs = leadsSnap.docs;
    for (let i = 0; i < docs.length; i += batchSize) {
      const batch = db.batch();
      const chunk = docs.slice(i, i + batchSize);
      chunk.forEach((doc) => batch.delete(doc.ref));
      await batch.commit();
    }

    // Reset campaign counters.
    await ref.update({
      total_leads: 0,
      called_count: 0,
      updated_at: FieldValue.serverTimestamp(),
    });

    return res.status(200).json({
      message: 'All leads cleared.',
      campaign_id: req.params.id,
      leads_deleted: docs.length,
    });
  } catch (err) {
    console.error('[CampaignController] clearLeads error:', err.message);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to clear leads.',
    });
  }
};

module.exports = {
  listCampaigns,
  getCampaign,
  createCampaign,
  updateCampaign,
  startCampaign,
  pauseCampaign,
  getAnalytics,
  deleteCampaign,
  clearLeads,
};

