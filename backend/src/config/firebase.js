/**
 * @file backend/src/config/firebase.js
 * @description Firebase Admin SDK singleton initialization.
 *
 * Initializes the Firebase Admin SDK exactly once and exports the `admin`
 * instance along with a pre-configured Firestore `db` reference.
 *
 * Credential strategy:
 *   - Production (Cloud Run): Uses the attached Service Account identity
 *     automatically via GCP Application Default Credentials (ADC).
 *   - Local development: Uses ADC obtained via
 *     `gcloud auth application-default login`, or alternatively falls back
 *     to GOOGLE_APPLICATION_CREDENTIALS pointing to a service-account key.
 *
 * No hardcoded secrets or key files are ever referenced in this module.
 */

const admin = require('firebase-admin');

// ──────────────────────────────────────────────────────────────────────────────
// Singleton guard — Firebase Admin throws if `initializeApp` is called twice.
// ──────────────────────────────────────────────────────────────────────────────
if (!admin.apps.length) {
  admin.initializeApp({
    // When no credential is passed, the SDK uses Application Default Credentials
    // automatically. This covers both Cloud Run SA identity and local `gcloud`
    // ADC tokens without any conditional logic.
    projectId: process.env.GOOGLE_CLOUD_PROJECT || process.env.FIREBASE_PROJECT_ID,
  });
}

/**
 * Pre-initialized Firestore client.
 * All modules import `db` from this file to ensure a single shared connection.
 */
const db = admin.firestore();

module.exports = { admin, db };
