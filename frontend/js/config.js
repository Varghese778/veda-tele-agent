/**
 * @file frontend/js/config.js
 * @description Frontend runtime configuration.
 */

export const API_BASE_URL =
    window.__ENV__?.API_BASE_URL ||
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
        ? 'http://localhost:8080'
        : '');
