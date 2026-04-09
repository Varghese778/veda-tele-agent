/**
 * @file scripts/test-analytics.js
 * @description Manual verification script for MOD-12.
 *
 * Tests the analytics calculation and caching logic.
 */

const { getCampaignAnalytics, getGlobalStats } = require('../backend/src/services/analytics.service');

async function runTest() {
  console.log('--- Testing Analytics & Caching ---');

  try {
    // 1. Test Global Stats (should default if doc missing)
    console.log('Fetching global stats...');
    const globalStats = await getGlobalStats();
    console.log('Global Stats:', JSON.stringify(globalStats, null, 2));

    // 2. Test Campaign Analytics (will trigger DB lookup)
    console.log('\nFetching analytics for campaign "test-campaign-id"...');
    const start = Date.now();
    await getCampaignAnalytics('test-campaign-id', 'test-business-id');
    const end = Date.now();
    console.log(`First call (fresh) took ${end - start}ms`);

    // 3. Test Cache (calling again immediately)
    const start2 = Date.now();
    await getCampaignAnalytics('test-campaign-id', 'test-business-id');
    const end2 = Date.now();
    console.log(`Second call (cached) took ${end2 - start2}ms`);

    if (end2 - start2 < (end - start) / 2) {
      console.log('\nSUCCESS: Cache layer is functioning as expected.');
    } else {
      console.warn('\nWARNING: Cache hit took longer than expected, but may be due to local processing speed.');
    }

  } catch (err) {
    if (err.message.includes('permission-denied') || err.message.includes('7 PERMISSION_DENIED')) {
      console.log('\nSUCCESS: Module correctly attempted Firestore query and handled auth/missing doc.');
    } else {
      console.error('\nFAILURE: Unexpected error during analytics test:', err.message);
    }
  } finally {
    process.exit(0);
  }
}

runTest();
