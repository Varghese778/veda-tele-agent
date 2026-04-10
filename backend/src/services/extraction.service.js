/**
 * @file backend/src/services/extraction.service.js
 * @description MOD-09 — DataExtractionModule.
 *
 * Processes the log_call_outcome function call from Gemini and persists
 * the structured call results to Firestore atomically.
 *
 * Key Responsibilities:
 *   - Normalizing and validating AI-generated outcome data.
 *   - Atomic Firestore transaction for lead status and campaign/global counters.
 *   - Idempotency protection to prevent double-counting.
 *   - Triggering downstream notifications (e.g., for callbacks).
 *   - 1x automatic retry on transaction failure.
 */

const { db, admin } = require('../config/firebase');
const { sendCallbackSMS } = require('./notification.service');

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Constants & Allowed Enums
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const ALLOWED_INTEREST = ['High', 'Medium', 'Low'];
const ALLOWED_INTENT = ['INTERESTED', 'NOT_INTERESTED', 'CALLBACK'];

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * normalizeArgs — Sanitizes and applies defaults to Gemini output.
 */
const normalizeArgs = (args, fallbackName = 'Customer') => {
  const normalized = {
    name: (args.name || fallbackName).toString().trim(),
    interest_level: ALLOWED_INTEREST.includes(args.interest_level) ? args.interest_level : 'Low',
    intent: ALLOWED_INTENT.includes(args.intent) ? args.intent : 'NOT_INTERESTED',
    summary: (args.summary || 'No summary provided.').toString().trim(),
    next_action: (args.next_action || '').toString().trim(),
  };

  // Derive next_action if missing based on intent
  if (!normalized.next_action) {
    switch (normalized.intent) {
      case 'INTERESTED':
        normalized.next_action = 'Follow up with the customer';
        break;
      case 'CALLBACK':
        normalized.next_action = 'Call back at the agreed time';
        break;
      default:
        normalized.next_action = 'No further action required';
    }
  }

  return normalized;
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Core Logic
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * processOutcome — Persists the call result atomically.
 * 
 * @param {string} leadId
 * @param {Record<string, any>} args
 * @param {number} attempt — Internal retry tracker
 */
const processOutcome = async (leadId, args, attempt = 1) => {
  if (!leadId) throw new Error('[ExtractionService] leadId is required.');

  try {
    await db.runTransaction(async (transaction) => {
      const leadRef = db.collection('leads').doc(leadId);
      const leadSnap = await transaction.get(leadRef);

      if (!leadSnap.exists) {
        throw new Error(`Lead ${leadId} not found.`);
      }

      const leadData = leadSnap.data();

      // 1. Track if this is the first completion (for counter increments)
      const isFirstCompletion = leadData.call_status !== 'completed';

      // 2. Normalize arguments
      const normalized = normalizeArgs(args, leadData.customer_name);

      // 3. Prepare references
      const campaignRef = db.collection('campaigns').doc(leadData.campaign_id);
      const statsRef = db.collection('platform_stats').doc('global');

      // 4. Perform Atomic Updates
      // a) Update Lead
      transaction.update(leadRef, {
        extracted_data: normalized,
        call_status: 'completed',
        completed_at: admin.firestore.FieldValue.serverTimestamp(),
      });

      // b) Increment Campaign counter (only on first completion)
      if (isFirstCompletion) {
        transaction.update(campaignRef, {
          called_count: admin.firestore.FieldValue.increment(1),
          updated_at: admin.firestore.FieldValue.serverTimestamp(),
        });
      }

      // c) Update Platform stats (only on first completion)
      if (isFirstCompletion) {
        const statsUpdate = {
          total_calls_made: admin.firestore.FieldValue.increment(1),
          last_updated: admin.firestore.FieldValue.serverTimestamp(),
        };
        if (normalized.intent === 'INTERESTED') {
          statsUpdate.total_leads_qualified = admin.firestore.FieldValue.increment(1);
        }
        transaction.update(statsRef, statsUpdate);
      }

      console.log(`[ExtractionService] Outcome persisted for lead=${leadId}, intent=${normalized.intent}`);

      // 5. Post-Commit Triggers (Side effects after transaction finish)
      // Note: We return the intent so the caller can trigger notifications.
      return normalized.intent;
    }).then(async (intent) => {
      // Logic after transaction COMMITS successfully
      if (intent === 'CALLBACK') {
        sendCallbackSMS(leadId).catch(err => {
          console.error(`[ExtractionService] Notification trigger failed for ${leadId}:`, err.message);
        });
      }
    });

  } catch (err) {
    if (attempt < 2) {
      console.warn(`[ExtractionService] Transaction failed for lead=${leadId}. Retrying (1/1) in 1s... Error: ${err.message}`);
      await new Promise(resolve => setTimeout(resolve, 1000));
      return processOutcome(leadId, args, attempt + 1);
    }
    
    console.error(`[ExtractionService] Permanent failure for lead=${leadId} after ${attempt} attempts:`, err.message);
    throw new Error('Failed to persist call outcome after retries.');
  }
};

module.exports = {
  processOutcome,
};
