/**
 * @file backend/src/config/twilio.js
 * @description Twilio REST client singleton (MOD-05).
 *
 * Initializes the Twilio client once from environment variables and exports
 * it for reuse across the orchestrator and webhook modules.
 *
 * Credential source:
 *   - Local dev: TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN from .env.local
 *   - Production: Injected via Cloud Run --set-secrets from Secret Manager
 *
 * The TWILIO_NUMBER (outbound caller ID) is also exported for convenience.
 */

const twilio = require('twilio');

const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_NUMBER = process.env.TWILIO_NUMBER;

// ── Lazy initialization ──────────────────────────────────────────────────────
// The Twilio client is only created when the env vars are present.
// This allows the server to boot in dev/test environments without Twilio
// credentials (the orchestrator will log a warning and skip calls).
let twilioClient = null;

if (TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN) {
  twilioClient = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
} else {
  console.warn(
    '[TwilioConfig] TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN not set. ' +
    'Twilio client will not be initialized. Call initiation will be skipped.'
  );
}

module.exports = {
  twilioClient,
  TWILIO_NUMBER,
  TWILIO_AUTH_TOKEN,
};
