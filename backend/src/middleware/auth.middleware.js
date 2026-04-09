/**
 * @file backend/src/middleware/auth.middleware.js
 * @description Express middleware for Firebase Authentication and Authorization.
 *
 * Exports:
 *   - verifyToken : Validates the Firebase ID token from the `Authorization`
 *                   header, decodes custom claims, and attaches a normalized
 *                   `req.user` object for downstream handlers.
 *   - isAdmin     : Gate that ensures the authenticated user carries the
 *                   `{ admin: true }` custom claim. Must be mounted AFTER
 *                   `verifyToken` in the middleware chain.
 */

const { admin } = require('../config/firebase');

/**
 * verifyToken — Authenticate incoming requests via Firebase ID Token.
 *
 * Expected header format:
 *   Authorization: Bearer <firebase_id_token>
 *
 * On success, attaches:
 *   req.user = { uid: string, email: string, admin: boolean }
 *
 * On failure, returns a 401 JSON response and short-circuits the chain.
 *
 * @param {import('express').Request}  req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 * @returns {Promise<void>}
 */
const verifyToken = async (req, res, next) => {
  try {
    // ── 1. Extract bearer token ──────────────────────────────────────────────
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Missing or malformed Authorization header. Expected: Bearer <token>',
      });
    }

    const idToken = authHeader.split('Bearer ')[1];

    if (!idToken) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Token value is empty.',
      });
    }

    // ── 2. Verify token with Firebase Admin SDK ──────────────────────────────
    // `verifyIdToken` checks signature, expiry, audience, and issuer.
    const decodedToken = await admin.auth().verifyIdToken(idToken);

    // ── 3. Attach normalized user object to request ──────────────────────────
    // `decodedToken.admin` is a custom claim set via `setCustomUserClaims`.
    // Default to `false` when the claim has never been set.
    req.user = {
      uid: decodedToken.uid,
      email: decodedToken.email || '',
      admin: decodedToken.admin === true,
    };

    return next();
  } catch (err) {
    // ── Error classification ─────────────────────────────────────────────────
    // Log only the error code — never the raw token or PII.
    console.error('[AuthMiddleware] Token verification failed:', err.code || err.message);

    // Distinguish expired tokens so the frontend knows to silently refresh.
    if (err.code === 'auth/id-token-expired') {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Token has expired. Please refresh your session.',
      });
    }

    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid or expired authentication token.',
    });
  }
};

/**
 * isAdmin — Authorization gate for admin-only routes.
 *
 * Must be placed AFTER `verifyToken` in the middleware chain so that
 * `req.user` is guaranteed to exist.
 *
 * @param {import('express').Request}  req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 * @returns {void}
 */
const isAdmin = (req, res, next) => {
  if (!req.user || req.user.admin !== true) {
    return res.status(403).json({
      error: 'Forbidden',
      message: 'This action requires administrator privileges.',
    });
  }

  return next();
};

module.exports = { verifyToken, isAdmin };
