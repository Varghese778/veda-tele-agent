/**
 * @file backend/src/utils/activity.logger.js
 * @description Lightweight real-time activity logger for the dashboard Live Monitor.
 *
 * Writes short log entries to `campaign_activity/{campaignId}/logs/{autoId}`.
 * The dashboard polls the last N entries to show real-time agent status.
 *
 * Entries auto-expire: the dashboard only shows the latest 50.
 * Old entries can be pruned periodically or on campaign delete.
 */

const { db } = require('../config/firebase');

/**
 * logActivity — Writes a single activity entry to Firestore.
 *
 * @param {string} campaignId — The campaign this activity belongs to.
 * @param {string} message    — Short, human-readable log line (e.g. "Email sent to mark@example.com").
 * @param {string} [type]     — Category: 'email', 'call', 'system', 'ai'. Defaults to 'system'.
 */
const logActivity = async (campaignId, message, type = 'system') => {
  if (!campaignId || !message) return;

  try {
    await db
      .collection('campaign_activity')
      .doc(campaignId)
      .collection('logs')
      .add({
        message,
        type,
        timestamp: new Date().toISOString(),
      });
  } catch (err) {
    // Non-critical — never crash the caller.
    console.warn('[ActivityLogger] Write failed:', err.message);
  }
};

module.exports = { logActivity };
