/**
 * @file backend/src/routes/analytics.routes.js
 * @description Routes for the AnalyticsDashboardModule.
 */

const express = require('express');
const router = express.Router();
const analyticsController = require('../controllers/analytics.controller');
const { verifyToken, isAdmin } = require('../middleware/auth.middleware');

/**
 * @route GET /api/campaigns/:id/analytics
 * @desc Get performance analytics for a specific campaign.
 * @access Private (Business Owner)
 */
router.get(
  '/api/campaigns/:id/analytics',
  verifyToken,
  analyticsController.getCampaignAnalytics
);

/**
 * @route GET /api/admin/stats
 * @desc Get platform-wide global stats.
 * @access Private (Admin only)
 */
router.get(
  '/api/admin/stats',
  verifyToken,
  isAdmin,
  analyticsController.getAdminStats
);

/**
 * @route GET /api/admin/businesses/:id/analytics
 * @desc Get analytics for a specific business across all campaigns.
 * @access Private (Admin only)
 */
router.get(
  '/api/admin/businesses/:id/analytics',
  verifyToken,
  isAdmin,
  analyticsController.getAdminBusinessAnalytics
);

module.exports = router;
