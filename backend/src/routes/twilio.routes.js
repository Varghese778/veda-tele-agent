/**
 * @file backend/src/routes/twilio.routes.js
 * @description Twilio webhook routes (MOD-06).
 *
 * These routes handle inbound HTTP callbacks from Twilio during the call
 * lifecycle. They are NOT behind Firebase auth — Twilio calls them directly.
 * Security is enforced via X-Twilio-Signature validation on POST routes.
 *
 * Mounts:
 *   GET  /twilio/twiml/:lead_id       →  getTwiML (unsigned — Twilio fetches directly)
 *   POST /twilio/status/:lead_id      →  validateSignature → handleStatus
 *   POST /twilio/recording/:lead_id   →  validateSignature → handleRecording
 *
 * Important:
 *   Twilio sends POST bodies as application/x-www-form-urlencoded, not JSON.
 *   The router applies express.urlencoded() before signature validation so
 *   the body is parsed when the signature middleware reconstructs the hash.
 */

const { Router } = require('express');
const express = require('express');
const {
  getTwiML,
  handleStatus,
  handleRecording,
  validateTwilioSignature,
} = require('../controllers/twilio.controller');

const router = Router();

// ── Parse Twilio form-encoded POST bodies ────────────────────────────────────
// Must be applied BEFORE signature validation — Twilio signs the parsed params.
router.use(express.urlencoded({ extended: false }));

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Routes
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// ── GET /twilio/twiml/:lead_id ───────────────────────────────────────────────
// Returns TwiML XML that opens the media bridge WebSocket.
// No Firebase auth — Twilio fetches this directly as an unsigned GET.
// No Twilio signature validation — GET requests are not signed by Twilio.
router.get('/twiml/:lead_id', getTwiML);

// ── POST /twilio/status/:lead_id ─────────────────────────────────────────────
// Call status webhook (initiated, ringing, completed, failed, etc.).
// Signature validated in production. Delegates to MOD-05.
router.post('/status/:lead_id', validateTwilioSignature, handleStatus);

// ── POST /twilio/recording/:lead_id ──────────────────────────────────────────
// Recording ready webhook. Signature validated in production.
// Delegates to MOD-11 recording service.
router.post('/recording/:lead_id', validateTwilioSignature, handleRecording);

module.exports = router;
