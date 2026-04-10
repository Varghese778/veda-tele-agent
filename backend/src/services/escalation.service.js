/**
 * @file backend/src/services/escalation.service.js
 * @description Intelligent Twilio escalation for qualified leads.
 *
 * Called by the bridge service when a WebRTC voice widget conversation
 * results in intent === 'INTERESTED'. Upgrades the lead to Stage 2
 * and initiates a Twilio phone call for deeper follow-up.
 *
 * Exports:
 *   - escalateToCall(leadId, widgetOutcome) — Escalates a qualified lead.
 */

const { admin, db } = require('../config/firebase');
const { twilioClient, TWILIO_NUMBER } = require('../config/twilio');

const FieldValue = admin.firestore.FieldValue;
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8080';

/**
 * escalateToCall — Transitions a lead from widget-qualified to Twilio phone call.
 *
 * Flow:
 *   1. Updates lead status to 'qualified' with widget outcome data.
 *   2. Updates campaign analytics (qualified_count++).
 *   3. If Twilio is configured, initiates an outbound call.
 *   4. Uses the existing /media-stream/:leadId bridge (Twilio → Gemini).
 *
 * @param {string} leadId
 * @param {object} widgetOutcome — { intent, summary, interest_level, name, next_action }
 * @returns {Promise<boolean>} — true if escalation succeeded.
 */
const escalateToCall = async (leadId, widgetOutcome = {}) => {
  if (!leadId) return false;

  try {
    const leadRef = db.collection('leads').doc(leadId);
    const leadSnap = await leadRef.get();

    if (!leadSnap.exists) {
      console.error(`[Escalation] Lead ${leadId} not found.`);
      return false;
    }

    const lead = leadSnap.data();

    // ── 1. Update lead with widget qualification data ────────────────────────
    await leadRef.update({
      call_status: 'qualified',
      widget_outcome: widgetOutcome,
      widget_completed_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
    });

    console.log(`[Escalation] Lead ${leadId} qualified. Intent: ${widgetOutcome.intent}`);

    // ── 2. Update campaign qualified count ───────────────────────────────────
    if (lead.campaign_id) {
      await db.collection('campaigns').doc(lead.campaign_id).update({
        qualified_count: FieldValue.increment(1),
        updated_at: FieldValue.serverTimestamp(),
      });
    }

    // ── 3. Initiate Twilio call if configured ────────────────────────────────
    if (!twilioClient) {
      console.warn(
        `[Escalation] Twilio not configured. Lead ${leadId} marked as qualified ` +
        `but no phone call initiated. Dashboard shows "Ready for manual follow-up".`
      );
      return true; // Still a success — lead is qualified for manual outreach.
    }

    if (!lead.phone_number) {
      console.warn(`[Escalation] Lead ${leadId} has no phone number. Skipping call.`);
      return true;
    }

    // Update status to call_booked before initiating.
    await leadRef.update({
      call_status: 'call_booked',
      updated_at: FieldValue.serverTimestamp(),
    });

    // Initiate the Twilio call using the existing media bridge.
    const call = await twilioClient.calls.create({
      to: lead.phone_number,
      from: TWILIO_NUMBER,
      url: `${BACKEND_URL}/twilio/twiml/${leadId}`,
      statusCallback: `${BACKEND_URL}/twilio/status/${leadId}`,
      statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
      record: true,
      recordingStatusCallback: `${BACKEND_URL}/twilio/recording/${leadId}`,
    });

    // Update with Twilio metadata.
    await leadRef.update({
      call_status: 'calling',
      attempt_count: FieldValue.increment(1),
      twilio_call_sid: call.sid,
      called_at: FieldValue.serverTimestamp(),
      last_attempt_at: FieldValue.serverTimestamp(),
    });

    console.log(`[Escalation] Twilio call initiated for lead=${leadId}, sid=${call.sid}`);
    return true;
  } catch (err) {
    console.error(`[Escalation] Error for lead=${leadId}:`, err.message);
    return false;
  }
};

module.exports = {
  escalateToCall,
};
