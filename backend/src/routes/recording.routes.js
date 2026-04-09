/**
 * @file backend/src/routes/recording.routes.js
 * @description Routes for RecordingModule.
 */

const express = require('express');
const router = express.Router();
const recordingController = require('../controllers/recording.controller');
const { verifyToken } = require('../middleware/auth.middleware');

/**
 * @route GET /api/campaigns/:campaign_id/leads/:id/recording
 * @desc Proxy-stream a call recording for a specific lead.
 * @access Private (Business Owner or Admin)
 */
router.get(
  '/api/campaigns/:campaign_id/leads/:id/recording',
  verifyToken,
  recordingController.streamRecording
);

module.exports = router;
