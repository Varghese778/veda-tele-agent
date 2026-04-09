/**
 * @file backend/src/controllers/business.controller.js
 * @description Controller logic for the BusinessProfileModule (MOD-02).
 *
 * Manages the full business profile lifecycle:
 *   - getProfile    : Read the authenticated user's business document.
 *   - createProfile : Onboarding — create the document and atomically
 *                     increment the global `total_businesses` counter.
 *   - updateProfile : Partial update with dynamic `profile_complete`
 *                     recalculation.
 *
 * All Firestore operations use `req.user.uid` as the document ID, enforcing
 * strict multi-tenant isolation at the data layer (PRS §5).
 */

const { admin, db } = require('../config/firebase');

// ── Firestore helpers ────────────────────────────────────────────────────────
const FieldValue = admin.firestore.FieldValue;

/**
 * The three fields that must all be non-empty for a profile to be considered
 * fully onboarded. Used by `evaluateProfileComplete`.
 */
const REQUIRED_PROFILE_FIELDS = ['business_name', 'industry', 'core_value_prop'];

/**
 * evaluateProfileComplete — Checks whether all mandatory profile fields are
 * present and non-empty.
 *
 * @param {Record<string, any>} data — The business document fields.
 * @returns {boolean} True if every required field is a non-empty string.
 */
const evaluateProfileComplete = (data) => {
  return REQUIRED_PROFILE_FIELDS.every(
    (field) => typeof data[field] === 'string' && data[field].trim().length > 0
  );
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /api/business/profile
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * getProfile — Retrieves the business profile document for the authenticated
 * user.
 *
 * If the document does not exist, returns 404 so the frontend knows to
 * redirect the user to the onboarding flow.
 *
 * @param {import('express').Request}  req — Must have `req.user` from verifyToken.
 * @param {import('express').Response} res
 * @returns {Promise<void>}
 */
const getProfile = async (req, res) => {
  try {
    const { uid } = req.user;
    const docRef = db.collection('businesses').doc(uid);
    const snapshot = await docRef.get();

    if (!snapshot.exists) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Business profile does not exist. Please complete onboarding.',
      });
    }

    const data = snapshot.data();

    return res.status(200).json({
      business_id: uid,
      business_name: data.business_name || '',
      industry: data.industry || '',
      core_value_prop: data.core_value_prop || '',
      contact_email: data.contact_email || '',
      profile_complete: data.profile_complete || false,
      created_at: data.created_at,
      updated_at: data.updated_at,
    });
  } catch (err) {
    console.error('[BusinessController] getProfile error:', err.message);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to retrieve business profile.',
    });
  }
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// POST /api/business/profile
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * createProfile — Onboarding endpoint: creates the full business profile.
 *
 * Implementation uses a Firestore batch write to:
 *   1. Create the `businesses/{uid}` document with all provided fields.
 *   2. Atomically increment `platform_stats/global.total_businesses` by 1.
 *
 * This ensures the global counter stays consistent even under concurrent
 * sign-ups, and both writes either succeed or fail together.
 *
 * If the profile already exists, returns 409 Conflict to prevent duplicate
 * onboarding submissions from resetting data.
 *
 * @param {import('express').Request}  req — Body validated by middleware.
 * @param {import('express').Response} res
 * @returns {Promise<void>}
 */
const createProfile = async (req, res) => {
  try {
    const { uid, email } = req.user;
    const businessRef = db.collection('businesses').doc(uid);

    // ── Guard: prevent duplicate profile creation ────────────────────────────
    const existing = await businessRef.get();
    if (existing.exists) {
      return res.status(409).json({
        error: 'Conflict',
        message: 'Business profile already exists. Use PUT to update.',
      });
    }

    // ── Build document from validated body ───────────────────────────────────
    const { business_name, industry, core_value_prop, contact_email } = req.body;
    const now = FieldValue.serverTimestamp();

    const profileData = {
      business_id: uid,
      business_name,
      industry,
      core_value_prop,
      contact_email: contact_email || email || '',
      profile_complete: evaluateProfileComplete(req.body),
      is_admin: false,
      created_at: now,
      updated_at: now,
    };

    // ── Batch write: create profile + increment global counter ───────────────
    const batch = db.batch();

    // Write 1: Create the business document.
    batch.set(businessRef, profileData);

    // Write 2: Atomically increment the global businesses counter.
    // If `platform_stats/global` doesn't exist yet, `set` with `merge: true`
    // will create it; `FieldValue.increment` initializes missing numeric
    // fields to 0 before incrementing.
    const statsRef = db.collection('platform_stats').doc('global');
    batch.set(
      statsRef,
      {
        total_businesses: FieldValue.increment(1),
        last_updated: now,
      },
      { merge: true }
    );

    await batch.commit();

    return res.status(201).json({
      message: 'Business profile created successfully.',
      business_id: uid,
      business_name,
      industry,
      core_value_prop,
      contact_email: profileData.contact_email,
      profile_complete: profileData.profile_complete,
    });
  } catch (err) {
    console.error('[BusinessController] createProfile error:', err.message);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to create business profile.',
    });
  }
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PUT /api/business/profile
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * updateProfile — Partial update of the business profile.
 *
 * After merging the incoming fields, recalculates `profile_complete` based
 * on the merged state (existing data + new updates). This ensures that
 * clearing a required field will correctly flip `profile_complete` to false.
 *
 * @param {import('express').Request}  req — Body validated by middleware.
 * @param {import('express').Response} res
 * @returns {Promise<void>}
 */
const updateProfile = async (req, res) => {
  try {
    const { uid } = req.user;
    const businessRef = db.collection('businesses').doc(uid);

    // ── Verify the profile exists before updating ────────────────────────────
    const snapshot = await businessRef.get();
    if (!snapshot.exists) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Business profile does not exist. Use POST to create one first.',
      });
    }

    // ── Merge existing data with incoming updates ────────────────────────────
    const existingData = snapshot.data();
    const mergedData = { ...existingData, ...req.body };

    // ── Recalculate profile_complete on the merged state ─────────────────────
    const profileComplete = evaluateProfileComplete(mergedData);

    // ── Build update payload ─────────────────────────────────────────────────
    const updatePayload = {
      ...req.body,
      profile_complete: profileComplete,
      updated_at: FieldValue.serverTimestamp(),
    };

    await businessRef.update(updatePayload);

    // ── Return the full merged profile for frontend state sync ───────────────
    const updatedSnapshot = await businessRef.get();
    const updatedData = updatedSnapshot.data();

    return res.status(200).json({
      message: 'Business profile updated successfully.',
      business_id: uid,
      business_name: updatedData.business_name || '',
      industry: updatedData.industry || '',
      core_value_prop: updatedData.core_value_prop || '',
      contact_email: updatedData.contact_email || '',
      profile_complete: updatedData.profile_complete || false,
      updated_at: updatedData.updated_at,
    });
  } catch (err) {
    console.error('[BusinessController] updateProfile error:', err.message);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to update business profile.',
    });
  }
};

module.exports = { getProfile, createProfile, updateProfile };
