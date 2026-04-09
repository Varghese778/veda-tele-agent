/**
 * @file frontend/js/app.js
 * @description MOD-15 — Main application entrypoint.
 */

import { initAuth } from "./auth.js";
import { initRouter, resolveRoute } from "./router.js";

/**
 * Global App Initialization
 */
const bootstrap = () => {
    console.log("[App] Initializing Veda-Tele-Agent UI...");

    // 1. Initialize Auth state observer
    initAuth((user) => {
        console.log("[App] Auth state updated:", user ? user.email : "Logged out");
        
        // 2. Resolve route after auth state is determined
        resolveRoute();
    });

    // 3. Initialize Router
    initRouter();
};

document.addEventListener("DOMContentLoaded", bootstrap);
