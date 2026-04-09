/**
 * @file backend/src/controllers/admin.controller.js
 * @description MOD-13 — AdminModule Controller.
 *
 * Provides a read-only superuser dashboard API for platform oversight.
 * Includes structured audit logging for all administrative actions.
 */

const { db, admin } = require('../config/firebase');

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * logAdminAction — Emits a structured audit log entry for Cloud Logging.
 * 
 * @param {import('express').Request} req 
 * @param {string} action — e.g., 'LIST_BUSINESSES', 'VIEW_LEAD'
 * @param {string} resourceId — e.g., 'business_123', 'lead_abc'
 */
const logAdminAction = (req, action, resourceId = 'N/A') => {
  const auditEntry = {
    timestamp: new Date().toISOString(),
    admin_uid: req.user?.uid || 'UNKNOWN',
    action,
    resource_id: resourceId,
    ip: req.ip,
    user_agent: req.headers['user-agent']
  };
  console.log('[ADMIN_AUDIT_LOG]', JSON.stringify(auditEntry));
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Core Logic
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * getBusinesses — Lists all registered businesses with pagination.
 * Query: ?limit=20&cursor=timestamp
 */
const getBusinesses = async (req, res) => {
  const limit = parseInt(req.query.limit, 10) || 20;
  const cursor = req.query.cursor; // Expected to be an ISO string or numeric timestamp

  try {
    logAdminAction(req, 'LIST_BUSINESSES');

    let query = db.collection('businesses')
      .orderBy('created_at', 'desc')
      .limit(limit + 1); // Fetch one extra to check for hasMore

    if (cursor) {
      // Assuming created_at is a Firestore Timestamp or Date
      query = query.startAfter(new Date(cursor));
    }

    const snapshot = await query.get();
    const docs = snapshot.docs;
    
    const hasMore = docs.length > limit;
    const data = hasMore ? docs.slice(0, limit) : docs;

    const results = await Promise.all(data.map(async (doc) => {
      const biz = doc.data();
      // Use count aggregation if available, or just fetch count field
      const campaignsCount = await db.collection('campaigns')
        .where('business_id', '==', doc.id)
        .count()
        .get();

      return {
        id: doc.id,
        ...biz,
        campaign_count: campaignsCount.data().count
      };
    }));

    const lastDoc = data[data.length - 1];
    const nextCursor = hasMore && lastDoc ? lastDoc.data().created_at : null;

    return res.status(200).json({
      data: results,
      nextCursor,
      hasMore
    });
  } catch (err) {
    console.error('[AdminController] getBusinesses error:', err.message);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

/**
 * getBusinessDetails — Returns a specific business and its campaigns.
 */
const getBusinessDetails = async (req, res) => {
  const { id: businessId } = req.params;

  try {
    logAdminAction(req, 'VIEW_BUSINESS', businessId);

    const bizSnap = await db.collection('businesses').doc(businessId).get();
    if (!bizSnap.exists) {
      return res.status(404).json({ error: 'Not Found', message: 'Business not found.' });
    }

    const campaignsSnap = await db.collection('campaigns')
      .where('business_id', '==', businessId)
      .orderBy('created_at', 'desc')
      .get();

    const campaigns = campaignsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    return res.status(200).json({
      business: { id: businessId, ...bizSnap.data() },
      campaigns
    });
  } catch (err) {
    console.error('[AdminController] getBusinessDetails error:', err.message);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

/**
 * getCampaignDetails — Returns a campaign and its paginated leads.
 */
const getCampaignDetails = async (req, res) => {
  const { id: campaignId } = req.params;
  const limit = parseInt(req.query.limit, 10) || 50;
  const cursor = req.query.cursor;

  try {
    logAdminAction(req, 'VIEW_CAMPAIGN', campaignId);

    const campaignSnap = await db.collection('campaigns').doc(campaignId).get();
    if (!campaignSnap.exists) {
      return res.status(404).json({ error: 'Not Found', message: 'Campaign not found.' });
    }

    let leadsQuery = db.collection('leads')
      .where('campaign_id', '==', campaignId)
      .orderBy('created_at', 'desc')
      .limit(limit);

    if (cursor) {
      leadsQuery = leadsQuery.startAfter(new Date(cursor));
    }

    const leadsSnap = await leadsQuery.get();
    const leads = leadsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    return res.status(200).json({
      campaign: { id: campaignId, ...campaignSnap.data() },
      leads
    });
  } catch (err) {
    console.error('[AdminController] getCampaignDetails error:', err.message);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

/**
 * getLeadDetails — Returns the full lead doc including transcripts.
 */
const getLeadDetails = async (req, res) => {
  const { id: leadId } = req.params;

  try {
    logAdminAction(req, 'VIEW_LEAD', leadId);

    const leadSnap = await db.collection('leads').doc(leadId).get();
    if (!leadSnap.exists) {
      return res.status(404).json({ error: 'Not Found', message: 'Lead not found.' });
    }

    return res.status(200).json({ id: leadId, ...leadSnap.data() });
  } catch (err) {
    console.error('[AdminController] getLeadDetails error:', err.message);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

/**
 * getPlatformStats — Returns global stats.
 */
const getPlatformStats = async (req, res) => {
  try {
    logAdminAction(req, 'VIEW_GLOBAL_STATS');
    const statsSnap = await db.collection('platform_stats').doc('global').get();
    return res.status(200).json(statsSnap.data() || {});
  } catch (err) {
    console.error('[AdminController] getPlatformStats error:', err.message);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

module.exports = {
  getBusinesses,
  getBusinessDetails,
  getCampaignDetails,
  getLeadDetails,
  getPlatformStats
};
