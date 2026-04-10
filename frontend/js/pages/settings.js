/**
 * @file frontend/js/pages/settings.js
 * @description User Settings Page — system prompt, voice, skills, profile.
 * All settings persist to Firestore user_settings collection.
 */

import { api } from "../api.js";
import { state } from "../auth.js";
import { navigate } from "../router.js";

export const renderSettings = async (container) => {
    let settings = {};
    let availableVoices = [];
    let profile = {};

    // Load settings
    try {
        const res = await api.get('/api/settings');
        settings = res?.settings || {};
        availableVoices = res?.available_voices || ['Aoede', 'Charon', 'Fenrir', 'Kore', 'Puck'];
    } catch (err) {
        console.error("[Settings] Failed to load settings:", err.message);
        availableVoices = ['Aoede', 'Charon', 'Fenrir', 'Kore', 'Puck'];
    }

    // Load profile
    try {
        const pr = await api.get('/api/business/profile');
        if (pr && !pr.status) profile = pr;
    } catch (_) {}

    // Get Google user data from auth state
    const user = state.user || {};
    const displayName = user.display_name || user.displayName || profile.business_name || '';
    const email = user.email || '';
    const photoURL = user.photo_url || user.photoURL || '';
    const initials = displayName ? displayName[0].toUpperCase() : email ? email[0].toUpperCase() : 'U';

    // Skills state
    let skills = Array.isArray(settings.skills) ? [...settings.skills] : [];

    const renderSkillList = () => {
        const el = document.getElementById('skillList');
        if (!el) return;
        if (skills.length === 0) {
            el.innerHTML = '<div style="color:var(--tx2);font-size:0.78rem;font-style:italic;padding:12px 0;text-align:center;">No skills added yet. Upload .md files to enhance your AI agent.</div>';
            return;
        }
        el.innerHTML = skills.map((s, i) => `
            <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;background:var(--s2);border-radius:8px;margin-bottom:6px;border:1px solid var(--bdr);">
                <div>
                    <div style="font-weight:600;font-size:0.82rem;">📄 ${s.name}</div>
                    <div style="color:var(--tx2);font-size:0.68rem;margin-top:2px;">${s.content.length} chars</div>
                </div>
                <button class="skill-del" data-idx="${i}" style="background:none;border:none;color:#ef4444;cursor:pointer;font-size:0.82rem;padding:4px 8px;border-radius:6px;transition:0.15s;">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        `).join('');

        // Attach delete handlers
        document.querySelectorAll('.skill-del').forEach(btn => {
            btn.addEventListener('click', () => {
                const idx = parseInt(btn.dataset.idx);
                skills.splice(idx, 1);
                renderSkillList();
            });
        });
    };

    container.innerHTML = `
        <div class="vd" style="min-height:100vh;">
            <nav class="vd-nav">
                <div class="vd-brand"><i class="fas fa-bolt"></i> VEDA</div>
                <div class="vd-nav-r">
                    <button class="vd-nav-btn" id="backBtn"><i class="fas fa-arrow-left"></i> Back</button>
                </div>
            </nav>

            <main style="max-width:640px; margin:0 auto; padding:28px 24px;">
                <h1 style="font-family:'Outfit',sans-serif; font-size:1.5rem; font-weight:600; margin-bottom:4px;">Settings</h1>
                <p style="color:var(--tx2); font-size:0.85rem; margin-bottom:28px;">Configure your AI agent and account.</p>

                <!-- Profile Card -->
                <div style="background:var(--s1); border:1px solid var(--bdr); border-radius:14px; padding:20px; margin-bottom:18px; display:flex; align-items:center; gap:16px;">
                    ${photoURL
                        ? `<img src="${photoURL}" style="width:52px;height:52px;border-radius:50%;object-fit:cover;" referrerpolicy="no-referrer">`
                        : `<div style="width:52px;height:52px;border-radius:50%;background:var(--em);display:flex;align-items:center;justify-content:center;font-size:1.2rem;font-weight:700;color:#000;">${initials}</div>`
                    }
                    <div>
                        <div style="font-weight:600;font-size:0.95rem;">${displayName || 'User'}</div>
                        <div style="color:var(--tx2);font-size:0.8rem;">${email}</div>
                    </div>
                </div>

                <!-- System Prompt -->
                <div style="background:var(--s1); border:1px solid var(--bdr); border-radius:14px; padding:20px; margin-bottom:18px;">
                    <div style="font-family:'Outfit',sans-serif; font-weight:600; margin-bottom:6px; display:flex; align-items:center; gap:8px;">
                        <i class="fas fa-brain" style="color:var(--em);font-size:0.85rem;"></i> Agent System Prompt
                    </div>
                    <p style="color:var(--tx2); font-size:0.78rem; margin-bottom:10px;">
                        This is the base behavior prompt for your AI agent. Campaign-specific details are injected automatically.
                    </p>
                    <textarea id="promptInput" rows="12" style="width:100%; padding:12px; border-radius:10px; background:var(--s2); border:1px solid var(--bdr); color:var(--tx); font-size:0.78rem; font-family:'Inter',monospace; resize:vertical; line-height:1.6;">${(settings.system_prompt || '').replace(/</g, '&lt;')}</textarea>
                </div>

                <!-- Skills Section -->
                <div style="background:var(--s1); border:1px solid var(--bdr); border-radius:14px; padding:20px; margin-bottom:18px;">
                    <div style="font-family:'Outfit',sans-serif; font-weight:600; margin-bottom:6px; display:flex; align-items:center; gap:8px;">
                        <i class="fas fa-graduation-cap" style="color:var(--em);font-size:0.85rem;"></i> Agent Skills
                    </div>
                    <p style="color:var(--tx2); font-size:0.78rem; margin-bottom:12px;">
                        Upload <code>.md</code> files to teach your AI agent specialized skills. Examples: marketing strategies, negotiation tactics, product knowledge, communication frameworks.
                    </p>
                    <div id="skillList"></div>
                    <label style="display:flex;align-items:center;gap:8px;padding:10px 16px;border-radius:10px;background:var(--s2);border:1px dashed var(--bdr);color:var(--tx2);cursor:pointer;transition:0.15s;margin-top:8px;font-size:0.82rem;justify-content:center;">
                        <i class="fas fa-upload" style="font-size:0.75rem;"></i> Upload .md Skill File
                        <input type="file" id="skillFileInput" accept=".md,.txt,.markdown" style="display:none;" multiple>
                    </label>
                </div>

                <!-- Voice Selection -->
                <div style="background:var(--s1); border:1px solid var(--bdr); border-radius:14px; padding:20px; margin-bottom:18px;">
                    <div style="font-family:'Outfit',sans-serif; font-weight:600; margin-bottom:6px; display:flex; align-items:center; gap:8px;">
                        <i class="fas fa-microphone" style="color:var(--em);font-size:0.85rem;"></i> Agent Voice
                    </div>
                    <p style="color:var(--tx2); font-size:0.78rem; margin-bottom:10px;">
                        Select the voice your AI agent uses during calls.
                    </p>
                    <div style="display:flex;gap:8px;flex-wrap:wrap;">
                        ${availableVoices.map(v => `
                            <button class="voice-btn" data-voice="${v}" style="padding:8px 18px; border-radius:10px; border:1px solid var(--bdr); background:${v === (settings.voice || 'Kore') ? 'var(--em)' : 'var(--s2)'}; color:${v === (settings.voice || 'Kore') ? '#000' : 'var(--tx)'}; font-weight:${v === (settings.voice || 'Kore') ? '700' : '400'}; cursor:pointer; font-size:0.82rem; transition:0.15s;">${v}</button>
                        `).join('')}
                    </div>
                </div>

                <!-- Usage -->
                <div style="background:var(--s1); border:1px solid var(--bdr); border-radius:14px; padding:20px; margin-bottom:18px;">
                    <div style="font-family:'Outfit',sans-serif; font-weight:600; margin-bottom:10px; display:flex; align-items:center; gap:8px;">
                        <i class="fas fa-chart-bar" style="color:var(--em);font-size:0.85rem;"></i> Usage
                    </div>
                    <div style="display:flex;justify-content:space-between;margin-bottom:6px;">
                        <span style="color:var(--tx2);font-size:0.82rem;">Voice Sessions</span>
                        <span style="font-weight:600;font-size:0.82rem;">${settings.usage_count || 0} / ${settings.usage_limit || 50}</span>
                    </div>
                    <div style="width:100%;height:6px;background:var(--s2);border-radius:3px;overflow:hidden;">
                        <div style="width:${Math.min(((settings.usage_count||0)/(settings.usage_limit||50))*100,100)}%;height:100%;background:var(--em);border-radius:3px;transition:0.3s;"></div>
                    </div>
                </div>

                <!-- Save -->
                <button id="saveBtn" style="width:100%;padding:14px;border:none;border-radius:12px;background:var(--em);color:#000;font-weight:700;font-size:0.9rem;cursor:pointer;transition:0.15s;margin-bottom:10px;">
                    <i class="fas fa-save"></i> Save Settings
                </button>
                <div id="saveStatus" style="text-align:center;font-size:0.78rem;color:var(--tx2);min-height:20px;"></div>
            </main>
        </div>
    `;

    // Render skill list
    renderSkillList();

    // State
    let selectedVoice = settings.voice || 'Kore';

    // Events
    document.getElementById('backBtn').addEventListener('click', () => navigate('/dashboard'));

    // Voice selection
    document.querySelectorAll('.voice-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            selectedVoice = btn.dataset.voice;
            document.querySelectorAll('.voice-btn').forEach(b => {
                const isActive = b.dataset.voice === selectedVoice;
                b.style.background = isActive ? 'var(--em)' : 'var(--s2)';
                b.style.color = isActive ? '#000' : 'var(--tx)';
                b.style.fontWeight = isActive ? '700' : '400';
            });
        });
    });

    // Skill file upload
    document.getElementById('skillFileInput').addEventListener('change', async (e) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;

        for (const file of files) {
            try {
                const content = await file.text();
                const name = file.name.replace(/\.(md|txt|markdown)$/i, '');
                // Check if skill with same name already exists
                const existingIdx = skills.findIndex(s => s.name === name);
                if (existingIdx >= 0) {
                    skills[existingIdx].content = content;
                } else {
                    if (skills.length >= 10) {
                        alert('Maximum 10 skills allowed. Remove one before adding more.');
                        break;
                    }
                    skills.push({ name, content });
                }
            } catch (err) {
                console.error('[Settings] Failed to read file:', err.message);
            }
        }

        renderSkillList();
        e.target.value = '';
    });

    // Save
    document.getElementById('saveBtn').addEventListener('click', async () => {
        const btn = document.getElementById('saveBtn');
        const status = document.getElementById('saveStatus');
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
        status.textContent = '';

        try {
            const payload = {
                system_prompt: document.getElementById('promptInput').value,
                voice: selectedVoice,
                skills: skills,
            };
            
            await api.put('/api/settings', payload);
            
            btn.innerHTML = '<i class="fas fa-check"></i> Saved!';
            status.style.color = '#22c55e';
            status.textContent = 'Settings saved successfully. Your AI agent will use these on the next call.';

            setTimeout(() => {
                btn.innerHTML = '<i class="fas fa-save"></i> Save Settings';
                btn.disabled = false;
            }, 2500);
        } catch (err) {
            btn.innerHTML = '<i class="fas fa-save"></i> Save Settings';
            btn.disabled = false;
            status.style.color = '#ef4444';
            status.textContent = 'Failed to save: ' + err.message;
        }
    });
};
