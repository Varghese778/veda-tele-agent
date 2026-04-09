/**
 * @file frontend/js/api.js
 * @description MOD-15 — API Wrapper Service.
 *
 * Centralized fetch wrapper that handles:
 *   - Automatic ID Token injection in Authorization header.
 *   - Base URL configuration.
 *   - Global 401 handling for session expiry.
 */

import { getIdToken, logout } from "./auth.js";
import { API_BASE_URL } from "./config.js";

/**
 * request — Internal core fetch wrapper.
 */
async function request(endpoint, options = {}) {
    const token = await getIdToken();
    
    const headers = {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        ...options.headers
    };

    // If body is FormData (for uploads), browser sets Content-Type boundary automatically
    if (options.body instanceof FormData) {
        delete headers['Content-Type'];
    }

    const config = {
        ...options,
        headers
    };

    const url = endpoint.startsWith('http') ? endpoint : `${API_BASE_URL}${endpoint}`;

    try {
        const response = await fetch(url, config);
        
        // Handle 401 Unauthorized (Session expired or invalid)
        if (response.status === 401) {
            console.error("[API] Session expired (401). Signing out...");
            await logout();
            throw new Error('Session expired. Please log in again.');
        }

        // Return raw response for 404s so callers can handle onboarding (MOD-15 req)
        if (response.status === 404 || response.status === 403) {
            return response;
        }

        if (!response.ok) {
            const error = await response.json().catch(() => ({ message: 'API Request failed' }));
            throw new Error(error.message || `Error ${response.status}`);
        }

        return response.json();
    } catch (err) {
        console.error(`[API] ${endpoint} failed:`, err.message);
        throw err;
    }
}

export const api = {
    get: (url) => request(url, { method: 'GET' }),
    post: (url, data) => request(url, { method: 'POST', body: JSON.stringify(data) }),
    upload: (url, formData) => request(url, { method: 'POST', body: formData }),
    patch: (url, data) => request(url, { method: 'PATCH', body: JSON.stringify(data) }),
    delete: (url) => request(url, { method: 'DELETE' })
};
