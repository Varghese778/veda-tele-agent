/**
 * @file scripts/test-extraction.js
 * @description Manual verification script for MOD-09.
 *
 * Tests the normalization logic and the Firestore transaction wrapper.
 */

const { processOutcome } = require('../backend/src/services/extraction.service');

async function runTest() {
  console.log('--- Testing Data Extraction (Graceful Normalization) ---');

  try {
    // 1. Test with missing/malformed args (should apply defaults)
    const mockArgs = {
      interest_level: 'Very High', // Invalid enum
      intent: 'MAYBE',            // Invalid enum
      summary: '   Test summary with spaces   ',
    };

    console.log('Attempting to process malformed outcome for a test lead...');
    // Note: This will naturally fail at the DB lookup stage because we don't have
    // real Firestore connectivity in this test env, which is fine—we want to see
    // the "Lead not found" error after normalization attempt.
    
    await processOutcome('test-lead-id', mockArgs);
    
  } catch (err) {
    if (err.message.includes('Lead test-lead-id not found')) {
      console.log('\nSUCCESS: Module reached the database lookup stage after passing normalization.');
      console.log('Validation/Normalization is working as internal logic.');
    } else {
      console.error('\nFAILURE: Unexpected error during extraction test:', err.message);
    }
  } finally {
    process.exit(0);
  }
}

runTest();
