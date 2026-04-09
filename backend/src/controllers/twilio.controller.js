/**
 * @file backend/src/controllers/twilio.controller.js
 * @description Webhook controller for the TwilioWebhookModule (MOD-06).
 *
 * This module is a thin, secure adapter between Twilio's HTTP callbacks
 * and the backend's internal services. It does NOT write directly to
 * Firestore — all state changes are delegated to:
 *   - MOD-05 orchestrator.service.js (call status transitions)
 *   - MOD-11 recording.service.js   (recording storage)
 *
 * Exports:
 *   - getTwiML          : Returns TwiML XML that opens a Media Stream WebSocket.
 *   - handleStatus      : Parses Twilio status callbacks and delegates to MOD-05.
 *   - handleRecording   : Parses Twilio recording callbacks and delegates to MOD-11.
 *   - validateTwilioSignature : Middleware that verifies X-Twilio-Signature.
 */

const twilio = require('twilio');
const { TWILIO_AUTH_TOKEN } = require('../config/twilio');
const { handleCallStatusUpdate } = require('../services/orchestrator.service');
const { handleRecordingCallback } = require('../services/recording.service');

/**
 * Backend URL for constructing public webhook and WebSocket URLs.
 * In production this is the Cloud Run service URL.
 */
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8080';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Middleware — Twilio Signature Validation
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * validateTwilioSignature — Express middleware that verifies the
 * X-Twilio-Signature header on incoming POST webhooks.
 *
 * URL reconstruction:
 *   Twilio signs the request using the PUBLIC URL it hit (the Cloud Run URL),
 *   not the internal container URL. We reconstruct the full public URL from
 *   BACKEND_URL + req.originalUrl so the signature matches.
 *
 * In development (NODE_ENV !== 'production'), validation is skipped to allow
 * testing with tools like curl, Postman, or ngrok without signature issues.
 *
 * @param {import('express').Request}  req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
