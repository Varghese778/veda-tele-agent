/**
 * @file backend/src/routes/admin.routes.js
 * @description Admin routes — superuser-only endpoints.
 *
 * Mounts:
 *   POST /api/admin/set-admin  →  verifyToken → isAdmin → setAdminClaim
 *
 * Both authentication (valid Firebase token) and authorization (admin custom
 * claim) are enforced via chained middleware before the controller executes.
 *
 * Future admin routes from MOD-13 (AdminModule) will be added to this router.
 */

const { Router } = require('express');
const { verifyToken, isAdmin } = require('../middleware/auth.middleware');
const { setAdminClaim } = require('../controllers/auth.controller');
const adminController = require('../controllers/admin.controller');

const router = Router();

/**
 * readOnlyGuard — MVP safety middleware.
 * Blocks any administrative mutation except the bootstrap endpoint.
 */
const readOnlyGuard = (req, res, next) => {
  if (req.method !== 'GET' && req.path !== '/set-admin') {
    return res.status(403).json({
      error: 'Forbidden',
      message: 'Admin portal is read-only in MVP. Use dedicated admin APIs for mutations.'
    });
  }
  next();
};

// Apply verifyToken and isAdmin to ALL admin routes
router.use(verifyToken, isAdmin);
router.use(readOnlyGuard);

// ── Mutation Endpoints (Bootstrap only) ──────────────────────────────────────
router.post('/set-admin', setAdminClaim);

// ── GET Endpoints (Dashboard) ────────────────────────────────────────────────
router.get('/businesses', adminController.getBusinesses);
router.get('/businesses/:id', adminController.getBusinessDetails);
router.get('/campaigns/:id', adminController.getCampaignDetails);
router.get('/leads/:id', adminController.getLeadDetails);
router.get('/stats', adminController.getPlatformStats);

module.exports = router;
