/**
 * @file frontend/js/pages/dashboard.js
 * @description MOD-15 — Main Business Dashboard.
 */

import { api } from "../api.js";
import { state, logout } from "../auth.js";
import { navigate } from "../router.js";

// Polling interval state
let pollTimer = null;

export const renderDashboard = async (container) => {
    // 1. Initial Data Fetch
    let profile = { business_name: 'Business' };
    let campaigns = [];
    let selectedCampaignId = null;
    let analytics = {
        total_calls: 0,
        conversion_rate: 0,
        qualified_leads: 0,
        intent_breakdown: {},
        status_breakdown: {}
    };

    try {
        const profileRes = await api.get('/api/business/profile');
        profile = await profileRes.json();
        campaigns = await api.get('/api/campaigns');
        if (campaigns.length > 0) {
            selectedCampaignId = campaigns[0].id;
            analytics = await api.get(`/api/campaigns/${selectedCampaignId}/analytics`);
        }
    } catch (err) {
        console.error("Dashboard initial load error:", err);
    }

    // 2. Render Template
    container.innerHTML = `
        <div class="dashboard-page animate-fade-in">
            <nav class="navbar glass">
                <div class="container flex justify-between items-center">
                    <div class="logo font-heading flex items-center gap-md">
                        <i class="fas fa-microchip text-primary"></i>
                        <span>VEDA</span>
                    </div>
                    <div class="nav-actions flex items-center gap-lg">
                        <span class="user-email text-muted">${state.user?.email}</span>
                        <button id="logoutBtn" class="btn btn-outline btn-sm">Sign Out</button>
                    </div>
                </div>
            </nav>

            <main class="container p-lg">
                <header class="dash-header mb-xl flex justify-between items-end">
                    <div>
                        <h1 class="text-3xl font-heading">Welcome back, ${profile.business_name}</h1>
                        <p class="text-muted">Overview of your active AI outreach campaigns.</p>
                    </div>
                    <div class="campaign-selector">
                        <select id="campaignSelect" class="glass-select">
                            ${campaigns.map(c => `<option value="${c.id}" ${c.id === selectedCampaignId ? 'selected' : ''}>${c.name}</option>`).join('')}
                            ${campaigns.length === 0 ? '<option value="">No Campaigns</option>' : ''}
                        </select>
                    </div>
                </header>

                <div class="stats-grid grid gap-md mb-xl">
                    <div class="stat-card glass p-lg">
                        <span class="label">Total Calls</span>
                        <h2 id="statCalls">${analytics.total_calls}</h2>
                    </div>
                    <div class="stat-card glass p-lg">
                        <span class="label">Conversion</span>
                        <h2 id="statConv">${analytics.conversion_rate}%</h2>
                    </div>
                    <div class="stat-card glass p-lg">
                        <span class="label">Qualified Leads</span>
                        <h2 id="statQual">${analytics.qualified_leads}</h2>
                    </div>
                </div>

                <div class="dash-layout grid gap-lg">
                    <!-- Left: Lead Table -->
                    <section class="lead-section">
                        <div class="section-header flex justify-between items-center mb-md">
                            <h3 class="font-heading">Call Records</h3>
                            <div class="actions flex gap-md">
                                <label class="btn btn-outline btn-sm">
                                    <i class="fas fa-upload"></i> Import CSV
                                    <input type="file" id="csvInput" style="display:none" accept=".csv">
                                </label>
                            </div>
                        </div>
                        <div class="table-container glass">
                            <table id="leadTable">
                                <thead>
                                    <tr>
                                        <th>Customer</th>
                                        <th>Phone</th>
                                        <th>Status</th>
                                        <th>Intent</th>
                                        <th>Link</th>
                                    </tr>
                                </thead>
                                <tbody id="leadBody">
                                    <!-- Leads injected here -->
                                </tbody>
                            </table>
                        </div>
                    </section>

                    <!-- Right: Panels -->
                    <aside class="panel-section flex flex-col gap-lg">
                        <div class="panel glass p-lg animate-pulse-container" id="livePanel">
                            <h3 class="font-heading mb-md flex items-center gap-sm">
                                <span class="pulse-dot"></span> Live Activity
                            </h3>
                            <div id="liveStatus" class="live-content text-muted">No active calls...</div>
                        </div>

                        <div class="panel glass p-lg" id="insightsPanel">
                            <h3 class="font-heading mb-md">AI Insights</h3>
                            <div id="insightContent" class="insights-content text-muted">
                                Select a campaign to view sentiment trends.
                            </div>
                        </div>
                    </aside>
                </div>
            </main>

            <button class="floating-ai-btn glass animate-pulse" title="AI Agent Status">
                <i class="fas fa-robot"></i>
            </button>
        </div>

        <!-- Transcript Modal -->
        <div id="transcriptModal" class="modal-overlay hidden">
            <div class="modal-content glass p-lg">
                <div class="modal-header flex justify-between items-center mb-md">
                    <h3 class="font-heading">Call Transcript</h3>
                    <button id="closeModal" class="btn btn-outline icon-btn"><i class="fas fa-times"></i></button>
                </div>
                <div id="modalBody" class="transcript-body"></div>
            </div>
        </div>
    `;

    // 3. Logic: Polling and Events
    const refreshData = async () => {
        if (!selectedCampaignId) return;
        try {
            const leads = await api.get(`/api/campaigns/${selectedCampaignId}/leads`);
            updateLeadTable(leads);
            
            const liveAnalytics = await api.get(`/api/campaigns/${selectedCampaignId}/analytics`);
            updateStats(liveAnalytics);
        } catch (err) {
            console.warn("Polling error:", err.message);
        }
    };

    const updateLeadTable = (leads) => {
        const tbody = document.getElementById('leadBody');
        tbody.innerHTML = leads.map(l => `
            <tr>
                <td>${l.customer_name}</td>
                <td>${l.phone_number}</td>
                <td><span class="badge badge-${l.call_status}">${l.call_status}</span></td>
                <td>${l.extracted_data?.intent || '--'}</td>
                <td>
                    <button class="btn btn-outline btn-xs view-transcript" data-id="${l.id}">
                        <i class="fas fa-file-alt"></i>
                    </button>
                </td>
            </tr>
        `).join('');

        // Attach listeners to new buttons
        document.querySelectorAll('.view-transcript').forEach(btn => {
            btn.addEventListener('click', () => showTranscript(btn.dataset.id));
        });
    };

    const updateStats = (data) => {
        document.getElementById('statCalls').innerText = data.total_calls;
        document.getElementById('statConv').innerText = `${data.conversion_rate}%`;
        document.getElementById('statQual').innerText = data.qualified_leads;
        
        const insightContent = document.getElementById('insightContent');
        if (data.intent_breakdown) {
            const ib = data.intent_breakdown;
            insightContent.innerHTML = `
                <div class="intent-stats">
                    <div class="stat-item"><span>Interested:</span> <span>${ib.INTERESTED || 0}</span></div>
                    <div class="stat-item"><span>Callback:</span> <span>${ib.CALLBACK || 0}</span></div>
                    <div class="stat-item"><span>Not Interested:</span> <span>${ib.NOT_INTERESTED || 0}</span></div>
                </div>
            `;
        }
    };

    const showTranscript = async (leadId) => {
        const modal = document.getElementById('transcriptModal');
        const body = document.getElementById('modalBody');
        modal.classList.remove('hidden');
        body.innerHTML = 'Loading transcript...';
        
        try {
            const data = await api.get(`/api/admin/leads/${leadId}`); // Reuse admin/lead endpoint if permitted
            body.innerHTML = `
                <div class="transcript-meta mb-md text-sm text-muted">
                    Duration: ${data.call_duration_sec || 0}s | Status: ${data.call_status}
                </div>
                <div class="transcript-text">${data.transcript ? data.transcript.replace(/\n/g, '<br/>') : 'No transcript available.'}</div>
            `;
        } catch (err) {
            body.innerHTML = 'Error loading transcript.';
        }
    };

    const handleFileUpload = async (e) => {
        if (!selectedCampaignId) return alert('Please select a campaign first.');
        const file = e.target.files[0];
        if (!file) return;

        const formData = new FormData();
        formData.append('file', file);

        try {
            const result = await api.upload(`/api/campaigns/${selectedCampaignId}/upload`, formData);
            alert(`Upload Complete: ${result.accepted} accepted, ${result.rejected} rejected.`);
            refreshData();
        } catch (err) {
            alert('Upload failed: ' + err.message);
        }
    };

    // 4. Initialization
    document.getElementById('logoutBtn').addEventListener('click', logout);
    document.getElementById('csvInput').addEventListener('change', handleFileUpload);
    document.getElementById('closeModal').addEventListener('click', () => {
        document.getElementById('transcriptModal').classList.add('hidden');
    });
    document.getElementById('campaignSelect').addEventListener('change', (e) => {
        selectedCampaignId = e.target.value;
        refreshData();
    });

    // Start Polling
    refreshData();
    pollTimer = setInterval(refreshData, 10000); // 10s poll

    // Cleanup when path changes (handled by router hopefully, but good practice)
};
