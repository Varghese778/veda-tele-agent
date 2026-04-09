/**
 * @file backend/src/routes/campaigns.routes.js
 * @description Campaign routes (MOD-03).
 *
 * All routes are protected by `verifyToken` (MOD-01).
 * Validation middleware from MOD-02's pattern is reused via the shared
 * `validate` factory from `business.validator.js`.
 *
 * Mounts:
 *   GET    /api/campaigns              →  listCampaigns
 *   POST   /api/campaigns              →  validate(create) → createCampaign
 *   GET    /api/campaigns/:id          →  getCampaign
 *   PUT    /api/campaigns/:id          →  validate(update) → updateCampaign
 *   PATCH  /api/campaigns/:id          →  (alias for PUT)
 *   POST   /api/campaigns/:id/start    →  startCampaign
 *   POST   /api/campaigns/:id/pause    →  pauseCampaign
 *   GET    /api/campaigns/:id/analytics → getAnalytics
 */

const { Router } = require('express');
const { verifyToken } = require('../middleware/auth.middleware');
const { validate } = require('../validators/business.validator');
const {
  createCampaignSchema,
  updateCampaignSchema,
} = require('../validators/campaign.validator');
const {
  listCampaigns,
  getCampaign,
  createCampaign,
  updateCampaign,
  startCampaign,
  pauseCampaign,
  getAnalytics,
} = require('../controllers/campaign.controller');

const router = Router();

// ── Apply verifyToken to all campaign routes ─────────────────────────────────
router.use(verifyToken);

// ── Collection-level routes ──────────────────────────────────────────────────

// List all campaigns for the authenticated business.
router.get('/', listCampaigns);

// Create a new campaign (requires completed business profile).
router.post('/', validate(createCampaignSchema), createCampaign);

// ── Document-level routes ────────────────────────────────────────────────────

// Get full details for a single campaign.
router.get('/:id', getCampaign);

// Update campaign config (only while status is draft).
router.put('/:id', validate(updateCampaignSchema), updateCampaign);

// PATCH alias for PUT — same validation and handler.
router.patch('/:id', validate(updateCampaignSchema), updateCampaign);

// ── Lifecycle action routes ──────────────────────────────────────────────────

// Start a campaign (draft/paused → active).
router.post('/:id/start', startCampaign);

// Pause a campaign (active → paused).
router.post('/:id/pause', pauseCampaign);

// ── Analytics route ──────────────────────────────────────────────────────────

// Aggregate lead metrics for a campaign.
router.get('/:id/analytics', getAnalytics);

module.exports = router;
