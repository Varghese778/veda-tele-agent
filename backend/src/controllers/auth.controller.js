/**
 * @file backend/src/controllers/auth.controller.js
 * @description Controller logic for the AuthModule (MOD-01).
 *
 * Exports:
 *   - initProfile   : Creates a skeleton business document in Firestore on
 *                      first login if one does not already exist.
 *   - setAdminClaim  : Grants the `{ admin: true }` custom claim to a target
 *                      user via Firebase Auth. Admin-only route.
 */

const { admin, db } = require('../config/firebase');

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// POST /api/auth/init-profile
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * initProfile — First-login handler: ensures a `businesses/{uid}` document
 * exists in Firestore.
 *
 * Flow:
 *   1. Read `businesses/{req.user.uid}`.
 *   2. If it exists → respond with `isNew: false`.
 *   3. If it does not exist → create a skeleton document with safe defaults,
 *      then respond with `isNew: true`.
 *
 * The skeleton only contains structural fields — full onboarding (business
 * name, industry, etc.) is handled by MOD-02 (BusinessProfileModule).
 *
 * @param {import('express').Request}  req  — Must have `req.user` set by verifyToken.
 * @param {import('express').Response} res
 * @returns {Promise<void>}
 */
const initProfile = async (req, res) => {
  try {
    const { uid, email } = req.user;
    const businessRef = db.collection('businesses').doc(uid);
    const snapshot = await businessRef.get();

    // ── Profile already exists — early exit ──────────────────────────────────
    if (snapshot.exists) {
      return res.status(200).json({
        message: 'Profile already exists',
        business_id: uid,
        isNew: false,
      });
    }

    // ── Create stripped-down skeleton document ────────────────────────────────
    // Fields align with the Firestore schema defined in PRS §5 — Collection: businesses.
    const now = admin.firestore.FieldValue.serverTimestamp();

    const skeletonDoc = {
      business_id: uid,
      business_name: '',
      industry: '',
      core_value_prop: '',
      contact_email: email,
      created_at: now,
      updated_at: now,
      is_admin: false,
    };

    await businessRef.set(skeletonDoc);

    return res.status(201).json({
      message: 'Profile initialized',
      business_id: uid,
      isNew: true,
    });
  } catch (err) {
    // Log only the error message — never the user object or token.
    console.error('[AuthController] initProfile error:', err.message);

    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to initialize business profile. Please try again.',
    });
  }
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// POST /api/admin/set-admin
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * setAdminClaim — Grant `{ admin: true }` custom claim to a target Firebase
 * user.
 *
 * This endpoint is protected by both `verifyToken` and `isAdmin` middleware,
 * so only existing admins can promote other users.
 *
 * Custom claims propagate to the user's next token refresh (up to 1 hour)
 * or on explicit `getIdToken(true)` from the client.
 *
 * @param {import('express').Request}  req  — Body must contain `{ target_uid: string }`.
 * @param {import('express').Response} res
 * @returns {Promise<void>}
 */
const setAdminClaim = async (req, res) => {
  try {
    const { target_uid } = req.body;

    // ── Input validation ─────────────────────────────────────────────────────
    if (!target_uid || typeof target_uid !== 'string') {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Request body must include a valid "target_uid" string.',
      });
    }

    // ── Verify the target user exists in Firebase Auth ────────────────────────
    // This throws if the UID does not correspond to an existing user.
    await admin.auth().getUser(target_uid);

    // ── Set admin custom claim ───────────────────────────────────────────────
    await admin.auth().setCustomUserClaims(target_uid, { admin: true });

    console.log(`[AuthController] Admin claim granted to UID: ${target_uid}`);

    return res.status(200).json({
      message: `Admin claim set for ${target_uid}`,
    });
  } catch (err) {
    console.error('[AuthController] setAdminClaim error:', err.code || err.message);

    // Handle "user not found" distinctly so the admin gets actionable feedback.
    if (err.code === 'auth/user-not-found') {
      return res.status(404).json({
        error: 'Not Found',
        message: 'No Firebase user exists with the provided target_uid.',
      });
    }

    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to set admin claim. Please try again.',
    });
  }
};

module.exports = { initProfile, setAdminClaim };
