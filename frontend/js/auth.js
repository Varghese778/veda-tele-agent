/**
 * @file frontend/js/auth.js
 * @description MOD-15 — Authentication Service using Firebase Web SDK v10.
 *
 * This module manages the Google Sign-in flow and maintains the ID token
 * strictly in-memory (no persistence to localStorage).
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
    getAuth, 
    signInWithPopup, 
    GoogleAuthProvider, 
    onAuthStateChanged, 
    signOut 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { firebaseConfig } from "./config.js";

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// In-Memory State
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Global application state for current user and token.
 * This is lost on page refresh, enforcing security spec.
 */
export const state = {
    user: null,
    isAdmin: false,
    initialized: false
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Service API
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * login — Triggers Google Sign-In popup.
 */
export const login = async () => {
    try {
        const result = await signInWithPopup(auth, provider);
        return result.user;
    } catch (err) {
        console.error("[Auth] Login failed:", err.message);
        throw err;
    }
};

/**
 * logout — Clears session and signs out from Firebase.
 */
export const logout = async () => {
    try {
        await signOut(auth);
        state.user = null;
        state.isAdmin = false;
        window.location.hash = "/";
    } catch (err) {
        console.error("[Auth] Logout failed:", err.message);
    }
};

/**
 * getIdToken — Retrieves a fresh ID token from Firebase.
 * Used on every API request.
 */
export const getIdToken = async () => {
    if (!auth.currentUser) return null;
    return await auth.currentUser.getIdToken(true);
};

/**
 * initAuth — Sets up the auth state observer and triggers initial routing.
 */
export const initAuth = (callback) => {
    onAuthStateChanged(auth, async (user) => {
        state.user = user;
        if (user) {
            // Check for admin claim
            const tokenResult = await user.getIdTokenResult();
            state.isAdmin = tokenResult.claims.admin === true;
        } else {
            state.isAdmin = false;
        }
        state.initialized = true;
        callback(user);
    });
};
