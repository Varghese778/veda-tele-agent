/**
 * @file frontend/js/pages/settings.js
 * @description User Settings Page — system prompt, voice, theme, usage tracking.
 */

import { api } from "../api.js";
import { state } from "../auth.js";
import { navigate } from "../router.js";

export const renderSettings = async (container) => {
    let settings = {};
    let availableVoices = [];

    try {
        const res = await api.get('/api/settings');
        settings = res.settings || {};
        availableVoices = res.available_voices || [];
    } catch (err) {
        console.error("[Settings] Failed to load settings:", err.message);
    }

    container.innerHTML = `
        <div class="settings-page animate-fade-in" style="min-height:100vh; padding: 24px;">
            <nav class="navbar glass" style="margin-bottom: 32px;">
                <div class="container flex justify-between items-center">
                    <div class="logo font-heading flex items-center gap-md">
                        <i class="fas fa-microchip text-primary"></i>
                        <span>VEDA</span>
                    </div>
                    <div class="nav-actions flex items-center gap-lg">
                        <button id="backToDash" class="btn btn-outline btn-sm">
                            <i class="fas fa-arrow-left"></i> Back to Dashboard
                        </button>
                    </div>
                </div>
            </nav>

            <div class="container" style="max-width: 720px; margin: 0 auto;">
                <h1 class="font-heading text-3xl" style="margin-bottom: 8px;">Settings</h1>
                <p class="text-muted" style="margin-bottom: 32px;">Configure your AI agent, voice preferences, and account settings.</p>

                <!-- System Prompt -->
                <div class="glass" style="padding: 24px; border-radius: 16px; margin-bottom: 24px;">
                    <h3 class="font-heading" style="margin-bottom: 12px;">
                        <i class="fas fa-brain text-primary"></i> Agent System Prompt
                    </h3>
                    <p class="text-muted text-sm" style="margin-bottom: 12px;">
                        Customize how your AI agent behaves. This prompt is merged with campaign context.
                    </p>
                    <textarea id="systemPromptInput" rows="8" style="width:100%; padding: 14px; border-radius: 12px; background: var(--color-surface); border: 1px solid var(--color-border); color: var(--color-text); font-family: 'Inter', monospace; font-size: 0.85rem; resize: vertical;">${settings.system_prompt || ''}</textarea>
                </div>

                <!-- Voice Selection -->
                <div class="glass" style="padding: 24px; border-radius: 16px; margin-bottom: 24px;">
                    <h3 class="font-heading" style="margin-bottom: 12px;">
                        <i class="fas fa-microphone text-primary"></i> Agent Voice
                    </h3>
                    <p class="text-muted text-sm" style="margin-bottom: 12px;">
                        Select the voice your AI agent uses during calls.
                    </p>
                    <div class="voice-options flex gap-md" style="flex-wrap: wrap;">
                        ${availableVoices.map(v => `
                            <button class="btn voice-btn ${v === settings.voice ? 'btn-primary' : 'btn-outline'}" data-voice="${v}" style="padding: 10px 20px; border-radius: 12px;">
                                ${v}
                            </button>
                        `).join('')}
                    </div>
                </div>

                <!-- Usage -->
                <div class="glass" style="padding: 24px; border-radius: 16px; margin-bottom: 24px;">
                    <h3 class="font-heading" style="margin-bottom: 12px;">
                        <i class="fas fa-chart-bar text-primary"></i> Usage
                    </h3>
                    <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                        <span class="text-muted text-sm">Voice Sessions Used</span>
                        <span class="text-sm font-semibold">${settings.usage_count || 0} / ${settings.usage_limit || 50}</span>
                    </div>
                    <div style="width:100%; height: 8px; background: var(--color-surface); border-radius: 4px; overflow: hidden;">
                        <div style="width: ${Math.min(((settings.usage_count || 0) / (settings.usage_limit || 50)) * 100, 100)}%; height: 100%; background: var(--color-primary); border-radius: 4px; transition: width 0.3s;"></div>
                    </div>
                </div>

                <!-- Theme -->
                <div class="glass" style="padding: 24px; border-radius: 16px; margin-bottom: 24px;">
                    <h3 class="font-heading" style="margin-bottom: 12px;">
                        <i class="fas fa-palette text-primary"></i> Theme
                    </h3>
                    <div class="flex gap-md">
                        <button class="btn theme-btn ${(settings.theme || 'dark') === 'dark' ? 'btn-primary' : 'btn-outline'}" data-theme="dark" style="padding: 10px 24px; border-radius: 12px;">
                            <i class="fas fa-moon"></i> Dark
                        </button>
                        <button class="btn theme-btn ${settings.theme === 'light' ? 'btn-primary' : 'btn-outline'}" data-theme="light" style="padding: 10px 24px; border-radius: 12px;">
                            <i class="fas fa-sun"></i> Light
                        </button>
                    </div>
                </div>

                <!-- Save Button -->
                <button id="saveSettingsBtn" class="btn btn-primary" style="width: 100%; padding: 16px; border-radius: 12px; font-size: 1rem; font-weight: 600;">
                    <i class="fas fa-save"></i> Save Settings
                </button>

                <p class="text-muted text-sm" style="text-align:center; margin-top: 16px;">
                    Signed in as <strong>${state.user?.email || ''}</strong>
                </p>
            </div>
        </div>
    `;

    // State tracking
    let selectedVoice = settings.voice || 'Kore';
    let selectedTheme = settings.theme || 'dark';

    // Back button
    document.getElementById('backToDash').addEventListener('click', () => navigate('/dashboard'));

    // Voice selection
    document.querySelectorAll('.voice-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            selectedVoice = btn.dataset.voice;
            document.querySelectorAll('.voice-btn').forEach(b => {
                b.classList.toggle('btn-primary', b.dataset.voice === selectedVoice);
                b.classList.toggle('btn-outline', b.dataset.voice !== selectedVoice);
            });
        });
    });

    // Theme selection
    document.querySelectorAll('.theme-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            selectedTheme = btn.dataset.theme;
            document.querySelectorAll('.theme-btn').forEach(b => {
                b.classList.toggle('btn-primary', b.dataset.theme === selectedTheme);
                b.classList.toggle('btn-outline', b.dataset.theme !== selectedTheme);
            });
        });
    });

    // Save
    document.getElementById('saveSettingsBtn').addEventListener('click', async () => {
        const btn = document.getElementById('saveSettingsBtn');
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
        try {
            await api.put('/api/settings', {
                system_prompt: document.getElementById('systemPromptInput').value,
                voice: selectedVoice,
                theme: selectedTheme,
            });
            btn.innerHTML = '<i class="fas fa-check"></i> Saved!';
            setTimeout(() => {
                btn.innerHTML = '<i class="fas fa-save"></i> Save Settings';
                btn.disabled = false;
            }, 2000);
        } catch (err) {
            alert('Failed to save settings: ' + err.message);
            btn.innerHTML = '<i class="fas fa-save"></i> Save Settings';
            btn.disabled = false;
        }
    });
};
