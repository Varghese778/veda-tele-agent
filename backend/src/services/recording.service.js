/**
 * @file backend/src/services/recording.service.js
 * @description MOD-11 — RecordingModule Service.
 *
 * Processes Twilio recording-ready webhooks and persists recording metadata.
 */

const { db } = require('../config/firebase');

const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;

/**
 * handleRecordingCallback — Processes a Twilio recording-ready webhook payload.
 *
 * @param {string} leadId
 * @param {object} payload — Twilio webhook body (Form-data)
 */
const handleRecordingCallback = async (leadId, payload) => {
  try {
    const { RecordingSid, RecordingUrl, RecordingDuration } = payload;

    // ── 1. Validate Payload ──────────────────────────────────────────────────
    if (!RecordingSid) {
      console.warn(`[RecordingService] Missing RecordingSid for lead=${leadId}. Skipping.`);
      return;
    }

    const duration = parseInt(RecordingDuration, 10);
    if (isNaN(duration) || duration <= 0) {
      console.warn(`[RecordingService] Invalid duration (${RecordingDuration}) for lead=${leadId}. Skipping.`);
      return;
    }

    // ── 2. Verify Lead Existence ─────────────────────────────────────────────
    // Fetch doc to ensure lead exists and to log context for debugging.
    const leadSnap = await db.collection('leads').doc(leadId).get();
    if (!leadSnap.exists) {
      console.warn(`[RecordingService] Lead ${leadId} not found in Firestore. Orphaned recording?`);
      return;
    }

    // ── 3. Build Authenticated Playback URL ──────────────────────────────────
    // Note: This URL requires Basic Auth (SID:Token) to fetch successfully.
    // We construct the MP3 version for better browser compatibility.
    const recordingUrl = TWILIO_ACCOUNT_SID
      ? `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Recordings/${RecordingSid}.mp3`
      : `${RecordingUrl}.mp3`;

    // ── 4. Update Firestore ──────────────────────────────────────────────────
    await db.collection('leads').doc(leadId).update({
      recording_url: recordingUrl,
      call_duration_sec: duration,
      updated_at: new Date()
    });

    console.log(`[RecordingService] Metadata saved for lead=${leadId}: dur=${duration}s, sid=${RecordingSid}`);
  } catch (err) {
    // Webhook paths should not throw to prevent Twilio infinite retries.
    console.error(`[RecordingService] Callback failure for lead=${leadId}:`, err.message);
  }
};

module.exports = {
  handleRecordingCallback,
};
