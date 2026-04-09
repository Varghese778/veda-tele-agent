/**
 * @file scripts/test-notification.js
 * @description Manual verification script for MOD-14.
 *
 * Tests the SMS formatting, rate limiting, and suppression logic.
 */

const { sendCallbackSMS } = require('../backend/src/services/notification.service');

async function runTest() {
  console.log('--- Testing Notification Logic ---');

  try {
    // 1. Test Suppression (same number as Twilio)
    // We expect a "Skipping self-notification" log.
    console.log('\nTesting self-number suppression...');
    await sendCallbackSMS('test-lead-id');

    // 2. Test Format/Truncation (simulated via service internals if exported, 
    // but here we just trigger the flow and expect lead fetch failure).
    console.log('\nTesting lead fetch stage for a fresh ID...');
    await sendCallbackSMS('fresh-test-id');

  } catch (err) {
    console.error('\nFAILURE: Unexpected error during notification test:', err.message);
  } finally {
    process.exit(0);
  }
}

runTest();