const validateTwilioSignature = (req, res, next) => {
  // Skip validation in non-production environments for dev convenience.
  if (process.env.NODE_ENV !== 'production') {
    return next();
  }

  if (!TWILIO_AUTH_TOKEN) {
    console.error('[TwilioController] TWILIO_AUTH_TOKEN not set. Cannot validate signature.');
    return res.status(500).send('Server configuration error.');
  }

  const signature = req.headers['x-twilio-signature'];
  if (!signature) {
    return res.status(403).json({
      error: 'Forbidden',
      message: 'Missing Twilio signature.',
    });
  }

  // Reconstruct the full public URL that Twilio signed.
  const fullUrl = `${BACKEND_URL}${req.originalUrl}`;

  // Twilio sends form-encoded POST data — use req.body as the params.
  const isValid = twilio.validateRequest(
    TWILIO_AUTH_TOKEN,
    signature,
    fullUrl,
    req.body || {}
  );

  if (!isValid) {
    console.warn('[TwilioController] Invalid Twilio signature rejected.');
    return res.status(403).json({
      error: 'Forbidden',
      message: 'Invalid Twilio signature.',
    });
  }

  return next();
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /twilio/twiml/:lead_id
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * getTwiML — Returns TwiML XML that instructs Twilio to open a Media Stream
 * WebSocket connection to the backend's audio bridge.
 *
 * The TwiML response:
 *   <Response>
 *     <Connect>
 *       <Stream url="wss://{host}/media-stream/{lead_id}" track="both_tracks">
 *         <Parameter name="lead_id" value="{lead_id}"/>
 *       </Stream>
 *     </Connect>
 *   </Response>
 *
 * Authentication:
 *   This endpoint does NOT use Firebase auth because Twilio fetches it
 *   directly as an unsigned GET request. Security relies on the lead_id
 *   being unguessable (Firestore auto-generated ID).
 *
 * @param {import('express').Request}  req
 * @param {import('express').Response} res
 */
const getTwiML = (req, res) => {
  try {
    const { lead_id } = req.params;

    // ── Validate lead_id presence ────────────────────────────────────────────
    if (!lead_id || typeof lead_id !== 'string' || lead_id.trim().length === 0) {
      return res.status(400).type('text/xml').send(
        '<?xml version="1.0" encoding="UTF-8"?><Response><Say>An error occurred.</Say></Response>'
      );
    }

    // ── Derive WebSocket host from BACKEND_URL ───────────────────────────────
    // Replace http(s):// with wss:// for the WebSocket URL.
    const wsUrl = BACKEND_URL
      .replace(/^https?:\/\//, 'wss://')
      .replace(/\/$/, ''); // Remove trailing slash if present.

    // ── Build TwiML ──────────────────────────────────────────────────────────
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="${wsUrl}/media-stream/${lead_id}" track="both_tracks">
      <Parameter name="lead_id" value="${lead_id}"/>
    </Stream>
  </Connect>
</Response>`;

    res.type('text/xml').send(twiml);
  } catch (err) {
    console.error('[TwilioController] getTwiML error:', err.message);
    res.status(500).type('text/xml').send(
      '<?xml version="1.0" encoding="UTF-8"?><Response><Say>An error occurred.</Say></Response>'
    );
  }
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// POST /twilio/status/:lead_id
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * handleStatus — Processes Twilio call status webhook callbacks.
 *
 * Twilio sends form-encoded POST data with fields including:
 *   - CallSid     : Unique call identifier.
 *   - CallStatus  : e.g., "initiated", "ringing", "in-progress", "completed",
 *                   "no-answer", "busy", "failed", "canceled".
 *   - ErrorCode   : Present when CallStatus is "failed".
 *
 * All state logic is delegated to handleCallStatusUpdate from MOD-05.
 * This controller is a thin adapter.
 *
 * @param {import('express').Request}  req
 * @param {import('express').Response} res
 */
const handleStatus = async (req, res) => {
  try {
    const { lead_id } = req.params;

    if (!lead_id) {
      return res.status(400).json({ error: 'Missing lead_id parameter.' });
    }

    const { CallStatus, CallSid, ErrorCode } = req.body || {};

    if (!CallStatus) {
      console.warn(`[TwilioController] Status callback missing CallStatus for lead=${lead_id}`);
      return res.status(200).json({ received: true });
    }

    // Delegate all state transition logic to the orchestrator.
    await handleCallStatusUpdate(lead_id, CallStatus, CallSid, ErrorCode || null);

    return res.status(200).json({ received: true });
  } catch (err) {
    console.error(`[TwilioController] handleStatus error for lead=${req.params.lead_id}:`, err.message);
    // Always return 200 to Twilio to prevent aggressive retries.
    return res.status(200).json({ received: true, error: 'Internal processing error.' });
  }
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// POST /twilio/recording/:lead_id
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * handleRecording — Processes Twilio recording-ready webhook callbacks.
 *
 * Twilio sends form-encoded POST data with fields including:
 *   - RecordingSid       : Unique recording identifier.
 *   - RecordingUrl       : URL to fetch the recording (needs auth).
 *   - RecordingDuration  : Duration in seconds as a string.
 *   - CallSid            : Related call identifier.
 *
 * All storage logic is delegated to handleRecordingCallback from MOD-11.
 *
 * @param {import('express').Request}  req
 * @param {import('express').Response} res
 */
const handleRecording = async (req, res) => {
  try {
    const { lead_id } = req.params;

    if (!lead_id) {
      return res.status(400).json({ error: 'Missing lead_id parameter.' });
    }

    // Delegate to the recording service (MOD-11).
    await handleRecordingCallback(lead_id, req.body || {});

    return res.status(200).json({ received: true });
  } catch (err) {
    console.error(`[TwilioController] handleRecording error for lead=${req.params.lead_id}:`, err.message);
    // Always return 200 to Twilio to prevent aggressive retries.
    return res.status(200).json({ received: true, error: 'Internal processing error.' });
  }
};

module.exports = {
  getTwiML,
  handleStatus,
  handleRecording,
  validateTwilioSignature,
};
