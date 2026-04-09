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

const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const { admin, db } = require('../config/firebase');

const USERS_COLLECTION = 'users';
const JWT_EXPIRES_IN = '12h';
const googleClient = new OAuth2Client();

const getJwtSecret = () => process.env.AUTH_JWT_SECRET || 'change-me-in-production';

const normalizeEmail = (email) => String(email || '').trim().toLowerCase();

const sha256Hex = (value) => crypto.createHash('sha256').update(value).digest('hex');

const hashPassword = (password, salt = crypto.randomBytes(16).toString('hex')) => {
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
};

const verifyPassword = (password, storedHash) => {
  const [salt, hash] = String(storedHash || '').split(':');
  if (!salt || !hash) return false;
  const candidate = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(candidate, 'hex'));
};

const signSessionToken = ({ uid, email, admin: isAdmin }) => {
  return jwt.sign(
    { uid, email, admin: isAdmin === true },
    getJwtSecret(),
    { expiresIn: JWT_EXPIRES_IN }
  );
};

const buildPublicUser = (docId, data) => ({
  uid: docId,
  email: data.email,
  display_name: data.display_name || '',
  admin: data.is_admin === true,
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// POST /api/auth/google
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const googleLogin = async (req, res) => {
  try {
    const idToken = String(req.body.id_token || '');
    const clientId = String(process.env.GOOGLE_OAUTH_CLIENT_ID || '').trim();

    if (!idToken) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'id_token is required.',
      });
    }

    if (!clientId) {
      return res.status(500).json({
        error: 'Internal Server Error',
        message: 'GOOGLE_OAUTH_CLIENT_ID is not configured on the server.',
      });
    }

    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: clientId,
    });

    const payload = ticket.getPayload();
    const email = normalizeEmail(payload?.email);
    const displayName = String(payload?.name || '').trim();

    if (!email || payload?.email_verified !== true) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Google account email is missing or not verified.',
      });
    }

    const userId = sha256Hex(email);
    const userRef = db.collection(USERS_COLLECTION).doc(userId);
    const userSnap = await userRef.get();

    let userDoc;
    if (userSnap.exists) {
      userDoc = userSnap.data();
    } else {
      const anyUserSnapshot = await db.collection(USERS_COLLECTION).limit(1).get();
      const isBootstrapAdmin = anyUserSnapshot.empty;
      const now = admin.firestore.FieldValue.serverTimestamp();

      userDoc = {
        email,
        password_hash: null,
        display_name: displayName,
        is_admin: isBootstrapAdmin,
        created_at: now,
        updated_at: now,
        auth_provider: 'google',
      };
      await userRef.set(userDoc);
    }

    const token = signSessionToken({ uid: userId, email, admin: userDoc.is_admin === true });

    return res.status(200).json({
      message: 'Google login successful.',
      token,
      user: buildPublicUser(userId, userDoc),
    });
  } catch (err) {
    console.error('[AuthController] googleLogin error:', err.message);
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid Google credential.',
    });
  }
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// POST /api/auth/register
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const register = async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);
    const password = String(req.body.password || '');
    const displayName = String(req.body.display_name || '').trim();

    if (!email || !password) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'email and password are required.',
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'password must be at least 8 characters.',
      });
    }

    const userId = sha256Hex(email);
    const userRef = db.collection(USERS_COLLECTION).doc(userId);
    const existing = await userRef.get();

    if (existing.exists) {
      return res.status(409).json({
        error: 'Conflict',
        message: 'An account with this email already exists.',
      });
    }

    const anyUserSnapshot = await db.collection(USERS_COLLECTION).limit(1).get();
    const isBootstrapAdmin = anyUserSnapshot.empty;

    const now = admin.firestore.FieldValue.serverTimestamp();
    const userDoc = {
      email,
      password_hash: hashPassword(password),
      display_name: displayName,
      is_admin: isBootstrapAdmin,
      created_at: now,
      updated_at: now,
    };

    await userRef.set(userDoc);

    const token = signSessionToken({ uid: userId, email, admin: isBootstrapAdmin });

    return res.status(201).json({
      message: 'Account created successfully.',
      token,
      user: buildPublicUser(userId, userDoc),
    });
  } catch (err) {
    console.error('[AuthController] register error:', err.message);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to create account.',
    });
  }
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// POST /api/auth/login
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const login = async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);
    const password = String(req.body.password || '');

    if (!email || !password) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'email and password are required.',
      });
    }

    const userId = sha256Hex(email);
    const userRef = db.collection(USERS_COLLECTION).doc(userId);
    const snapshot = await userRef.get();

    if (!snapshot.exists) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid email or password.',
      });
    }

    const userData = snapshot.data();
    if (!verifyPassword(password, userData.password_hash)) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid email or password.',
      });
    }

    const token = signSessionToken({
      uid: userId,
      email: userData.email,
      admin: userData.is_admin === true,
    });

    return res.status(200).json({
      message: 'Login successful.',
      token,
      user: buildPublicUser(userId, userData),
    });
  } catch (err) {
    console.error('[AuthController] login error:', err.message);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to sign in.',
    });
  }
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /api/auth/me
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const getMe = async (req, res) => {
  try {
    const userRef = db.collection(USERS_COLLECTION).doc(req.user.uid);
    const snapshot = await userRef.get();

    if (!snapshot.exists) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'User record not found.',
      });
    }

    return res.status(200).json({
      user: buildPublicUser(snapshot.id, snapshot.data()),
    });
  } catch (err) {
    console.error('[AuthController] getMe error:', err.message);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch user profile.',
    });
  }
};

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

    // ── Promote the target user in Firestore auth model ─────────────────────
    const targetRef = db.collection(USERS_COLLECTION).doc(target_uid);
    const targetSnap = await targetRef.get();

    if (!targetSnap.exists) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'No user exists with the provided target_uid.',
      });
    }

    await targetRef.set(
      {
        is_admin: true,
        updated_at: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    console.log(`[AuthController] Admin claim granted to UID: ${target_uid}`);

    return res.status(200).json({
      message: `Admin claim set for ${target_uid}`,
    });
  } catch (err) {
    console.error('[AuthController] setAdminClaim error:', err.code || err.message);

    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to set admin claim. Please try again.',
    });
  }
};

module.exports = { register, login, googleLogin, getMe, initProfile, setAdminClaim };
