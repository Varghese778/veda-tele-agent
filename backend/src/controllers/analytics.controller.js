/**
 * @file backend/src/controllers/analytics.controller.js
 * @description Controller for the AnalyticsDashboardModule.
 */

const { db } = require('../config/firebase');
const analyticsService = require('../services/analytics.service');

/**
 * getCampaignAnalytics — Returns stats for a specific campaign.
 * Ownership check: business_id must match req.user.uid.
 */
const getCampaignAnalytics = async (req, res) => {
  const { id: campaignId } = req.params;
  const businessId = req.user.uid;

  try {
    // 1. Ownership check
    const campaignSnap = await db.collection('campaigns').doc(campaignId).get();
    
    if (!campaignSnap.exists) {
      return res.status(404).json({ error: 'Not Found', message: 'Campaign not found.' });
    }

    const campaignData = campaignSnap.data();
    if (campaignData.business_id !== businessId) {
      return res.status(404).json({ error: 'Not Found', message: 'Campaign not found.' });
    }

    // 2. Fetch stats
    const stats = await analyticsService.getCampaignAnalytics(campaignId, businessId);
    
    return res.status(200).json({
      campaign_id: campaignId,
      campaign_name: campaignData.campaign_name,
      ...stats
    });
  } catch (err) {
    console.error(`[AnalyticsController] getCampaignAnalytics error:`, err.message);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

/**
 * getAdminStats — Returns global platform stats.
 * Admin claim required (enforced by middleware).
 */
const getAdminStats = async (req, res) => {
  try {
    const stats = await analyticsService.getGlobalStats();
    return res.status(200).json(stats);
  } catch (err) {
    console.error(`[AnalyticsController] getAdminStats error:`, err.message);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

/**
 * getAdminBusinessAnalytics — Returns stats for a business across all campaigns.
 * Admin claim required (enforced by middleware).
 */
const getAdminBusinessAnalytics = async (req, res) => {
  const { id: businessId } = req.params;

  try {
    const businessSnap = await db.collection('businesses').doc(businessId).get();
    if (!businessSnap.exists) {
      return res.status(404).json({ error: 'Not Found', message: 'Business not found.' });
    }

    const stats = await analyticsService.getBusinessAnalytics(businessId);
    return res.status(200).json({
      business_id: businessId,
      business_name: businessSnap.data().business_name,
      ...stats
    });
  } catch (err) {
    console.error(`[AnalyticsController] getAdminBusinessAnalytics error:`, err.message);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

module.exports = {
  getCampaignAnalytics,
  getAdminStats,
  getAdminBusinessAnalytics,
};
