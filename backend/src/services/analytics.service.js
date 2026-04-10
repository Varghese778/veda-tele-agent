/**
 * @file backend/src/services/analytics.service.js
 * @description MOD-12 — AnalyticsDashboardModule Service.
 *
 * Provides aggregated business and platform performance metrics.
 * Uses a short TTL cache (10s) to balance freshness vs Firestore reads.
 */

const { db, admin } = require('../config/firebase');

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Cache Layer
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const ANALYTICS_CACHE_TTL_MS = 10 * 1000; // 10 seconds — short for near-real-time updates.
const cache = new Map();

const getCachedData = (key) => {
  const entry = cache.get(key);
  if (entry && Date.now() < entry.expiresAt) return entry.data;
  return null;
};

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
 * All possible funnel statuses. Pre-initializing ensures the API always
 * returns all keys — the frontend doesn't need to handle undefined.
 */
const EMPTY_STATUS = () => ({
  pending: 0,
  email_sent: 0,
  widget_started: 0,
  qualified: 0,
  call_booked: 0,
  calling: 0,
  completed: 0,
  not_interested: 0,
  callback: 0,
  failed: 0,
  retry_queued: 0,
});

const EMPTY_INTENT = () => ({
  INTERESTED: 0,
  NOT_INTERESTED: 0,
  CALLBACK: 0,
});

/**
 * calculateAnalytics — Unified logic for aggregating lead data.
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
      intent_breakdown: EMPTY_INTENT(),
      status_breakdown: EMPTY_STATUS(),
    };
  }

  const intentBreakdown = EMPTY_INTENT();
  const statusBreakdown = EMPTY_STATUS();
  let qualifiedCount = 0;
  let totalDuration = 0;
  let durationCount = 0;

  leads.forEach(lead => {
    // Intent — only count leads that have been analyzed.
    const intent = lead.extracted_data?.intent;
    if (intent) {
      intentBreakdown[intent] = (intentBreakdown[intent] || 0) + 1;
      if (intent === 'INTERESTED') qualifiedCount++;
    }

    // Status — always count.
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
    status_breakdown: statusBreakdown,
  };
};

/**
 * getCampaignAnalytics — Returns stats for a specific campaign.
 */
const getCampaignAnalytics = async (campaignId, businessId) => {
  const cacheKey = `campaign:${campaignId}`;
  const cached = getCachedData(cacheKey);
  if (cached) return cached;

  const query = db.collection('leads')
    .where('business_id', '==', businessId)
    .where('campaign_id', '==', campaignId);

  const stats = await calculateAnalytics(query);
  setCacheData(cacheKey, stats);
  return stats;
};

/**
 * getBusinessAnalytics — Returns stats aggregated across all campaigns.
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
 * getGlobalStats — Reads platform-wide totals.
 */
const getGlobalStats = async () => {
  const cacheKey = 'global:stats';
  const cached = getCachedData(cacheKey);
  if (cached) return cached;

  const statsSnap = await db.collection('platform_stats').doc('global').get();
  
  const defaultStats = {
    total_businesses: 0,
    total_campaigns: 0,
    total_calls_made: 0,
    total_leads_qualified: 0
  };

  const data = statsSnap.exists ? { ...defaultStats, ...statsSnap.data() } : defaultStats;
  delete data.last_updated;

  setCacheData(cacheKey, data);
  return data;
};

module.exports = {
  getCampaignAnalytics,
  getBusinessAnalytics,
  getGlobalStats
};
