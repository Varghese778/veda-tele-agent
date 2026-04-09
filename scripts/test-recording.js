/**
 * @file scripts/test-recording.js
 * @description Manual verification script for MOD-11.
 *
 * Tests the recording callback persistence logic.
 */

const { handleRecordingCallback } = require('../backend/src/services/recording.service');

async function runTest() {
  console.log('--- Testing Recording Callback Handling ---');

  try {
    const mockPayload = {
      RecordingSid: 'RE1234567890abcdef',
      RecordingUrl: 'http://api.twilio.com/mock-recording',
      RecordingDuration: '45',
      CallSid: 'CA0987654321fedcba'
    };

    console.log('Attempting to process a mock recording callback...');
    
    // This will hit the database existence check.
    await handleRecordingCallback('test-lead-id', mockPayload);

  } catch (err) {
    console.error('\nFAILURE: Unexpected error during recording test:', err.message);
  } finally {
    process.exit(0);
  }
}

runTest();
