/**
 * @file frontend/js/auth.js
 * @description Firestore-backed authentication using backend JWT.
 */

import { API_BASE_URL } from "./config.js";

const STORAGE_TOKEN_KEY = 'veda_auth_token';
const STORAGE_USER_KEY = 'veda_auth_user';

export const state = {
    user: null,
    isAdmin: false,
    initialized: false,
    authMode: 'backend-jwt'
};

let accessToken = null;

const authFetch = async (endpoint, options = {}) => {
    const headers = {
        'Content-Type': 'application/json',
        ...(options.headers || {})
    };

    if (accessToken) {
        headers.Authorization = `Bearer ${accessToken}`;
    }

    const res = await fetch(`${API_BASE_URL}${endpoint}`, {
        ...options,
        headers
    });

    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
        throw new Error(payload.message || `Request failed (${res.status})`);
    }

    return payload;
};

const persistSession = (token, user) => {
    accessToken = token;
    state.user = user;
    state.isAdmin = user?.admin === true;
    sessionStorage.setItem(STORAGE_TOKEN_KEY, token);
    sessionStorage.setItem(STORAGE_USER_KEY, JSON.stringify(user));
};

const clearSession = () => {
    accessToken = null;
    state.user = null;
    state.isAdmin = false;
    sessionStorage.removeItem(STORAGE_TOKEN_KEY);
    sessionStorage.removeItem(STORAGE_USER_KEY);
};

export const register = async ({ email, password, displayName }) => {
    const data = await authFetch('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({
            email,
            password,
            display_name: displayName || ''
        })
    });

    persistSession(data.token, data.user);
    return data.user;
};

export const login = async ({ email, password }) => {
    const data = await authFetch('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password })
    });

    persistSession(data.token, data.user);
    return data.user;
};

export const loginWithGoogleCredential = async (idToken) => {
    const data = await authFetch('/api/auth/google', {
        method: 'POST',
        body: JSON.stringify({ id_token: idToken })
    });

    persistSession(data.token, data.user);
    return data.user;
};

export const logout = async () => {
    clearSession();
    window.location.hash = '/';
};

export const getIdToken = async () => accessToken;

export const initAuth = async (callback) => {
    try {
        const storedToken = sessionStorage.getItem(STORAGE_TOKEN_KEY);
        const storedUser = sessionStorage.getItem(STORAGE_USER_KEY);

        if (!storedToken || !storedUser) {
            clearSession();
            state.initialized = true;
            callback(null);
            return;
        }

        accessToken = storedToken;
        const data = await authFetch('/api/auth/me', { method: 'GET' });

        persistSession(storedToken, data.user);
        state.initialized = true;
        callback(state.user);
    } catch (_err) {
        clearSession();
        state.initialized = true;
        callback(null);
    }
};
