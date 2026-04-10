/**
 * @file frontend/js/pages/dashboard.js
 * @description Premium minimalist dashboard — campaign management + live agent monitor.
 *
 * Design: Slate-900/Emerald-500, minimal borders, generous whitespace.
 * Agent logo appears ONLY when a campaign is active.
 * Live Monitor shows real-time Firestore events from campaign_activity.
 */

import { api } from "../api.js";
import { state, logout } from "../auth.js";
import { navigate } from "../router.js";

/* ━━━ State ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
let pollTimer = null;
let activityTimer = null;
let campaigns = [];
let selectedId = null;
let profile = { business_name: "Business" };

const j = async (r) => {
  if (!r) return {};
  if (r && typeof r === "object" && !r.json) return r;
  if (r && typeof r.json === "function") return r.json();
  return r;
};

const sc = (s) => ({
  active: "#22c55e", running: "#22c55e", paused: "#eab308",
  draft: "#475569", completed: "#3b82f6", email_sent: "#3b82f6",
  widget_started: "#8b5cf6", qualified: "#22c55e", call_booked: "#14b8a6",
  calling: "#eab308", failed: "#ef4444", pending: "#475569",
  not_interested: "#ef4444", callback: "#eab308", email_bounced: "#ef4444",
}[(s || "").toLowerCase()] || "#475569");

/* ━━━ Style injection ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
const injectStyles = () => {
  if (document.getElementById("veda-dash-styles")) return;
  const s = document.createElement("style");
  s.id = "veda-dash-styles";
  s.textContent = `
    .vd { --bg: #0b1120; --s1: #111827; --s2: #1f2937; --bdr: rgba(255,255,255,0.06); --tx: #f1f5f9; --tx2: #64748b; --em: #22c55e; }
    .vd { background: var(--bg); min-height: 100vh; font-family: 'Inter', system-ui, sans-serif; color: var(--tx); }

    /* Nav */
    .vd-nav { display:flex; align-items:center; justify-content:space-between; padding:16px 32px; border-bottom:1px solid var(--bdr); }
    .vd-brand { font-family:'Outfit',sans-serif; font-weight:700; font-size:1.15rem; display:flex; align-items:center; gap:8px; letter-spacing:-0.3px; }
    .vd-brand i { color:var(--em); }
    .vd-nav-r { display:flex; align-items:center; gap:14px; }
    .vd-avatar { width:30px; height:30px; border-radius:50%; background:var(--em); display:flex; align-items:center; justify-content:center; color:#000; font-weight:700; font-size:0.7rem; }
    .vd-nav-btn { background:none; border:1px solid var(--bdr); color:var(--tx2); padding:6px 12px; border-radius:8px; font-size:0.78rem; cursor:pointer; transition:0.15s; }
    .vd-nav-btn:hover { background:rgba(255,255,255,0.04); color:var(--tx); }

    /* Main */
    .vd-main { max-width:1100px; margin:0 auto; padding:28px 24px; }
    .vd-greeting { font-family:'Outfit',sans-serif; font-size:1.5rem; font-weight:600; margin-bottom:4px; letter-spacing:-0.5px; }
    .vd-sub { color:var(--tx2); font-size:0.85rem; margin-bottom:28px; }

    /* Campaign cards */
    .vd-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(280px,1fr)); gap:14px; }
    .vd-card { background:var(--s1); border:1px solid var(--bdr); border-radius:14px; padding:20px; cursor:pointer; transition:all 0.2s; position:relative; overflow:hidden; }
    .vd-card:hover { border-color:rgba(34,197,94,0.2); transform:translateY(-2px); box-shadow:0 8px 24px rgba(0,0,0,0.3); }
    .vd-card::before { content:''; position:absolute; top:0; left:0; right:0; height:2px; background:linear-gradient(90deg,var(--em),transparent); opacity:0; transition:0.2s; }
    .vd-card:hover::before { opacity:1; }
    .vd-tag { display:inline-block; padding:3px 10px; border-radius:20px; font-size:0.65rem; font-weight:600; text-transform:uppercase; letter-spacing:0.5px; }
    .vd-card-name { font-family:'Outfit',sans-serif; font-size:1.05rem; font-weight:600; margin:10px 0 4px; letter-spacing:-0.3px; }
    .vd-card-desc { color:var(--tx2); font-size:0.8rem; line-height:1.5; }

    /* Header bar */
    .vd-hbar { display:flex; align-items:center; gap:12px; margin-bottom:22px; }
    .vd-back { background:none; border:none; color:var(--tx2); cursor:pointer; font-size:0.85rem; display:flex; align-items:center; gap:6px; padding:6px 12px; border-radius:8px; transition:0.15s; }
    .vd-back:hover { background:rgba(255,255,255,0.04); color:var(--tx); }
    .vd-cname { font-family:'Outfit',sans-serif; font-size:1.3rem; font-weight:600; letter-spacing:-0.4px; }

    /* Purpose bar */
    .vd-pbar { background:var(--s1); border:1px solid var(--bdr); border-radius:12px; padding:14px 18px; margin-bottom:20px; display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
    .vd-pbar-text { flex:1; color:var(--tx2); font-size:0.82rem; line-height:1.5; min-width:200px; }
    .vd-act-btn { padding:6px 14px; border-radius:8px; font-size:0.75rem; font-weight:600; cursor:pointer; border:1px solid var(--bdr); background:none; color:var(--tx); transition:0.15s; display:flex; align-items:center; gap:5px; }
    .vd-act-btn:hover { background:rgba(255,255,255,0.05); }
    .vd-act-btn.primary { background:var(--em); color:#000; border-color:var(--em); }
    .vd-act-btn.primary:hover { background:#16a34a; }
    .vd-act-btn.danger { color:#ef4444; border-color:rgba(239,68,68,0.3); }
    .vd-act-btn.danger:hover { background:rgba(239,68,68,0.1); }

    /* Stat cards */
    .vd-stats { display:grid; grid-template-columns:repeat(4,1fr); gap:14px; margin-bottom:20px; }
    .vd-stat { background:var(--s1); border:1px solid var(--bdr); border-radius:12px; padding:16px 18px; }
    .vd-stat-label { font-size:0.68rem; color:var(--tx2); text-transform:uppercase; letter-spacing:0.7px; margin-bottom:6px; }
    .vd-stat-val { font-family:'Outfit',sans-serif; font-size:1.8rem; font-weight:700; letter-spacing:-1px; }

    /* Charts row */
    .vd-charts { display:grid; grid-template-columns:1fr 1fr; gap:14px; margin-bottom:20px; }
    .vd-chart-card { background:var(--s1); border:1px solid var(--bdr); border-radius:12px; padding:18px; }
    .vd-chart-title { font-family:'Outfit',sans-serif; font-size:0.88rem; font-weight:600; margin-bottom:12px; color:var(--tx); }

    /* Table + Side */
    .vd-bottom { display:grid; grid-template-columns:1fr 320px; gap:14px; }
    .vd-table-wrap { background:var(--s1); border:1px solid var(--bdr); border-radius:12px; padding:16px; }
    .vd-table-head { display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; }
    .vd-table-title { font-family:'Outfit',sans-serif; font-size:0.95rem; font-weight:600; }
    .vd-upload-btn { display:flex; align-items:center; gap:6px; padding:6px 14px; border-radius:8px; font-size:0.75rem; background:var(--s2); border:1px solid var(--bdr); color:var(--tx2); cursor:pointer; transition:0.15s; }
    .vd-upload-btn:hover { color:var(--tx); background:rgba(255,255,255,0.06); }
    table { width:100%; border-collapse:collapse; }
    th { text-align:left; padding:8px 10px; font-size:0.68rem; text-transform:uppercase; letter-spacing:0.6px; color:var(--tx2); border-bottom:1px solid var(--bdr); }
    td { padding:10px; font-size:0.82rem; border-bottom:1px solid var(--bdr); }
    tr:last-child td { border-bottom:none; }

    /* Side panel — Live Monitor */
    .vd-side { display:flex; flex-direction:column; gap:14px; }
    .vd-monitor { background:var(--s1); border:1px solid var(--bdr); border-radius:12px; padding:16px; flex:1; display:flex; flex-direction:column; }
    .vd-mon-title { font-family:'Outfit',sans-serif; font-size:0.88rem; font-weight:600; display:flex; align-items:center; gap:8px; margin-bottom:12px; }
    .vd-pulse { width:8px; height:8px; border-radius:50%; background:var(--em); animation:vdpulse 2s infinite; }
    @keyframes vdpulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.5;transform:scale(1.3)} }
    .vd-log-scroll { flex:1; overflow-y:auto; max-height:280px; display:flex; flex-direction:column; gap:6px; }
    .vd-log-entry { font-size:0.78rem; color:var(--tx2); padding:5px 8px; border-radius:6px; background:rgba(255,255,255,0.02); line-height:1.4; }
    .vd-log-entry .vd-log-time { font-size:0.65rem; color:var(--tx2); opacity:0.6; margin-right:6px; }
    .vd-log-empty { color:var(--tx2); font-size:0.78rem; font-style:italic; padding:20px 0; text-align:center; }

    /* Quick stats sidebar */
    .vd-qs { background:var(--s1); border:1px solid var(--bdr); border-radius:12px; padding:16px; }
    .vd-qs-title { font-family:'Outfit',sans-serif; font-size:0.88rem; font-weight:600; margin-bottom:10px; display:flex; align-items:center; gap:8px; }
    .vd-qs-row { display:flex; justify-content:space-between; padding:5px 0; font-size:0.8rem; }
    .vd-qs-row span:first-child { color:var(--tx2); }
    .vd-qs-row span:last-child { font-weight:600; }

    /* Create modal */
    .vd-overlay { position:fixed; inset:0; background:rgba(0,0,0,0.6); backdrop-filter:blur(4px); display:flex; align-items:center; justify-content:center; z-index:1000; }
    .vd-modal { background:var(--s1); border:1px solid var(--bdr); border-radius:16px; padding:28px; width:100%; max-width:520px; max-height:90vh; overflow-y:auto; }
    .vd-modal-title { font-family:'Outfit',sans-serif; font-size:1.15rem; font-weight:600; margin-bottom:20px; }
    .vd-field { margin-bottom:14px; }
    .vd-field label { display:block; font-size:0.78rem; color:var(--tx2); margin-bottom:5px; font-weight:500; }
    .vd-field input, .vd-field textarea { width:100%; padding:10px 14px; border-radius:10px; background:var(--s2); border:1px solid var(--bdr); color:var(--tx); font-size:0.85rem; font-family:inherit; transition:border 0.15s; }
    .vd-field input:focus, .vd-field textarea:focus { outline:none; border-color:var(--em); }
    .vd-field textarea { resize:vertical; min-height:56px; }
    .vd-submit { width:100%; padding:12px; border:none; border-radius:10px; background:var(--em); color:#000; font-weight:700; font-size:0.88rem; cursor:pointer; transition:0.15s; margin-top:6px; }
    .vd-submit:hover { background:#16a34a; }
    .vd-submit:disabled { opacity:0.6; cursor:not-allowed; }

    /* New campaign section header */
    .vd-sec-head { display:flex; justify-content:space-between; align-items:center; margin-bottom:18px; }
    .vd-sec-title { font-family:'Outfit',sans-serif; font-size:1.05rem; font-weight:600; }
    .vd-new-btn { display:flex; align-items:center; gap:6px; padding:8px 16px; border-radius:10px; background:var(--em); color:#000; font-weight:600; font-size:0.82rem; border:none; cursor:pointer; transition:0.15s; }
    .vd-new-btn:hover { background:#16a34a; transform:translateY(-1px); }

    /* Empty state */
    .vd-empty { text-align:center; padding:50px 20px; color:var(--tx2); font-size:0.88rem; }
    .vd-empty i { font-size:2rem; margin-bottom:10px; display:block; opacity:0.3; }

    .hidden { display:none !important; }

    /* Responsive */
    @media(max-width:768px) {
      .vd-stats { grid-template-columns:repeat(2,1fr); }
      .vd-charts { grid-template-columns:1fr; }
      .vd-bottom { grid-template-columns:1fr; }
    }
  `;
  document.head.appendChild(s);
};

/* ━━━ Render ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
export const renderDashboard = async (container) => {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  if (activityTimer) { clearInterval(activityTimer); activityTimer = null; }
  injectStyles();

  // Load data
  try {
    const pr = await api.get("/api/business/profile");
    if (pr?.status === 404) { window.location.hash = "/onboarding"; return; }
    profile = await j(pr);
    const cr = await api.get("/api/campaigns");
    const cp = await j(cr);
    campaigns = Array.isArray(cp?.campaigns || cp) ? (cp?.campaigns || cp) : [];
  } catch (e) { console.error("[Dash]", e.message); }

  const initials = (state.user?.email || "U")[0].toUpperCase();
  const hasActive = campaigns.some(c => c.status === "active");

  /* ─── Campaign List HTML ─── */
  const listHTML = () => `
    <div class="vd-sec-head">
      <div>
        <div class="vd-sec-title">Campaigns</div>
        <div style="color:var(--tx2);font-size:0.78rem;margin-top:2px;">${campaigns.length} total</div>
      </div>
      <button class="vd-new-btn" id="openCreate"><i class="fas fa-plus" style="font-size:0.7rem;"></i> New Campaign</button>
    </div>
    ${campaigns.length === 0 ? '<div class="vd-empty"><i class="fas fa-bullhorn"></i>No campaigns yet. Create your first one.</div>' : ''}
    <div class="vd-grid">
      ${campaigns.map(c => `
        <div class="vd-card" data-id="${c.campaign_id || c.id}">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <span class="vd-tag" style="background:${sc(c.status)}22;color:${sc(c.status)};">${c.status || 'draft'}</span>
            <span style="color:var(--tx2);font-size:0.72rem;">${c.total_leads || 0} leads</span>
          </div>
          <div class="vd-card-name">${c.campaign_name || 'Untitled'}</div>
          <div class="vd-card-desc">${(c.purpose || '').substring(0,90)}${(c.purpose||'').length>90?'...':''}</div>
        </div>
      `).join('')}
    </div>
  `;

  /* ─── Detail View HTML ─── */
  const detailHTML = () => {
    const c = campaigns.find(x => (x.campaign_id||x.id) === selectedId) || {};
    return `
      <div class="vd-hbar">
        <button class="vd-back" id="backBtn"><i class="fas fa-arrow-left"></i> Campaigns</button>
        <div class="vd-cname">${c.campaign_name || 'Campaign'}</div>
      </div>

      <div class="vd-pbar">
        <span class="vd-tag" style="background:${sc(c.status)}22;color:${sc(c.status)};">${(c.status||'draft').toUpperCase()}</span>
        <div class="vd-pbar-text">${c.purpose || 'No description.'}</div>
        <button class="vd-act-btn primary" data-action="start" data-id="${selectedId}"><i class="fas fa-play"></i> Start</button>
        <button class="vd-act-btn" data-action="pause" data-id="${selectedId}"><i class="fas fa-pause"></i> Pause</button>
        <button class="vd-act-btn" data-action="clear" data-id="${selectedId}"><i class="fas fa-broom"></i> Clear</button>
        <button class="vd-act-btn danger" data-action="delete" data-id="${selectedId}"><i class="fas fa-trash"></i></button>
      </div>

      <div class="vd-stats">
        <div class="vd-stat"><div class="vd-stat-label">Emails Sent</div><div class="vd-stat-val" id="sEm">0</div></div>
        <div class="vd-stat"><div class="vd-stat-label">Widget Sessions</div><div class="vd-stat-val" id="sWi">0</div></div>
        <div class="vd-stat"><div class="vd-stat-label">Qualified</div><div class="vd-stat-val" id="sQu">0</div></div>
        <div class="vd-stat"><div class="vd-stat-label">Conversion</div><div class="vd-stat-val" id="sCo">0%</div></div>
      </div>

      <div class="vd-charts">
        <div class="vd-chart-card"><div class="vd-chart-title">Lead Funnel</div><canvas id="funnelC" height="180"></canvas></div>
        <div class="vd-chart-card"><div class="vd-chart-title">AI Intent</div><canvas id="intentC" height="180"></canvas></div>
      </div>

      <div class="vd-bottom">
        <div class="vd-table-wrap">
          <div class="vd-table-head">
            <div class="vd-table-title">Lead Records</div>
            <label class="vd-upload-btn"><i class="fas fa-upload"></i> Import CSV<input type="file" id="csvIn" accept=".csv" style="display:none"></label>
          </div>
          <table>
            <thead><tr><th>Customer</th><th>Email</th><th>Status</th><th>Intent</th><th>Duration</th></tr></thead>
            <tbody id="leadTb"><tr><td colspan="5" style="text-align:center;padding:20px;color:var(--tx2);">Loading…</td></tr></tbody>
          </table>
        </div>
        <div class="vd-side">
          <div class="vd-monitor">
            <div class="vd-mon-title"><span class="vd-pulse"></span> Live Monitor</div>
            <div class="vd-log-scroll" id="logScroll"><div class="vd-log-empty">Waiting for agent activity…</div></div>
          </div>
          <div class="vd-qs">
            <div class="vd-qs-title"><i class="fas fa-chart-pie" style="color:var(--em);font-size:0.8rem;"></i> Quick Stats</div>
            <div class="vd-qs-row"><span>Pending</span><span id="qsPending">0</span></div>
            <div class="vd-qs-row"><span>Calling</span><span id="qsCalling" style="color:#eab308;">0</span></div>
            <div class="vd-qs-row"><span>Completed</span><span id="qsCompleted">0</span></div>
            <div class="vd-qs-row"><span>Failed</span><span id="qsFailed" style="color:#ef4444;">0</span></div>
            <div style="border-top:1px solid var(--bdr);margin:6px 0;"></div>
            <div class="vd-qs-row"><span>Total</span><span id="qsTotal" style="color:var(--em);">0</span></div>
          </div>
        </div>
      </div>
    `;
  };

  /* ─── Create Modal HTML ─── */
  const modalHTML = `
    <div id="createModal" class="vd-overlay hidden">
      <div class="vd-modal">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
          <div class="vd-modal-title">New Campaign</div>
          <button id="closeModal" class="vd-nav-btn" style="padding:4px 8px;"><i class="fas fa-times"></i></button>
        </div>
        <form id="createForm">
          <div class="vd-field"><label>Campaign Name *</label><input id="fName" required placeholder="e.g. Summer Promo Launch"></div>
          <div class="vd-field"><label>Purpose / Goal *</label><textarea id="fPurpose" required placeholder="What do you want to achieve?"></textarea></div>
          <div class="vd-field"><label>Product Description *</label><textarea id="fProduct" required placeholder="Describe your product or service"></textarea></div>
          <div class="vd-field"><label>Target Audience *</label><input id="fAudience" required placeholder="Who are you reaching?"></div>
          <div class="vd-field"><label>Key Details *</label><textarea id="fDetails" required placeholder="Promo codes, offers, talking points"></textarea></div>
          <button type="submit" class="vd-submit" id="submitBtn"><i class="fas fa-rocket"></i> Create</button>
        </form>
      </div>
    </div>
  `;

  /* ─── Mount ─── */
  container.innerHTML = `
    <div class="vd">
      <nav class="vd-nav">
        <div class="vd-brand"><i class="fas fa-bolt"></i> VEDA</div>
        <div class="vd-nav-r">
          <span style="color:var(--tx2);font-size:0.78rem;">${state.user?.email||''}</span>
          <div class="vd-avatar">${initials}</div>
          <button class="vd-nav-btn" id="settingsBtn"><i class="fas fa-cog"></i></button>
          <button class="vd-nav-btn" id="logoutBtn">Sign Out</button>
        </div>
      </nav>
      <main class="vd-main">
        <div class="vd-greeting">Welcome back, ${profile.business_name || 'there'}</div>
        <div class="vd-sub">Manage campaigns & track performance</div>
        <div id="mainContent">${selectedId ? detailHTML() : listHTML()}</div>
      </main>
    </div>
    ${modalHTML}
  `;

  /* ━━━ Charts ━━━ */
  let fC = null, iC = null;
  const initCharts = () => {
    const f = document.getElementById('funnelC'), ic = document.getElementById('intentC');
    if (!f || !ic || typeof Chart === 'undefined') return;
    fC = new Chart(f.getContext('2d'), {
      type: 'bar',
      data: { labels: ['Pending','Email Sent','Widget','Qualified','Calling','Completed','Failed'], datasets: [{ data:[0,0,0,0,0,0,0], backgroundColor:['#475569','#3b82f6','#8b5cf6','#22c55e','#eab308','#22c55e','#ef4444'], borderRadius:4, barThickness:18 }] },
      options: { responsive:true, plugins:{legend:{display:false}}, scales:{ y:{beginAtZero:true,ticks:{color:'#475569',stepSize:1},grid:{color:'rgba(255,255,255,0.03)'}}, x:{ticks:{color:'#475569',font:{size:9}},grid:{display:false}} } }
    });
    iC = new Chart(ic.getContext('2d'), {
      type: 'doughnut',
      data: { labels:['Interested','Not Interested','Callback'], datasets:[{data:[0,0,0],backgroundColor:['#22c55e','#ef4444','#eab308'],borderWidth:0}] },
      options: { responsive:true, cutout:'68%', plugins:{legend:{position:'bottom',labels:{color:'#64748b',font:{size:10},padding:14}}} }
    });
  };

  /* ━━━ Update analytics ━━━ */
  const updateStats = (a) => {
    const el = id => document.getElementById(id);
    const sb = a.status_breakdown || a.call_status_breakdown || {};
    const ib = a.intent_breakdown || {};

    if (el('sEm')) el('sEm').innerText = sb.email_sent || 0;
    if (el('sWi')) el('sWi').innerText = sb.widget_started || 0;
    if (el('sQu')) el('sQu').innerText = a.qualified_leads || sb.qualified || 0;
    if (el('sCo')) el('sCo').innerText = `${a.conversion_rate||0}%`;

    if (el('qsPending')) el('qsPending').innerText = sb.pending || 0;
    if (el('qsCalling')) el('qsCalling').innerText = (sb.calling||0) + (sb.call_booked||0);
    if (el('qsCompleted')) el('qsCompleted').innerText = sb.completed || 0;
    if (el('qsFailed')) el('qsFailed').innerText = sb.failed || 0;
    if (el('qsTotal')) el('qsTotal').innerText = a.total_leads || a.total_calls || 0;

    if (fC) { fC.data.datasets[0].data = [sb.pending||0,sb.email_sent||0,sb.widget_started||0,sb.qualified||0,sb.calling||0,sb.completed||0,sb.failed||0]; fC.update('none'); }
    if (iC) { iC.data.datasets[0].data = [ib.INTERESTED||0,ib.NOT_INTERESTED||0,ib.CALLBACK||0]; iC.update('none'); }
  };

  /* ━━━ Update lead table ━━━ */
  const updateLeads = (leads) => {
    const tb = document.getElementById('leadTb');
    if (!tb) return;
    if (!leads || leads.length === 0) {
      tb.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:20px;color:var(--tx2);">No leads. Import a CSV to get started.</td></tr>';
      return;
    }
    tb.innerHTML = leads.map(l => `
      <tr>
        <td><div style="font-weight:500;">${l.customer_name||'—'}</div><div style="font-size:0.7rem;color:var(--tx2);">${l.phone_number||''}</div></td>
        <td style="font-size:0.8rem;">${l.email||'—'}</td>
        <td><span class="vd-tag" style="background:${sc(l.call_status)}22;color:${sc(l.call_status)};font-size:0.62rem;">${(l.call_status||'pending').replace(/_/g,' ')}</span></td>
        <td style="font-weight:500;">${l.extracted_data?.intent||'—'}</td>
        <td style="color:var(--tx2);">${l.call_duration_sec?l.call_duration_sec+'s':'—'}</td>
      </tr>
    `).join('');
  };

  /* ━━━ Update live monitor ━━━ */
  const updateActivityLog = async () => {
    if (!selectedId) return;
    try {
      const res = await api.get(`/api/campaigns/${selectedId}/activity`);
      const data = await j(res);
      const logs = data?.logs || [];
      const scroll = document.getElementById('logScroll');
      if (!scroll) return;
      if (logs.length === 0) {
        scroll.innerHTML = '<div class="vd-log-empty">Waiting for agent activity…</div>';
        return;
      }
      scroll.innerHTML = logs.map(l => {
        const ts = l.timestamp ? new Date(l.timestamp).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit'}) : '';
        return `<div class="vd-log-entry"><span class="vd-log-time">${ts}</span>${l.message}</div>`;
      }).join('');
    } catch (e) { /* silent */ }
  };

  /* ━━━ Refresh data ━━━ */
  const refreshData = async () => {
    if (!selectedId) return;
    try {
      const [ar, lr] = await Promise.all([
        api.get(`/api/campaigns/${selectedId}/analytics`),
        api.get(`/api/campaigns/${selectedId}/leads`),
      ]);
      updateStats(await j(ar));
      const lp = await j(lr);
      updateLeads(Array.isArray(lp?.leads||lp) ? (lp?.leads||lp) : []);
    } catch (e) { console.warn("[Dash]", e.message); }
  };

  /* ━━━ Full refresh ━━━ */
  const fullRefresh = () => {
    document.getElementById('mainContent').innerHTML = selectedId ? detailHTML() : listHTML();
    attachEvents();
    if (selectedId) {
      initCharts();
      refreshData();
      updateActivityLog();
      if (pollTimer) clearInterval(pollTimer);
      pollTimer = setInterval(refreshData, 5000);
      if (activityTimer) clearInterval(activityTimer);
      activityTimer = setInterval(updateActivityLog, 4000);
    } else {
      if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
      if (activityTimer) { clearInterval(activityTimer); activityTimer = null; }
    }
  };

  /* ━━━ Event handlers ━━━ */
  const attachEvents = () => {
    // Campaign cards
    document.querySelectorAll('.vd-card').forEach(c => {
      c.addEventListener('click', () => { selectedId = c.dataset.id; fullRefresh(); });
    });

    // Back
    document.getElementById('backBtn')?.addEventListener('click', () => { selectedId = null; fullRefresh(); });

    // Create modal
    document.getElementById('openCreate')?.addEventListener('click', () => document.getElementById('createModal').classList.remove('hidden'));
    document.getElementById('closeModal')?.addEventListener('click', () => document.getElementById('createModal').classList.add('hidden'));

    // Create form
    document.getElementById('createForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = document.getElementById('submitBtn');
      btn.disabled = true; btn.innerText = 'Creating…';
      try {
        const payload = {
          campaign_name: document.getElementById('fName').value.trim(),
          purpose: document.getElementById('fPurpose').value.trim(),
          product_description: document.getElementById('fProduct').value.trim(),
          target_audience: document.getElementById('fAudience').value.trim(),
          key_details: document.getElementById('fDetails').value.trim(),
        };
        const res = await api.post('/api/campaigns', payload);
        const nc = await j(res);
        campaigns.push({ campaign_id: nc.campaign_id, ...payload, status:'draft', total_leads:0 });
        document.getElementById('createModal').classList.add('hidden');
        fullRefresh();
      } catch (err) { alert('Failed: ' + err.message); }
      finally { btn.disabled = false; btn.innerHTML = '<i class="fas fa-rocket"></i> Create'; }
    });

    // Action buttons
    document.querySelectorAll('.vd-act-btn[data-action]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const action = btn.dataset.action;
        const id = btn.dataset.id;

        if (action === 'start') {
          try { await api.post(`/api/campaigns/${id}/start`); const c = campaigns.find(x=>(x.campaign_id||x.id)===id); if(c)c.status='active'; fullRefresh(); } catch(e){alert(e.message);}
        }
        if (action === 'pause') {
          try { await api.post(`/api/campaigns/${id}/pause`); const c = campaigns.find(x=>(x.campaign_id||x.id)===id); if(c)c.status='paused'; fullRefresh(); } catch(e){alert(e.message);}
        }
        if (action === 'clear') {
          if (!confirm('Clear all leads? This cannot be undone.')) return;
          try { await api.delete(`/api/campaigns/${id}/leads`); refreshData(); } catch(e){alert(e.message);}
        }
        if (action === 'delete') {
          if (!confirm('Delete this campaign and ALL data permanently?')) return;
          try {
            await api.delete(`/api/campaigns/${id}`);
            campaigns = campaigns.filter(x=>(x.campaign_id||x.id)!==id);
            selectedId = null;
            fullRefresh();
          } catch(e){alert(e.message);}
        }
      });
    });

    // CSV Upload
    document.getElementById('csvIn')?.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file || !selectedId) return;
      const fd = new FormData();
      fd.append('file', file);
      try {
        const res = await api.upload(`/api/campaigns/${selectedId}/upload`, fd);
        const d = await j(res);
        alert(`✅ ${d.accepted||0} accepted, ${(d.rejected||[]).length} rejected.`);
        refreshData();
      } catch(e){alert(e.message);}
      e.target.value = '';
    });
  };

  /* ━━━ Global events ━━━ */
  document.getElementById('logoutBtn').addEventListener('click', logout);
  document.getElementById('settingsBtn').addEventListener('click', () => navigate('/settings'));

  attachEvents();
};
