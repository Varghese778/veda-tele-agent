/**
 * @file frontend/js/pages/dashboard.js
 * @description MOD-15 — Main Business Dashboard with full campaign management,
 * real-time analytics, lead tracking, and AI agent status.
 */

import { api } from "../api.js";
import { state, logout } from "../auth.js";
import { navigate } from "../router.js";

// Polling interval state
let pollTimer = null;

const ensureJson = async (res) => {
    if (res && typeof res === 'object' && !res.json) return res;
    if (res && typeof res.json === 'function') return res.json();
    return res;
};

const statusColor = (status) => {
    const map = { active: '#22c55e', running: '#22c55e', paused: '#f59e0b', draft: '#64748b', completed: '#3b82f6' };
    return map[(status || '').toLowerCase()] || '#64748b';
};

export const renderDashboard = async (container) => {
    if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
    }

    let profile = { business_name: "Business" };
    let campaigns = [];
    let selectedCampaignId = null;

    try {
        const profileRes = await api.get("/api/business/profile");
        if (profileRes?.status === 404) {
            window.location.hash = "/onboarding";
            return;
        }
        profile = await ensureJson(profileRes);

        const campaignsRes = await api.get("/api/campaigns");
        const campaignsPayload = await ensureJson(campaignsRes);
        campaigns = campaignsPayload?.campaigns || campaignsPayload || [];
        if (!Array.isArray(campaigns)) campaigns = [];
    } catch (err) {
        console.error("[Dashboard] Initial load failed:", err.message);
    }

    const renderMainContent = () => {
        if (!selectedCampaignId) {
            return `
                <div class="campaigns-grid-view">
                    <div class="section-header flex justify-between items-center mb-lg">
                        <div>
                            <h2 class="font-heading text-2xl">Your Campaigns</h2>
                            <p class="text-muted text-sm">Select a campaign to view details and analytics.</p>
                        </div>
                        <button id="createCampaignBtn" class="btn btn-primary btn-sm" style="padding: 10px 20px; border-radius: 12px;">
                            <i class="fas fa-plus"></i> New Campaign
                        </button>
                    </div>
                    <div class="campaigns-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 16px;">
                        ${campaigns.length === 0 ? '<p class="text-muted" style="grid-column: 1/-1; text-align:center; padding: 40px;">No campaigns yet. Create your first one!</p>' : ''}
                        ${campaigns.map(c => `
                            <div class="campaign-card glass" style="padding: 20px; border-radius: 16px; cursor: pointer; transition: transform 0.2s, box-shadow 0.2s;" data-campaign-id="${c.id || c.campaign_id}">
                                <div class="flex justify-between items-center mb-md">
                                    <span class="badge" style="background: ${statusColor(c.status)}; color: white; padding: 4px 12px; border-radius: 20px; font-size: 0.75rem; font-weight: 600; text-transform: uppercase;">${c.status || 'draft'}</span>
                                    <div class="flex gap-sm">
                                        <button class="btn btn-outline btn-xs start-btn" data-id="${c.id || c.campaign_id}" title="Start" style="padding: 6px 10px; border-radius: 8px;"><i class="fas fa-play"></i></button>
                                        <button class="btn btn-outline btn-xs pause-btn" data-id="${c.id || c.campaign_id}" title="Pause" style="padding: 6px 10px; border-radius: 8px;"><i class="fas fa-pause"></i></button>
                                        <button class="btn btn-outline btn-xs delete-btn" data-id="${c.id || c.campaign_id}" title="Delete" style="padding: 6px 10px; border-radius: 8px; color: #ef4444;"><i class="fas fa-trash"></i></button>
                                    </div>
                                </div>
                                <h3 class="font-heading" style="font-size: 1.1rem; margin-bottom: 6px;">${c.campaign_name || c.name || 'Untitled'}</h3>
                                <p class="text-muted text-sm">${c.purpose || ""}</p>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        }

        const campaign = campaigns.find(c => (c.id || c.campaign_id) === selectedCampaignId) || {};
        return `
            <div class="campaign-detail-view">
                <div class="flex items-center gap-md mb-lg">
                    <button id="backToList" class="btn btn-outline btn-sm" style="padding: 8px 14px; border-radius: 10px;">
                        <i class="fas fa-arrow-left"></i> Back
                    </button>
                    <div>
                        <h2 class="font-heading text-2xl">${campaign.campaign_name || campaign.name || 'Campaign'}</h2>
                        <p class="text-muted text-sm">${campaign.purpose || ""}</p>
                    </div>
                    <div id="aiAgentOverlay" class="hidden" style="margin-left:auto; display:flex; align-items:center; padding: 8px 16px; background: rgba(34,197,94,0.15); border:1px solid rgba(34,197,94,0.3); border-radius: 30px;">
                        <i class="fas fa-robot text-primary"></i>
                        <span class="font-semibold text-sm" style="margin-left: 8px;">Active</span>
                    </div>
                </div>

                <!-- Stats Cards -->
                <div class="stats-grid" style="display:grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 24px;">
                    <div class="stat-card glass" style="padding: 20px; border-radius: 14px; text-align: center;">
                        <span class="text-muted text-sm">Total Calls</span>
                        <h2 id="statTotalCalls" class="font-heading" style="font-size: 2rem; margin-top: 4px;">0</h2>
                    </div>
                    <div class="stat-card glass" style="padding: 20px; border-radius: 14px; text-align: center;">
                        <span class="text-muted text-sm">Qualified</span>
                        <h2 id="statQualified" class="font-heading" style="font-size: 2rem; margin-top: 4px;">0</h2>
                    </div>
                    <div class="stat-card glass" style="padding: 20px; border-radius: 14px; text-align: center;">
                        <span class="text-muted text-sm">Completed</span>
                        <h2 id="statCompleted" class="font-heading" style="font-size: 2rem; margin-top: 4px;">0</h2>
                    </div>
                    <div class="stat-card glass" style="padding: 20px; border-radius: 14px; text-align: center;">
                        <span class="text-muted text-sm">Conversion</span>
                        <h2 id="statConversion" class="font-heading" style="font-size: 2rem; margin-top: 4px;">0%</h2>
                    </div>
                </div>

                <!-- Charts + Panels -->
                <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px;">
                    <div class="glass" style="padding: 20px; border-radius: 14px;">
                        <h3 class="font-heading mb-md text-sm">Lead Funnel</h3>
                        <canvas id="funnelChart" height="200"></canvas>
                    </div>
                    <div class="glass" style="padding: 20px; border-radius: 14px;">
                        <h3 class="font-heading mb-md text-sm">AI Intent Breakdown</h3>
                        <canvas id="intentChart" height="200"></canvas>
                    </div>
                </div>

                <!-- Lead Table + Side Panels -->
                <div style="display:grid; grid-template-columns: 2fr 1fr; gap: 16px;">
                    <div>
                        <!-- Lead Table -->
                        <div class="glass" style="padding: 20px; border-radius: 14px; margin-bottom: 16px;">
                            <div class="flex justify-between items-center mb-md">
                                <h3 class="font-heading text-sm">Lead Records</h3>
                                <label class="btn btn-outline btn-xs" style="padding: 6px 14px; border-radius: 10px; cursor: pointer;">
                                    <i class="fas fa-upload"></i> Import CSV
                                    <input type="file" id="csvInput" style="display:none" accept=".csv">
                                </label>
                            </div>
                            <div style="overflow-x: auto;">
                                <table id="leadTable" style="width:100%;">
                                    <thead>
                                        <tr>
                                            <th>Customer</th>
                                            <th>Phone</th>
                                            <th>Email</th>
                                            <th>Status</th>
                                            <th>Intent</th>
                                        </tr>
                                    </thead>
                                    <tbody id="leadBody">
                                        <tr><td colspan="5" class="text-muted" style="text-align:center; padding:20px;">Loading...</td></tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>

                    <!-- Side Panels -->
                    <div class="flex flex-col gap-md">
                        <div class="glass" style="padding: 20px; border-radius: 14px;">
                            <h3 class="font-heading mb-md text-sm flex items-center gap-sm">
                                <span class="pulse-dot"></span> Live Activity
                            </h3>
                            <div id="agentLogsArea" style="max-height: 200px; overflow-y: auto; font-size: 0.8rem;">
                                <p class="text-muted italic">Waiting for activity...</p>
                            </div>
                        </div>
                        <div class="glass" style="padding: 20px; border-radius: 14px;">
                            <h3 class="font-heading mb-md text-sm">AI Insights</h3>
                            <div id="insightContent" class="text-muted text-sm">
                                Analytics will appear when leads are processed.
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    };

    // ── Create Campaign Modal HTML ──────────────────────────
    const createCampaignModalHTML = `
        <div id="createCampaignModal" class="modal-overlay hidden" style="position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.6); display:flex; align-items:center; justify-content:center; z-index:1000;">
            <div class="glass" style="width: 100%; max-width: 500px; padding: 32px; border-radius: 20px;">
                <div class="flex justify-between items-center mb-lg">
                    <h3 class="font-heading">Create Campaign</h3>
                    <button id="closeCreateModal" class="btn btn-outline icon-btn" style="padding: 6px 10px;"><i class="fas fa-times"></i></button>
                </div>
                <p class="text-muted text-sm mb-lg">Set up your outreach campaign details.</p>
                <form id="createCampaignForm" style="display: flex; flex-direction: column; gap: 16px;">
                    <div class="form-group">
                        <label>Campaign Name</label>
                        <input type="text" id="campaignNameInput" placeholder="e.g. Q1 Solar Outreach" required style="padding: 12px; border-radius: 10px;">
                    </div>
                    <div class="form-group">
                        <label>Purpose / Goal</label>
                        <textarea id="campaignPurposeInput" rows="3" placeholder="What is the goal of this campaign?" required style="padding: 12px; border-radius: 10px; resize: vertical;"></textarea>
                    </div>
                    <button type="submit" class="btn btn-primary" style="padding: 14px; border-radius: 12px; font-weight: 600;">
                        <i class="fas fa-rocket"></i> Create Campaign
                    </button>
                </form>
            </div>
        </div>
    `;

    // ── User avatar ─────────────────────────────────────────
    const userPhotoUrl = state.user?.photo_url || state.user?.photoURL || '';
    const avatarHTML = userPhotoUrl
        ? `<img src="${userPhotoUrl}" alt="Profile" style="width:32px; height:32px; border-radius:50%; border: 2px solid var(--color-primary);" referrerpolicy="no-referrer">`
        : `<div style="width:32px; height:32px; border-radius:50%; background: var(--color-primary); display:flex; align-items:center; justify-content:center; color:white; font-weight:700; font-size:0.8rem;">${(state.user?.email || 'U')[0].toUpperCase()}</div>`;

    // ── Mount View ──────────────────────────────────────────
    container.innerHTML = `
        <div class="dashboard-page animate-fade-in">
            <nav class="navbar glass">
                <div class="container flex justify-between items-center">
                    <div class="logo font-heading flex items-center gap-md">
                        <i class="fas fa-microchip text-primary"></i>
                        <span>VEDA</span>
                    </div>
                    <div class="nav-actions flex items-center gap-md">
                        <span class="text-muted text-sm" style="display:none;">${state.user?.email || ''}</span>
                        ${avatarHTML}
                        <button id="settingsBtn" class="btn btn-outline icon-btn" title="Settings" style="padding: 8px 10px; border-radius: 10px;">
                            <i class="fas fa-cog"></i>
                        </button>
                        <button id="logoutBtn" class="btn btn-outline btn-sm" style="padding: 8px 14px; border-radius: 10px;">
                            Sign Out
                        </button>
                    </div>
                </div>
            </nav>

            <main class="container p-lg">
                <header class="dash-header mb-xl">
                    <h1 class="text-3xl font-heading">Welcome back, ${profile.business_name || "Business Owner"}</h1>
                    <p class="text-muted">Manage your campaigns and track lead performance.</p>
                </header>
                <div id="mainContent">
                    ${renderMainContent()}
                </div>
            </main>
        </div>
        ${createCampaignModalHTML}
    `;

    // ── Helper: Get Selected Campaign ──────────────────────
    const getSelectedCampaign = () => campaigns.find(c => (c.id || c.campaign_id) === selectedCampaignId);

    // ── Attach Navigation Events ───────────────────────────
    document.getElementById('logoutBtn').addEventListener('click', logout);
    document.getElementById('settingsBtn').addEventListener('click', () => navigate('/settings'));

    // ── Chart instances ────────────────────────────────────
    let funnelChartInstance = null;
    let intentChartInstance = null;

    const initCharts = () => {
        const funnelCanvas = document.getElementById('funnelChart');
        const intentCanvas = document.getElementById('intentChart');
        if (!funnelCanvas || !intentCanvas) return;

        if (typeof Chart === 'undefined') return;

        funnelChartInstance = new Chart(funnelCanvas.getContext('2d'), {
            type: 'bar',
            data: {
                labels: ['Pending', 'Email Sent', 'Widget Opened', 'Calling', 'Completed', 'Failed'],
                datasets: [{
                    label: 'Leads',
                    data: [0, 0, 0, 0, 0, 0],
                    backgroundColor: ['#64748b', '#3b82f6', '#8b5cf6', '#f59e0b', '#22c55e', '#ef4444'],
                    borderRadius: 6,
                }]
            },
            options: {
                responsive: true,
                plugins: { legend: { display: false } },
                scales: {
                    y: { beginAtZero: true, ticks: { color: '#94a3b8' }, grid: { color: 'rgba(148,163,184,0.1)' } },
                    x: { ticks: { color: '#94a3b8', font: { size: 10 } }, grid: { display: false } }
                }
            }
        });

        intentChartInstance = new Chart(intentCanvas.getContext('2d'), {
            type: 'doughnut',
            data: {
                labels: ['Interested', 'Not Interested', 'Callback'],
                datasets: [{
                    data: [0, 0, 0],
                    backgroundColor: ['#22c55e', '#ef4444', '#f59e0b'],
                    borderWidth: 0,
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: { position: 'bottom', labels: { color: '#94a3b8', font: { size: 11 } } }
                }
            }
        });
    };

    // ── Update Stats ───────────────────────────────────────
    const updateStats = (analytics) => {
        const el = (id) => document.getElementById(id);
        if (el('statTotalCalls')) el('statTotalCalls').innerText = analytics.total_calls || analytics.total_leads || 0;
        if (el('statQualified')) el('statQualified').innerText = analytics.qualified_leads || 0;
        if (el('statCompleted')) el('statCompleted').innerText = analytics.completed_calls || 0;
        if (el('statConversion')) el('statConversion').innerText = `${analytics.conversion_rate || 0}%`;

        const sb = analytics.status_breakdown || analytics.call_status_breakdown || {};
        if (funnelChartInstance) {
            funnelChartInstance.data.datasets[0].data = [
                sb.pending || 0, sb.email_sent || 0, sb.widget_started || 0,
                sb.calling || 0, sb.completed || 0, sb.failed || 0
            ];
            funnelChartInstance.update('none');
        }

        const ib = analytics.intent_breakdown || {};
        if (intentChartInstance) {
            intentChartInstance.data.datasets[0].data = [ib.INTERESTED || 0, ib.NOT_INTERESTED || 0, ib.CALLBACK || 0];
            intentChartInstance.update('none');
        }

        const insightEl = document.getElementById('insightContent');
        if (insightEl && (ib.INTERESTED || ib.NOT_INTERESTED || ib.CALLBACK)) {
            const total = (ib.INTERESTED || 0) + (ib.NOT_INTERESTED || 0) + (ib.CALLBACK || 0);
            insightEl.innerHTML = `
                <div style="display:flex; flex-direction:column; gap: 8px;">
                    <div class="flex justify-between"><span>Interested</span><span class="font-semibold" style="color:#22c55e;">${ib.INTERESTED || 0}</span></div>
                    <div class="flex justify-between"><span>Not Interested</span><span class="font-semibold" style="color:#ef4444;">${ib.NOT_INTERESTED || 0}</span></div>
                    <div class="flex justify-between"><span>Callback</span><span class="font-semibold" style="color:#f59e0b;">${ib.CALLBACK || 0}</span></div>
                    <hr style="border-color: var(--color-border); margin: 4px 0;">
                    <div class="flex justify-between"><span>Total Analyzed</span><span class="font-semibold">${total}</span></div>
                </div>
            `;
        }
    };

    // ── Update Lead Table ──────────────────────────────────
    const updateLeadTable = (leads) => {
        const tbody = document.getElementById('leadBody');
        if (!tbody) return;
        if (!leads || leads.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-muted" style="text-align:center; padding:20px;">No leads yet. Import a CSV to get started.</td></tr>';
            return;
        }
        tbody.innerHTML = leads.map(l => `
            <tr>
                <td>${l.customer_name || '--'}</td>
                <td>${l.phone_number || '--'}</td>
                <td>${l.email || '--'}</td>
                <td><span class="badge" style="background: ${statusColor(l.call_status)}; color:white; padding: 3px 10px; border-radius: 12px; font-size: 0.7rem;">${l.call_status || 'pending'}</span></td>
                <td>${l.extracted_data?.intent || '--'}</td>
            </tr>
        `).join('');
    };

    // ── Agent Log Helper ───────────────────────────────────
    const logToAgentModal = (message) => {
        const agentLogsArea = document.getElementById('agentLogsArea');
        if (!agentLogsArea) return;
        const time = new Date().toLocaleTimeString();
        const logLine = document.createElement('div');
        logLine.className = "mb-1";
        logLine.innerHTML = `<span class="text-muted">[${time}]</span> ${message}`;
        agentLogsArea.appendChild(logLine);
        agentLogsArea.scrollTop = agentLogsArea.scrollHeight;
    };

    // ── Refresh Campaign Data ──────────────────────────────
    const refreshSelectedCampaignData = async () => {
        if (!selectedCampaignId) return;

        const campaign = getSelectedCampaign();
        const aiOverlay = document.getElementById("aiAgentOverlay");
        if (aiOverlay && campaign) {
            const status = (campaign.status || "").toUpperCase();
            if (status === "RUNNING" || status === "ACTIVE") {
                aiOverlay.classList.remove("hidden");
            } else {
                aiOverlay.classList.add("hidden");
            }
        }

        try {
            const [analyticsRes, leadsRes] = await Promise.all([
                api.get(`/api/campaigns/${selectedCampaignId}/analytics`),
                api.get(`/api/campaigns/${selectedCampaignId}/leads`),
            ]);

            const analytics = await ensureJson(analyticsRes);
            const leadsPayload = await ensureJson(leadsRes);
            updateStats(analytics);

            const currentLeads = leadsPayload?.leads || leadsPayload || [];
            updateLeadTable(Array.isArray(currentLeads) ? currentLeads : []);
        } catch (err) {
            console.warn("[Dashboard] Polling error:", err.message);
        }
    };

    // ── Attach Dynamic Events ──────────────────────────────
    const attachDynamicEvents = () => {
        // Campaign card clicks
        document.querySelectorAll('.campaign-card').forEach(card => {
            card.addEventListener('click', (e) => {
                if (e.target.closest('.start-btn') || e.target.closest('.pause-btn') || e.target.closest('.delete-btn')) return;
                selectedCampaignId = card.dataset.campaignId;
                document.getElementById('mainContent').innerHTML = renderMainContent();
                attachDynamicEvents();
                initCharts();
                refreshSelectedCampaignData();
                pollTimer = setInterval(refreshSelectedCampaignData, 5000);
            });
        });

        // Back button
        const backBtn = document.getElementById('backToList');
        if (backBtn) {
            backBtn.addEventListener('click', () => {
                if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
                selectedCampaignId = null;
                document.getElementById('mainContent').innerHTML = renderMainContent();
                attachDynamicEvents();
            });
        }

        // Create campaign button
        const createBtn = document.getElementById('createCampaignBtn');
        if (createBtn) {
            createBtn.addEventListener('click', () => {
                document.getElementById('createCampaignModal').classList.remove('hidden');
            });
        }

        // Close create modal
        const closeCreateModal = document.getElementById('closeCreateModal');
        if (closeCreateModal) {
            closeCreateModal.addEventListener('click', () => {
                document.getElementById('createCampaignModal').classList.add('hidden');
            });
        }

        // Create campaign form
        const createForm = document.getElementById('createCampaignForm');
        if (createForm) {
            createForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const name = document.getElementById('campaignNameInput').value.trim();
                const purpose = document.getElementById('campaignPurposeInput').value.trim();
                if (!name || !purpose) return alert('Please fill all fields.');

                try {
                    const res = await api.post('/api/campaigns', { campaign_name: name, purpose });
                    const newCampaign = await ensureJson(res);
                    campaigns.push(newCampaign.campaign || newCampaign);
                    document.getElementById('createCampaignModal').classList.add('hidden');
                    document.getElementById('mainContent').innerHTML = renderMainContent();
                    attachDynamicEvents();
                } catch (err) {
                    alert('Failed to create campaign: ' + err.message);
                }
            });
        }

        // Start/Pause/Delete buttons
        document.querySelectorAll('.start-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                try {
                    await api.post(`/api/campaigns/${btn.dataset.id}/start`);
                    const c = campaigns.find(c => (c.id || c.campaign_id) === btn.dataset.id);
                    if (c) c.status = 'active';
                    document.getElementById('mainContent').innerHTML = renderMainContent();
                    attachDynamicEvents();
                } catch (err) { alert('Failed to start: ' + err.message); }
            });
        });

        document.querySelectorAll('.pause-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                try {
                    await api.post(`/api/campaigns/${btn.dataset.id}/pause`);
                    const c = campaigns.find(c => (c.id || c.campaign_id) === btn.dataset.id);
                    if (c) c.status = 'paused';
                    document.getElementById('mainContent').innerHTML = renderMainContent();
                    attachDynamicEvents();
                } catch (err) { alert('Failed to pause: ' + err.message); }
            });
        });

        document.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                if (!confirm('Delete this campaign and all its leads?')) return;
                try {
                    await api.delete(`/api/campaigns/${btn.dataset.id}`);
                    campaigns = campaigns.filter(c => (c.id || c.campaign_id) !== btn.dataset.id);
                    document.getElementById('mainContent').innerHTML = renderMainContent();
                    attachDynamicEvents();
                } catch (err) { alert('Failed to delete: ' + err.message); }
            });
        });

        // CSV upload
        const csvInput = document.getElementById('csvInput');
        if (csvInput) {
            csvInput.addEventListener('change', async (e) => {
                if (!selectedCampaignId) return alert('Please select a campaign first.');
                const file = e.target.files[0];
                if (!file) return;

                const formData = new FormData();
                formData.append('file', file);

                try {
                    const result = await api.upload(`/api/campaigns/${selectedCampaignId}/upload`, formData);
                    const data = await ensureJson(result);
                    alert(`Upload complete: ${data.accepted || 0} accepted, ${data.rejected || 0} rejected.`);
                    refreshSelectedCampaignData();
                } catch (err) {
                    alert('Upload failed: ' + err.message);
                }
            });
        }
    };

    // ── Initialize ─────────────────────────────────────────
    attachDynamicEvents();
};
