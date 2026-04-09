/**
 * @file backend/src/routes/business.routes.js
 * @description Business profile routes (MOD-02).
 *
 * All routes are protected by `verifyToken` (MOD-01), ensuring that
 * `req.user.uid` is available for every handler. The document ID in
 * Firestore is always the authenticated user's UID — no path parameter
 * is needed, which eliminates any IDOR risk.
 *
 * Mounts:
 *   GET  /api/business/profile  →  getProfile
 *   POST /api/business/profile  →  validate(createSchema) → createProfile
 *   PUT  /api/business/profile  →  validate(updateSchema) → updateProfile
 */

const { Router } = require('express');
const { verifyToken } = require('../middleware/auth.middleware');
const {
  getProfile,
  createProfile,
  updateProfile,
} = require('../controllers/business.controller');
const {
  createProfileSchema,
  updateProfileSchema,
  validate,
} = require('../validators/business.validator');

const router = Router();

// ── Apply verifyToken globally to all routes in this router ──────────────────
// Every business profile operation requires an authenticated user.
router.use(verifyToken);

// ── GET /api/business/profile ────────────────────────────────────────────────
// Returns the business profile for the authenticated user.
// 404 if profile does not exist (signals frontend to redirect to onboarding).
router.get('/profile', getProfile);

// ── POST /api/business/profile ───────────────────────────────────────────────
// Onboarding submission — creates a new business profile.
// Validates mandatory fields (business_name, industry, core_value_prop).
router.post('/profile', validate(createProfileSchema), createProfile);

// ── PUT /api/business/profile ────────────────────────────────────────────────
// Partial update — at least one field required in the body.
// Recalculates `profile_complete` based on merged state.
router.put('/profile', validate(updateProfileSchema), updateProfile);

module.exports = router;
