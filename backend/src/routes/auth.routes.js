/**
 * @file backend/src/routes/auth.routes.js
 * @description Auth routes — user-facing authentication endpoints.
 *
 * Mounts:
 *   POST /api/auth/init-profile  →  verifyToken → initProfile
 *
 * This route is called by the frontend immediately after a successful
 * Google OAuth2 sign-in to ensure a `businesses/{uid}` document exists
 * in Firestore for the authenticated user.
 */

const { Router } = require('express');
const { verifyToken } = require('../middleware/auth.middleware');
const { register, login, googleLogin, getMe, initProfile } = require('../controllers/auth.controller');

const router = Router();

// ── Public auth routes (Firestore + app JWT) ───────────────────────────────
router.post('/register', register);
router.post('/login', login);
router.post('/google', googleLogin);

// ── Protected auth routes ───────────────────────────────────────────────────
router.get('/me', verifyToken, getMe);

// ── POST /api/auth/init-profile ──────────────────────────────────────────────
// Protected: requires a valid Firebase ID token.
// Creates a skeleton business profile on first login; returns existing on repeat.
router.post('/init-profile', verifyToken, initProfile);

module.exports = router;
