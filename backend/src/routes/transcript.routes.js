/**
 * @file backend/src/routes/transcript.routes.js
 * @description Routes for TranscriptModule.
 */

const express = require('express');
const router = express.Router();
const transcriptController = require('../controllers/transcript.controller');
const { verifyToken, isAdmin } = require('../middleware/auth.middleware');

/**
 * @route GET /api/campaigns/:campaign_id/leads/:id/transcript
 * @desc Retrieve transcript for a lead within a campaign (Business Owner only)
 * @access Private (Business Owner)
 */
router.get(
  '/api/campaigns/:campaign_id/leads/:id/transcript',
  verifyToken,
  transcriptController.getTranscriptForBusiness
);

/**
 * @route GET /api/admin/leads/:id/transcript
 * @desc Retrieve transcript for any lead (Admin only)
 * @access Private (Admin)
 */
router.get(
  '/api/admin/leads/:id/transcript',
  verifyToken,
  isAdmin,
  transcriptController.getTranscriptForAdmin
);

module.exports = router;
