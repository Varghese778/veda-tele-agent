/**
 * @file frontend/js/router.js
 * @description MOD-15 — Hash-based SPA Router.
 *
 * Manages page transitions and route protection (Auth & Admin).
 */

import { state, logout } from "./auth.js";
import { api } from "./api.js";

// Page Renderers (to be imported)
import { renderLanding } from "./pages/landing.js";
import { renderOnboarding } from "./pages/onboarding.js";
import { renderDashboard } from "./pages/dashboard.js";
import { renderAdmin } from "./pages/admin.js";
import { renderSettings } from "./pages/settings.js";

const routes = {
    '/': { renderer: renderLanding, protected: false },
    '/onboarding': { renderer: renderOnboarding, protected: true },
    '/dashboard': { renderer: renderDashboard, protected: true },
    '/settings': { renderer: renderSettings, protected: true },
    '/admin': { renderer: renderAdmin, protected: true, adminOnly: true }
};

/**
 * navigate — Changes the current route and triggers a re-render.
 */
export const navigate = (path) => {
    window.location.hash = path;
};

/**
 * checkOnboarding — Verifies if business profile exists.
 */
const checkOnboarding = async () => {
    try {
        const response = await api.get('/api/business/profile');
        if (response.status === 404) {
            navigate('/onboarding');
            return false;
        }
        return true;
    } catch (err) {
        return false;
    }
};

/**
 * resolveRoute — Heart of the router. Decides what to render.
 */
export const resolveRoute = async () => {
    const hash = window.location.hash.slice(1) || '/';
    const route = routes[hash] || routes['/'];
    const root = document.getElementById('root');

    // 1. Auth Protection
    if (route.protected && !state.user) {
        console.warn("[Router] Protected route. Redirecting to login.");
        navigate('/');
        return;
    }

    // 2. Admin Protection
    if (route.adminOnly && !state.isAdmin) {
        console.warn("[Router] Admin only route. Redirecting to dashboard.");
        navigate('/dashboard');
        return;
    }

    // 3. Onboarding Redirect Logics
    if (hash === '/dashboard' && state.user) {
        const isComplete = await checkOnboarding();
        if (!isComplete) return; // checkOnboarding handles the redirect
    }

    // 4. Render
    root.innerHTML = ''; // Clear root
    await route.renderer(root);
};

/**
 * initRouter — Sets up hashchange listeners.
 */
export const initRouter = () => {
    window.addEventListener('hashchange', resolveRoute);
    resolveRoute();
};
