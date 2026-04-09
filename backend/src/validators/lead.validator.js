/**
 * @file backend/src/validators/lead.validator.js
 * @description Validation helpers for individual lead rows (MOD-04).
 *
 * Exports:
 *   - E164_REGEX         : Regular expression for E.164 phone number format.
 *   - MAX_UPLOAD_ROWS    : Maximum rows allowed per CSV upload (500).
 *   - FIRESTORE_BATCH_LIMIT : Maximum docs per Firestore batch commit (499).
 *   - validateLeadRow    : Validates and sanitizes a single parsed CSV row.
 *
 * Design note:
 *   Row-level validation is done imperatively (not via Joi) because we need
 *   per-row error tracking with row numbers, which doesn't map cleanly to
 *   Joi's schema-level validation pattern.
 */

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Constants
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * E.164 international phone number format.
 * Starts with `+`, followed by country code (1-9), then 7-14 digits.
 * Examples: +919876543210, +14155552671
 */
const E164_REGEX = /^\+[1-9]\d{7,14}$/;

/** Maximum rows allowed per CSV upload (PRS §9, MOD-04 §15). */
const MAX_UPLOAD_ROWS = 500;

/** Firestore batch write limit (must leave room for auxiliary writes). */
const FIRESTORE_BATCH_LIMIT = 499;

/** Maximum character length for customer_name. */
const MAX_NAME_LENGTH = 200;

/** Maximum character length for email. */
const MAX_EMAIL_LENGTH = 254;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Row Validator
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * validateLeadRow — Validates and sanitizes a single CSV row.
 *
 * @param {object} row — Parsed CSV row { customer_name, phone_number, email }.
 * @param {number} rowNumber — 1-based row number for error reporting.
 * @returns {{ valid: boolean, sanitized: object | null, reason: string | null }}
 */
const validateLeadRow = (row, rowNumber) => {
  // ── customer_name: required, trimmed, length-checked ───────────────────────
  const name = (row.customer_name || '').trim();
  if (!name) {
    return { valid: false, sanitized: null, reason: 'Missing customer_name' };
  }
  if (name.length > MAX_NAME_LENGTH) {
    return { valid: false, sanitized: null, reason: `customer_name exceeds ${MAX_NAME_LENGTH} characters` };
  }

  // ── phone_number: required, E.164 format ───────────────────────────────────
  const phone = (row.phone_number || '').trim();
  if (!phone) {
    return { valid: false, sanitized: null, reason: 'Missing phone_number' };
  }
  if (!E164_REGEX.test(phone)) {
    return { valid: false, sanitized: null, reason: 'Invalid E.164 phone number format' };
  }

  // ── email: optional, basic sanity check ────────────────────────────────────
  let email = (row.email || '').trim();
  if (email && email.length > MAX_EMAIL_LENGTH) {
    return { valid: false, sanitized: null, reason: `email exceeds ${MAX_EMAIL_LENGTH} characters` };
  }
  // Simple "@" check — not full RFC 5322 validation, but catches garbage.
  if (email && !email.includes('@')) {
    return { valid: false, sanitized: null, reason: 'Invalid email format' };
  }

  return {
    valid: true,
    sanitized: {
      customer_name: name,
      phone_number: phone,
      email: email || '',
    },
    reason: null,
  };
};

module.exports = {
  E164_REGEX,
  MAX_UPLOAD_ROWS,
  FIRESTORE_BATCH_LIMIT,
  validateLeadRow,
};
