/**
 * @file scripts/test-prompt-builder.js
 * @description Manual verification script for MOD-08.
 */

const { buildPrompt } = require('../backend/src/services/prompt.builder');

async function runTest() {
  console.log('--- Testing Prompt Builder (Graceful Fallback) ---');
  
  try {
    // 1. Test with a non-existent lead ID (should trigger fallbacks)
    console.log('Attempting to build prompt for "non-existent-id"...');
    const result = await buildPrompt('non-existent-id');
    
    console.log('\n--- ASSEMBLED PROMPT ---');
    console.log(result.systemPrompt);
    console.log('--- END PROMPT ---\n');

    // 2. Test Cache (calling again)
    console.log('Attempting second call for "non-existent-id" (should hit cache)...');
    const result2 = await buildPrompt('non-existent-id');
    console.log('Second call processed successfully.');

    // 3. Basic validation of content
    const containsVeda = result.systemPrompt.includes('Veda');
    const containsPlaceholder = result.systemPrompt.includes('{');
    
    console.log('\n--- Validation Result ---');
    console.log(`Contains name "Veda": ${containsVeda}`);
    console.log(`Contains unreplaced placeholders: ${containsPlaceholder}`);
    
    if (containsVeda && !containsPlaceholder) {
      console.log('\nSUCCESS: Prompt builder is functioning as expected.');
    } else {
      console.log('\nFAILURE: Prompt builder logic issue detected.');
    }

  } catch (err) {
    console.error('Test failed with error:', err.message);
  } finally {
    process.exit(0);
  }
}

runTest();
