/**
 * @file frontend/js/pages/admin.js
 * @description MOD-15 — Admin Superuser Portal.
 */

import { api } from "../api.js";
import { logout } from "../auth.js";

export const renderAdmin = async (container) => {
    let businesses = [];
    let stats = {
        total_businesses: 0,
        total_campaigns: 0,
        total_calls_made: 0
    };

    try {
        stats = await api.get('/api/admin/stats');
        const bizRes = await api.get('/api/admin/businesses?limit=50');
        businesses = bizRes.data;
    } catch (err) {
        console.error("Admin load error:", err);
    }

    container.innerHTML = `
        <div class="admin-page animate-fade-in">
            <nav class="navbar glass">
                <div class="container flex justify-between items-center">
                    <div class="logo font-heading flex items-center gap-md">
                        <i class="fas fa-shield-halved text-primary"></i>
                        <span>VEDA ADMIN</span>
                    </div>
                    <button id="logoutBtn" class="btn btn-outline btn-sm">Sign Out</button>
                </div>
            </nav>

            <main class="container p-lg">
                <h1 class="text-3xl font-heading mb-xl">Platform Oversight</h1>

                <div class="stats-grid grid gap-md mb-xl">
                    <div class="stat-card glass p-lg">
                        <span class="label">Total Businesses</span>
                        <h2>${stats.total_businesses}</h2>
                    </div>
                    <div class="stat-card glass p-lg">
                        <span class="label">Total Campaigns</span>
                        <h2>${stats.total_campaigns}</h2>
                    </div>
                    <div class="stat-card glass p-lg">
                        <span class="label">Calls Facilitated</span>
                        <h2>${stats.total_calls_made}</h2>
                    </div>
                </div>

                <section class="business-list">
                    <h2 class="font-heading mb-md">Registered Businesses</h2>
                    <div class="table-container glass">
                        <table>
                            <thead>
                                <tr>
                                    <th>Business Name</th>
                                    <th>Industry</th>
                                    <th>Campaigns</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${businesses.map(b => `
                                    <tr>
                                        <td>${b.business_name}</td>
                                        <td>${b.industry}</td>
                                        <td>${b.campaign_count}</td>
                                        <td>
                                            <button class="btn btn-outline btn-xs view-biz" data-id="${b.id}">
                                                Auditing ->
                                            </button>
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </section>
            </main>
        </div>
    `;

    document.getElementById('logoutBtn').addEventListener('click', logout);
};
