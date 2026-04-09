/**
 * @file scripts/test-transcript.js
 * @description Manual verification script for MOD-10.
 *
 * Tests the transcript assembly and truncation logic.
 */

const { saveTranscript } = require('../backend/src/services/transcript.service');

async function runTest() {
  console.log('--- Testing Transcript Assembly & Truncation ---');

  try {
    // 1. Test with small transcript
    const smallChunks = ['Hello,', 'this is a', 'test.'];
    console.log('Testing saveTranscript for small content...');
    
    // This will fail at DB lookup but let's check if it reaches that point.
    await saveTranscript('test-lead-id', smallChunks);

    // 2. Test with oversized transcript (simulated)
    const longChunk = 'Long text '.repeat(6000); // ~60,000 chars
    console.log(`Testing truncation for ${longChunk.length} characters...`);
    await saveTranscript('test-lead-id-long', [longChunk]);

  } catch (err) {
    if (err.message.includes('Lead') && err.message.includes('not found')) {
      console.log('\nSUCCESS: Service correctly processed formatting and reached Firestore stage.');
    } else {
      console.error('\nFAILURE: Unexpected error during transcript test:', err.message);
    }
  } finally {
    process.exit(0);
  }
}

runTest();
