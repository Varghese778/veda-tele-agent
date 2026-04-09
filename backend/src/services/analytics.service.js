/**
 * @file backend/src/services/analytics.service.js
 * @description MOD-12 — AnalyticsDashboardModule Service.
 *
 * Provides aggregated business and platform performance metrics.
 * Includes a 30-second in-memory TTL cache to optimize Firestore reads.
 */

const { db, admin } = require('../config/firebase');

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Cache Layer
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const ANALYTICS_CACHE_TTL_MS = 30 * 1000; // 30 seconds
const cache = new Map(); // Key: 'type:id', Value: { data, expiresAt }

/**
 * getCachedData — Retrieves data if not expired.
 * @param {string} key
 */
const getCachedData = (key) => {
  const entry = cache.get(key);
  if (entry && Date.now() < entry.expiresAt) return entry.data;
  return null;
};

/**
 * setCacheData — Stores data with TTL.
 * @param {string} key
 * @param {any} data
 */
const setCacheData = (key, data) => {
  cache.set(key, {
    data,
    expiresAt: Date.now() + ANALYTICS_CACHE_TTL_MS
  });
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Core Logic
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * calculateAnalytics — Unified logic for aggregating lead data.
 * Works for both a single campaign and an entire business.
 * 
 * Aggregation strategy: Query leads and reduce in-memory for breakdowns.
 * Note: For 24h MVP, we use query + reduce. For large scale, we'd use 
 * Firestore count() aggregations or a dedicated warehouse.
 * 
 * @param {FirebaseFirestore.Query} baseQuery
 */
const calculateAnalytics = async (baseQuery) => {
  const snapshot = await baseQuery.get();
  
  const leads = snapshot.docs.map(doc => doc.data());
  const total = leads.length;

  if (total === 0) {
    return {
      total_calls: 0,
      qualified_leads: 0,
      conversion_rate: 0,
      average_duration_sec: 0,
      intent_breakdown: { INTERESTED: 0, NOT_INTERESTED: 0, CALLBACK: 0 },
      status_breakdown: { pending: 0, calling: 0, completed: 0, failed: 0 }
    };
  }

  const intentBreakdown = { INTERESTED: 0, NOT_INTERESTED: 0, CALLBACK: 0 };
  const statusBreakdown = { pending: 0, calling: 0, completed: 0, failed: 0 };
  let qualifiedCount = 0;
  let totalDuration = 0;
  let durationCount = 0;

  leads.forEach(lead => {
    // Intent Breakdown
    const intent = lead.extracted_data?.intent || 'NOT_INTERESTED';
    intentBreakdown[intent] = (intentBreakdown[intent] || 0) + 1;
    if (intent === 'INTERESTED') qualifiedCount++;

    // Status Breakdown
    const status = lead.call_status || 'pending';
    statusBreakdown[status] = (statusBreakdown[status] || 0) + 1;

    // Duration
    if (lead.call_duration_sec && lead.call_duration_sec > 0) {
      totalDuration += lead.call_duration_sec;
      durationCount++;
    }
  });

  return {
    total_calls: total,
    qualified_leads: qualifiedCount,
    conversion_rate: parseFloat(((qualifiedCount / total) * 100).toFixed(2)),
    average_duration_sec: durationCount > 0 ? parseFloat((totalDuration / durationCount).toFixed(2)) : 0,
    intent_breakdown: intentBreakdown,
    status_breakdown: statusBreakdown
  };
};

/**
 * getCampaignAnalytics — Returns stats for a specific campaign.
 */
const getCampaignAnalytics = async (campaignId, businessId) => {
  const cacheKey = `campaign:${campaignId}`;
  const cached = getCachedData(cacheKey);
  if (cached) return cached;

  // Query leads scoped to campaign and business
  const query = db.collection('leads')
    .where('business_id', '==', businessId)
    .where('campaign_id', '==', campaignId);

  const stats = await calculateAnalytics(query);
  setCacheData(cacheKey, stats);
  return stats;
};

/**
 * getBusinessAnalytics — Returns stats aggregated across all campaigns for a business.
 */
const getBusinessAnalytics = async (businessId) => {
  const cacheKey = `business:${businessId}`;
  const cached = getCachedData(cacheKey);
  if (cached) return cached;

  const query = db.collection('leads')
    .where('business_id', '==', businessId);

  const stats = await calculateAnalytics(query);
  setCacheData(cacheKey, stats);
  return stats;
};

/**
 * getGlobalStats — Reads platform-wide totals from global stats document.
 */
const getGlobalStats = async () => {
  const cacheKey = 'global:stats';
  const cached = getCachedData(cacheKey);
  if (cached) return cached;

  const statsSnap = await db.collection('platform_stats').doc('global').get();
  
  // Default values if document hasn't been initialized yet
  const defaultStats = {
    total_businesses: 0,
    total_campaigns: 0,
    total_calls_made: 0,
    total_leads_qualified: 0
  };

  const data = statsSnap.exists ? { ...defaultStats, ...statsSnap.data() } : defaultStats;
  
  // Cleanup Firestore timestamp if it exists to keep JSON clean
  delete data.last_updated;

  setCacheData(cacheKey, data);
  return data;
};

module.exports = {
  getCampaignAnalytics,
  getBusinessAnalytics,
  getGlobalStats
};
