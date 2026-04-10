/**
 * @file frontend/js/pages/dashboard.js
 * @description MOD-15 — Main Business Dashboard with full campaign management,
 * real-time analytics, lead tracking, and AI agent status.
 * Matches the original UI layout with Active tag on left, action buttons on right.
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
    const map = {
        active: '#22c55e', running: '#22c55e', paused: '#f59e0b', draft: '#64748b',
        completed: '#3b82f6', email_sent: '#3b82f6', widget_started: '#8b5cf6',
        qualified: '#22c55e', call_booked: '#14b8a6', calling: '#f59e0b',
        not_interested: '#ef4444', failed: '#ef4444', pending: '#64748b',
        callback: '#f59e0b'
    };
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

    // ── Campaign List View ─────────────────────────────────
    const renderCampaignList = () => `
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
            <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 16px;">
                ${campaigns.length === 0 ? '<p class="text-muted" style="grid-column: 1/-1; text-align:center; padding: 40px;">No campaigns yet. Create your first one!</p>' : ''}
                ${campaigns.map(c => `
                    <div class="campaign-card glass" style="padding: 20px; border-radius: 16px; cursor: pointer; transition: transform 0.2s, box-shadow 0.2s;" data-campaign-id="${c.id || c.campaign_id}">
                        <div class="flex justify-between items-center mb-md">
                            <span style="background: ${statusColor(c.status)}; color: white; padding: 4px 12px; border-radius: 20px; font-size: 0.7rem; font-weight: 600; text-transform: uppercase;">${c.status || 'draft'}</span>
                        </div>
                        <h3 class="font-heading" style="font-size: 1.1rem; margin-bottom: 6px;">${c.campaign_name || c.name || 'Untitled'}</h3>
                        <p class="text-muted text-sm" style="line-height:1.4;">${c.purpose || ""}</p>
                    </div>
                `).join('')}
            </div>
        </div>
    `;

    // ── Campaign Detail View ───────────────────────────────
    const renderCampaignDetail = () => {
        const campaign = campaigns.find(c => (c.id || c.campaign_id) === selectedCampaignId) || {};
        const cStatus = (campaign.status || 'draft').toUpperCase();
        return `
            <div class="campaign-detail-view">
                <!-- Header: Back + Title -->
                <div class="flex items-center gap-md mb-lg">
                    <button id="backToList" class="btn btn-outline btn-sm" style="padding: 8px 16px; border-radius: 10px; font-size: 0.85rem;">
                        <i class="fas fa-arrow-left"></i> Campaigns
                    </button>
                    <h2 class="font-heading" style="font-size: 1.4rem;">${campaign.campaign_name || campaign.name || 'Campaign'}</h2>
                </div>

                <!-- Purpose Box with ACTIVE tag on left, buttons on right -->
                <div class="glass" style="padding: 16px 20px; border-radius: 14px; margin-bottom: 24px;">
                    <p class="text-muted text-sm" style="margin-bottom: 12px; line-height: 1.5;">${campaign.purpose || "No description provided."}</p>
                    <div class="flex items-center" style="gap: 8px; flex-wrap: wrap;">
                        <span style="background: ${statusColor(campaign.status)}; color: white; padding: 4px 14px; border-radius: 20px; font-size: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">${cStatus}</span>
                        <div style="flex: 1;"></div>
                        <button class="btn btn-primary btn-sm action-start" data-id="${selectedCampaignId}" style="padding: 7px 16px; border-radius: 10px; font-size: 0.8rem;">
                            <i class="fas fa-play"></i> Start
                        </button>
                        <button class="btn btn-outline btn-sm action-pause" data-id="${selectedCampaignId}" style="padding: 7px 16px; border-radius: 10px; font-size: 0.8rem;">
                            <i class="fas fa-pause"></i> Pause
                        </button>
                        <button class="btn btn-outline btn-sm action-clear" data-id="${selectedCampaignId}" style="padding: 7px 16px; border-radius: 10px; font-size: 0.8rem; color: #3b82f6; border-color: #3b82f6;">
                            <i class="fas fa-broom"></i> Clear Leads
                        </button>
                        <button class="btn btn-outline btn-sm action-delete" data-id="${selectedCampaignId}" style="padding: 7px 16px; border-radius: 10px; font-size: 0.8rem; color: #ef4444; border-color: #ef4444;">
                            <i class="fas fa-trash"></i> Delete
                        </button>
                    </div>
                </div>

                <!-- 4 Stats Cards: Emails Sent, Widget Sessions, Qualified, Conversion -->
                <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 24px;">
                    <div class="glass" style="padding: 20px; border-radius: 14px;">
                        <div style="display:flex; align-items:center; gap: 8px; margin-bottom: 8px;">
                            <span style="background: rgba(59,130,246,0.15); padding: 8px; border-radius: 10px;"><i class="fas fa-envelope" style="color: #3b82f6;"></i></span>
                        </div>
                        <span class="text-muted text-sm" style="text-transform: uppercase; letter-spacing: 0.5px; font-size: 0.7rem;">Emails Sent</span>
                        <h2 id="statEmails" class="font-heading" style="font-size: 2rem; margin-top: 4px;">0</h2>
                    </div>
                    <div class="glass" style="padding: 20px; border-radius: 14px;">
                        <div style="display:flex; align-items:center; gap: 8px; margin-bottom: 8px;">
                            <span style="background: rgba(139,92,246,0.15); padding: 8px; border-radius: 10px;"><i class="fas fa-microphone" style="color: #8b5cf6;"></i></span>
                        </div>
                        <span class="text-muted text-sm" style="text-transform: uppercase; letter-spacing: 0.5px; font-size: 0.7rem;">Widget Sessions</span>
                        <h2 id="statWidgets" class="font-heading" style="font-size: 2rem; margin-top: 4px;">0</h2>
                    </div>
                    <div class="glass" style="padding: 20px; border-radius: 14px;">
                        <div style="display:flex; align-items:center; gap: 8px; margin-bottom: 8px;">
                            <span style="background: rgba(34,197,94,0.15); padding: 8px; border-radius: 10px;"><i class="fas fa-check-circle" style="color: #22c55e;"></i></span>
                        </div>
                        <span class="text-muted text-sm" style="text-transform: uppercase; letter-spacing: 0.5px; font-size: 0.7rem;">Qualified</span>
                        <h2 id="statQualified" class="font-heading" style="font-size: 2rem; margin-top: 4px;">0</h2>
                    </div>
                    <div class="glass" style="padding: 20px; border-radius: 14px;">
                        <div style="display:flex; align-items:center; gap: 8px; margin-bottom: 8px;">
                            <span style="background: rgba(245,158,11,0.15); padding: 8px; border-radius: 10px;"><i class="fas fa-percentage" style="color: #f59e0b;"></i></span>
                        </div>
                        <span class="text-muted text-sm" style="text-transform: uppercase; letter-spacing: 0.5px; font-size: 0.7rem;">Conversion</span>
                        <h2 id="statConversion" class="font-heading" style="font-size: 2rem; margin-top: 4px;">0%</h2>
                    </div>
                </div>

                <!-- Charts: Lead Funnel + AI Intent Breakdown -->
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px;">
                    <div class="glass" style="padding: 20px; border-radius: 14px;">
                        <h3 class="font-heading" style="font-size: 0.95rem; margin-bottom: 12px;">Lead Funnel</h3>
                        <canvas id="funnelChart" height="200"></canvas>
                    </div>
                    <div class="glass" style="padding: 20px; border-radius: 14px;">
                        <h3 class="font-heading" style="font-size: 0.95rem; margin-bottom: 12px;">AI Intent Breakdown</h3>
                        <canvas id="intentChart" height="200"></canvas>
                    </div>
                </div>

                <!-- Lead Records + Side Panels (Live Activity + AI Insights) -->
                <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 16px;">
                    <!-- Lead Records -->
                    <div>
                        <div class="flex justify-between items-center mb-md">
                            <h3 class="font-heading" style="font-size: 1.1rem;">Lead Records</h3>
                            <label class="btn btn-outline btn-sm" style="padding: 8px 16px; border-radius: 10px; cursor: pointer;">
                                <i class="fas fa-upload"></i> Import CSV
                                <input type="file" id="csvInput" style="display:none" accept=".csv">
                            </label>
                        </div>
                        <div class="glass" style="padding: 16px; border-radius: 14px;">
                            <div style="overflow-x: auto;">
                                <table id="leadTable" style="width:100%; border-collapse: collapse;">
                                    <thead>
                                        <tr>
                                            <th style="text-align:left; padding: 10px 12px; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.5px; color: #94a3b8;">Customer</th>
                                            <th style="text-align:left; padding: 10px 12px; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.5px; color: #94a3b8;">Email</th>
                                            <th style="text-align:left; padding: 10px 12px; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.5px; color: #94a3b8;">Status</th>
                                            <th style="text-align:left; padding: 10px 12px; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.5px; color: #94a3b8;">Intent</th>
                                            <th style="text-align:left; padding: 10px 12px; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.5px; color: #94a3b8;">Duration</th>
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
                    <div style="display: flex; flex-direction: column; gap: 16px;">
                        <!-- Live Activity -->
                        <div class="glass" style="padding: 20px; border-radius: 14px;">
                            <h3 class="font-heading" style="font-size: 0.95rem; margin-bottom: 14px; display: flex; align-items: center; gap: 8px;">
                                <span class="pulse-dot" style="width:10px; height:10px; background:#22c55e; border-radius:50%; display:inline-block;"></span> Live Activity
                            </h3>
                            <div id="liveActivityContent" style="display:flex; flex-direction:column; gap: 10px; font-size: 0.85rem;">
                                <div class="flex justify-between"><span>📧 Emails Sent</span><span id="liveEmails">0</span></div>
                                <div class="flex justify-between"><span>🎙 Widget Sessions</span><span id="liveWidgets">0</span></div>
                                <div class="flex justify-between"><span>✅ Qualified</span><span id="liveQualified" style="color:#22c55e; font-weight:600;">0</span></div>
                                <div class="flex justify-between"><span>📞 Call Booked</span><span id="liveCallBooked" style="color:#f59e0b; font-weight:600;">0</span></div>
                                <div class="flex justify-between"><span>✔ Completed</span><span id="liveCompleted">0</span></div>
                                <div class="flex justify-between"><span>✖ Failed</span><span id="liveFailed" style="color:#ef4444; font-weight:600;">0</span></div>
                                <hr style="border-color: rgba(148,163,184,0.15); margin: 4px 0;">
                                <div class="flex justify-between"><span>Total Leads</span><span id="liveTotalLeads" style="color:#22c55e; font-weight:600;">0</span></div>
                            </div>
                        </div>

                        <!-- AI Insights -->
                        <div class="glass" style="padding: 20px; border-radius: 14px;">
                            <h3 class="font-heading" style="font-size: 0.95rem; margin-bottom: 14px; display: flex; align-items: center; gap: 8px;">
                                <i class="fas fa-brain" style="color: #22c55e;"></i> AI Insights
                            </h3>
                            <div id="insightContent" style="display:flex; flex-direction:column; gap: 10px; font-size: 0.85rem;">
                                <div class="flex justify-between"><span>● Interested</span><span id="insightInterested">0</span></div>
                                <div class="flex justify-between"><span>● Callback</span><span id="insightCallback">0</span></div>
                                <div class="flex justify-between"><span>● Not Interested</span><span id="insightNotInterested">0</span></div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    };

    // ── Create Campaign Modal ──────────────────────────────
    const createCampaignModalHTML = `
        <div id="createCampaignModal" class="modal-overlay hidden" style="position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.6); display:flex; align-items:center; justify-content:center; z-index:1000;">
            <div class="glass" style="width:100%; max-width:500px; padding:32px; border-radius:20px;">
                <div class="flex justify-between items-center mb-lg">
                    <h3 class="font-heading">Create Campaign</h3>
                    <button id="closeCreateModal" class="btn btn-outline icon-btn" style="padding:6px 10px;"><i class="fas fa-times"></i></button>
                </div>
                <p class="text-muted text-sm mb-lg">Set up your outreach campaign details.</p>
                <form id="createCampaignForm" style="display:flex; flex-direction:column; gap:16px;">
                    <div class="form-group">
                        <label>Campaign Name</label>
                        <input type="text" id="campaignNameInput" placeholder="e.g. Q1 Solar Outreach" required style="padding:12px; border-radius:10px;">
                    </div>
                    <div class="form-group">
                        <label>Purpose / Goal</label>
                        <textarea id="campaignPurposeInput" rows="3" placeholder="What is the goal of this campaign?" required style="padding:12px; border-radius:10px; resize:vertical;"></textarea>
                    </div>
                    <button type="submit" class="btn btn-primary" style="padding:14px; border-radius:12px; font-weight:600;">
                        <i class="fas fa-rocket"></i> Create Campaign
                    </button>
                </form>
            </div>
        </div>
    `;

    // ── Veda Agent Modal ───────────────────────────────────
    const agentModalHTML = `
        <div id="agentModal" class="modal-overlay hidden" style="position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.5); display:flex; align-items:center; justify-content:center; z-index:1000;">
            <div class="glass" style="width:100%; max-width:560px; padding:28px; border-radius:20px;">
                <div class="flex justify-between items-center mb-md">
                    <h3 class="font-heading" style="display:flex; align-items:center; gap:8px;">
                        <i class="fas fa-robot text-primary"></i> Veda Agent — Live Engine
                    </h3>
                    <button id="closeAgentModal" class="btn btn-outline icon-btn" style="padding:6px 10px;"><i class="fas fa-times"></i></button>
                </div>
                <div id="agentLogsArea" style="min-height:250px; max-height:350px; overflow-y:auto; background:var(--color-surface); border-radius:12px; padding:14px; font-size:0.8rem; font-family:monospace;">
                    <p class="text-muted italic">Connecting to orchestrator...</p>
                </div>
                <p class="text-muted text-sm" style="margin-top:12px;">Note: If calls aren't dialing, ensure TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN are set in your environment configuration.</p>
            </div>
        </div>
    `;

    // ── User avatar for nav ────────────────────────────────
    const userPhotoUrl = state.user?.photo_url || state.user?.photoURL || '';
    const avatarHTML = userPhotoUrl
        ? `<img src="${userPhotoUrl}" alt="Profile" style="width:32px; height:32px; border-radius:50%; border: 2px solid var(--color-primary);" referrerpolicy="no-referrer">`
        : `<div style="width:32px; height:32px; border-radius:50%; background: var(--color-primary); display:flex; align-items:center; justify-content:center; color:white; font-weight:700; font-size:0.8rem;">${(state.user?.email || 'U')[0].toUpperCase()}</div>`;

    // ── Mount View ─────────────────────────────────────────
    const renderMainContent = () => selectedCampaignId ? renderCampaignDetail() : renderCampaignList();

    container.innerHTML = `
        <div class="dashboard-page animate-fade-in">
            <nav class="navbar glass">
                <div class="container flex justify-between items-center">
                    <div class="logo font-heading flex items-center gap-md">
                        <i class="fas fa-bolt text-primary"></i>
                        <span>VEDA</span>
                    </div>
                    <div class="nav-actions flex items-center gap-md">
                        <span class="text-muted text-sm">${state.user?.email || ''}</span>
                        ${avatarHTML}
                        <button id="settingsBtn" class="btn btn-outline icon-btn" title="Settings" style="padding: 8px 10px; border-radius: 10px;">
                            <i class="fas fa-cog"></i>
                        </button>
                        <button id="logoutBtn" class="btn btn-outline btn-sm" style="padding: 8px 16px; border-radius: 10px;">Sign Out</button>
                    </div>
                </div>
            </nav>

            <main class="container p-lg">
                <header class="dash-header mb-xl">
                    <h1 class="text-3xl font-heading">Welcome back, ${profile.business_name || "Business Owner"}</h1>
                    <p class="text-muted">Manage your campaigns and track lead performance.</p>
                </header>
                <div id="mainContent">${renderMainContent()}</div>
            </main>

            <!-- Floating AI Agent Button -->
            <button id="floatingAiBtn" class="floating-ai-btn glass animate-pulse" title="AI Agent Status" style="position:fixed; bottom:24px; right:24px; width:auto; padding:10px 20px; border-radius:30px; display:flex; align-items:center; gap:8px; z-index:999; cursor:pointer; border:1px solid rgba(34,197,94,0.3); background:rgba(34,197,94,0.1);">
                <i class="fas fa-robot" style="color:#22c55e;"></i>
                <span style="font-size:0.8rem; font-weight:600; color:#22c55e;">Active</span>
            </button>
        </div>
        ${createCampaignModalHTML}
        ${agentModalHTML}
    `;

    // ── Chart instances ────────────────────────────────────
    let funnelChartInstance = null;
    let intentChartInstance = null;

    const initCharts = () => {
        const funnelCanvas = document.getElementById('funnelChart');
        const intentCanvas = document.getElementById('intentChart');
        if (!funnelCanvas || !intentCanvas || typeof Chart === 'undefined') return;

        funnelChartInstance = new Chart(funnelCanvas.getContext('2d'), {
            type: 'bar',
            data: {
                labels: ['Pending', 'Email Sent', 'Widget', 'Qualified', 'Call Booked', 'Calling', 'Completed', 'Failed'],
                datasets: [{
                    label: 'Leads',
                    data: [0, 0, 0, 0, 0, 0, 0, 0],
                    backgroundColor: ['#64748b', '#3b82f6', '#8b5cf6', '#22c55e', '#14b8a6', '#f59e0b', '#22c55e', '#ef4444'],
                    borderRadius: 4,
                }]
            },
            options: {
                responsive: true,
                plugins: { legend: { display: false } },
                scales: {
                    y: { beginAtZero: true, ticks: { color: '#94a3b8', stepSize: 1 }, grid: { color: 'rgba(148,163,184,0.08)' } },
                    x: { ticks: { color: '#94a3b8', font: { size: 9 } }, grid: { display: false } }
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
                plugins: { legend: { position: 'bottom', labels: { color: '#94a3b8', font: { size: 11 }, padding: 16 } } }
            }
        });
    };

    // ── Update Stats ───────────────────────────────────────
    const updateStats = (analytics) => {
        const el = (id) => document.getElementById(id);
        const sb = analytics.status_breakdown || analytics.call_status_breakdown || {};
        const ib = analytics.intent_breakdown || {};

        // Stat cards
        if (el('statEmails')) el('statEmails').innerText = sb.email_sent || 0;
        if (el('statWidgets')) el('statWidgets').innerText = sb.widget_started || 0;
        if (el('statQualified')) el('statQualified').innerText = analytics.qualified_leads || (sb.qualified || 0);
        if (el('statConversion')) el('statConversion').innerText = `${analytics.conversion_rate || 0}%`;

        // Live Activity panel
        if (el('liveEmails')) el('liveEmails').innerText = sb.email_sent || 0;
        if (el('liveWidgets')) el('liveWidgets').innerText = sb.widget_started || 0;
        if (el('liveQualified')) el('liveQualified').innerText = sb.qualified || 0;
        if (el('liveCallBooked')) el('liveCallBooked').innerText = sb.call_booked || sb.calling || 0;
        if (el('liveCompleted')) el('liveCompleted').innerText = sb.completed || 0;
        if (el('liveFailed')) el('liveFailed').innerText = sb.failed || 0;
        if (el('liveTotalLeads')) el('liveTotalLeads').innerText = analytics.total_calls || analytics.total_leads || 0;

        // AI Insights panel
        if (el('insightInterested')) el('insightInterested').innerText = ib.INTERESTED || 0;
        if (el('insightCallback')) el('insightCallback').innerText = ib.CALLBACK || 0;
        if (el('insightNotInterested')) el('insightNotInterested').innerText = ib.NOT_INTERESTED || 0;

        // Funnel chart
        if (funnelChartInstance) {
            funnelChartInstance.data.datasets[0].data = [
                sb.pending || 0, sb.email_sent || 0, sb.widget_started || 0,
                sb.qualified || 0, sb.call_booked || 0, sb.calling || 0,
                sb.completed || 0, sb.failed || 0
            ];
            funnelChartInstance.update('none');
        }

        // Intent chart
        if (intentChartInstance) {
            intentChartInstance.data.datasets[0].data = [ib.INTERESTED || 0, ib.NOT_INTERESTED || 0, ib.CALLBACK || 0];
            intentChartInstance.update('none');
        }
    };

    // ── Update Lead Table ──────────────────────────────────
    const updateLeadTable = (leads) => {
        const tbody = document.getElementById('leadBody');
        if (!tbody) return;
        if (!leads || leads.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-muted" style="text-align:center; padding:24px;">No leads yet. Import a CSV to get started.</td></tr>';
            return;
        }
        tbody.innerHTML = leads.map(l => `
            <tr style="border-bottom: 1px solid rgba(148,163,184,0.08);">
                <td style="padding: 12px;">
                    <div style="font-weight:500;">${l.customer_name || '--'}</div>
                    <div class="text-muted" style="font-size:0.75rem;">${l.phone_number || ''}</div>
                </td>
                <td style="padding: 12px; font-size:0.85rem;">${l.email || '--'}</td>
                <td style="padding: 12px;">
                    <span style="background: ${statusColor(l.call_status)}; color:white; padding: 3px 10px; border-radius: 10px; font-size: 0.7rem; font-weight:600; text-transform: uppercase;">${(l.call_status || 'pending').replace(/_/g, ' ')}</span>
                </td>
                <td style="padding: 12px; font-weight:500;">${l.extracted_data?.intent || '—'}</td>
                <td style="padding: 12px; color: #94a3b8;">${l.call_duration_sec ? l.call_duration_sec + 's' : '—'}</td>
            </tr>
        `).join('');
    };

    // ── Refresh Data ───────────────────────────────────────
    const refreshSelectedCampaignData = async () => {
        if (!selectedCampaignId) return;
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

    // ── Attach Events ──────────────────────────────────────
    const attachDynamicEvents = () => {
        // Campaign card clicks → open detail
        document.querySelectorAll('.campaign-card').forEach(card => {
            card.addEventListener('click', () => {
                selectedCampaignId = card.dataset.campaignId;
                document.getElementById('mainContent').innerHTML = renderMainContent();
                attachDynamicEvents();
                initCharts();
                refreshSelectedCampaignData();
                if (pollTimer) clearInterval(pollTimer);
                pollTimer = setInterval(refreshSelectedCampaignData, 5000);
            });
        });

        // Back to list
        const backBtn = document.getElementById('backToList');
        if (backBtn) {
            backBtn.addEventListener('click', () => {
                if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
                selectedCampaignId = null;
                document.getElementById('mainContent').innerHTML = renderMainContent();
                attachDynamicEvents();
            });
        }

        // Create campaign
        const createBtn = document.getElementById('createCampaignBtn');
        if (createBtn) createBtn.addEventListener('click', () => document.getElementById('createCampaignModal').classList.remove('hidden'));

        const closeCreateModal = document.getElementById('closeCreateModal');
        if (closeCreateModal) closeCreateModal.addEventListener('click', () => document.getElementById('createCampaignModal').classList.add('hidden'));

        const createForm = document.getElementById('createCampaignForm');
        if (createForm) {
            createForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const name = document.getElementById('campaignNameInput').value.trim();
                const purpose = document.getElementById('campaignPurposeInput').value.trim();
                if (!name || !purpose) return alert('Please fill all fields.');
                try {
                    const res = await api.post('/api/campaigns', { campaign_name: name, purpose });
                    const nc = await ensureJson(res);
                    campaigns.push(nc.campaign || nc);
                    document.getElementById('createCampaignModal').classList.add('hidden');
                    document.getElementById('mainContent').innerHTML = renderMainContent();
                    attachDynamicEvents();
                } catch (err) { alert('Failed to create campaign: ' + err.message); }
            });
        }

        // Action buttons: Start, Pause, Clear Leads, Delete
        document.querySelectorAll('.action-start').forEach(btn => {
            btn.addEventListener('click', async () => {
                try {
                    await api.post(`/api/campaigns/${btn.dataset.id}/start`);
                    const c = campaigns.find(c => (c.id || c.campaign_id) === btn.dataset.id);
                    if (c) c.status = 'active';
                    document.getElementById('mainContent').innerHTML = renderMainContent();
                    attachDynamicEvents(); initCharts(); refreshSelectedCampaignData();
                    if (!pollTimer) pollTimer = setInterval(refreshSelectedCampaignData, 5000);
                } catch (err) { alert('Failed to start: ' + err.message); }
            });
        });

        document.querySelectorAll('.action-pause').forEach(btn => {
            btn.addEventListener('click', async () => {
                try {
                    await api.post(`/api/campaigns/${btn.dataset.id}/pause`);
                    const c = campaigns.find(c => (c.id || c.campaign_id) === btn.dataset.id);
                    if (c) c.status = 'paused';
                    document.getElementById('mainContent').innerHTML = renderMainContent();
                    attachDynamicEvents(); initCharts(); refreshSelectedCampaignData();
                } catch (err) { alert('Failed to pause: ' + err.message); }
            });
        });

        document.querySelectorAll('.action-clear').forEach(btn => {
            btn.addEventListener('click', async () => {
                if (!confirm('Clear all leads for this campaign?')) return;
                try {
                    await api.delete(`/api/campaigns/${btn.dataset.id}/leads`);
                    refreshSelectedCampaignData();
                } catch (err) { alert('Failed to clear leads: ' + err.message); }
            });
        });

        document.querySelectorAll('.action-delete').forEach(btn => {
            btn.addEventListener('click', async () => {
                if (!confirm('Delete this campaign and all its leads?')) return;
                try {
                    await api.delete(`/api/campaigns/${btn.dataset.id}`);
                    campaigns = campaigns.filter(c => (c.id || c.campaign_id) !== btn.dataset.id);
                    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
                    selectedCampaignId = null;
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
                } catch (err) { alert('Upload failed: ' + err.message); }
            });
        }
    };

    // ── Global Events ──────────────────────────────────────
    document.getElementById('logoutBtn').addEventListener('click', logout);
    document.getElementById('settingsBtn').addEventListener('click', () => navigate('/settings'));
    document.getElementById('floatingAiBtn').addEventListener('click', () => document.getElementById('agentModal').classList.remove('hidden'));
    document.getElementById('closeAgentModal').addEventListener('click', () => document.getElementById('agentModal').classList.add('hidden'));

    // ── Initialize ─────────────────────────────────────────
    attachDynamicEvents();
};
