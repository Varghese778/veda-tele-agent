/**
 * @file frontend/js/pages/onboarding.js
 * @description Business registration / onboarding page.
 */

import { api } from "../api.js";
import { navigate } from "../router.js";
import { state } from "../auth.js";

export const renderOnboarding = async (container) => {
    container.innerHTML = `
        <div class="onboarding-page animate-fade-in" style="min-height:100vh; display:flex; align-items:center; justify-content:center; padding:40px 20px;">
            <div style="width:100%; max-width:520px;">
                <!-- Header -->
                <div style="text-align:center; margin-bottom:32px;">
                    <div style="display:inline-flex; align-items:center; gap:10px; margin-bottom:20px;">
                        <i class="fas fa-bolt" style="color:var(--color-primary); font-size:1.4rem;"></i>
                        <span class="font-heading" style="font-size:1.5rem; font-weight:700;">VEDA</span>
                    </div>
                    <h2 class="font-heading" style="font-size:1.6rem; margin-bottom:8px;">Set Up Your Business</h2>
                    <p class="text-muted" style="font-size:0.9rem;">Tell us about your company so Veda can represent you authentically.</p>
                </div>

                <!-- Form Card -->
                <div class="glass" style="padding:32px; border-radius:20px;">
                    <form id="onboardingForm" style="display:flex; flex-direction:column; gap:20px;">
                        <div class="form-group">
                            <label style="display:flex; align-items:center; gap:6px;"><i class="fas fa-building" style="color:var(--color-primary); font-size:0.85rem;"></i> Business Name</label>
                            <input type="text" id="bizName" placeholder="e.g. Acme Solar Solutions" required style="padding:14px 16px; border-radius:12px;">
                        </div>

                        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
                            <div class="form-group">
                                <label style="display:flex; align-items:center; gap:6px;"><i class="fas fa-industry" style="color:var(--color-info); font-size:0.85rem;"></i> Industry</label>
                                <select id="industry" required style="padding:14px 16px; border-radius:12px;">
                                    <option value="">Select...</option>
                                    <option value="Real Estate">Real Estate</option>
                                    <option value="SaaS">SaaS</option>
                                    <option value="Healthcare">Healthcare</option>
                                    <option value="Solar">Solar</option>
                                    <option value="E-Commerce">E-Commerce</option>
                                    <option value="Financial Services">Financial Services</option>
                                    <option value="Education">Education</option>
                                    <option value="Other">Other</option>
                                </select>
                            </div>
                            <div class="form-group">
                                <label style="display:flex; align-items:center; gap:6px;"><i class="fas fa-phone" style="color:var(--color-warning); font-size:0.85rem;"></i> Phone (E.164)</label>
                                <input type="tel" id="bizPhone" placeholder="+919531975283" required style="padding:14px 16px; border-radius:12px;">
                            </div>
                        </div>

                        <div class="form-group">
                            <label style="display:flex; align-items:center; gap:6px;"><i class="fas fa-lightbulb" style="color:var(--color-warning); font-size:0.85rem;"></i> Core Value Proposition</label>
                            <textarea id="valueProp" rows="4" minlength="50" placeholder="Describe what makes your business unique and what value you provide to customers..." required style="padding:14px 16px; border-radius:12px; resize:vertical;"></textarea>
                            <div style="display:flex; justify-content:space-between; margin-top:6px;">
                                <small class="text-muted" style="font-size:0.75rem;">Minimum 50 characters</small>
                                <small id="charCount" class="text-muted" style="font-size:0.75rem;">0/50</small>
                            </div>
                        </div>
                        
                        <button type="submit" class="btn btn-primary" style="width:100%; padding:16px; border-radius:12px; font-size:1rem; margin-top:8px;">
                            <i class="fas fa-rocket"></i> Complete Setup
                        </button>
                    </form>
                </div>

                <!-- Footer -->
                <p class="text-muted" style="text-align:center; margin-top:20px; font-size:0.8rem;">
                    Signed in as <strong>${state.user?.email || ""}</strong>
                </p>
            </div>
        </div>
    `;

    // Character counter
    const valuePropEl = document.getElementById('valueProp');
    const charCountEl = document.getElementById('charCount');
    valuePropEl.addEventListener('input', () => {
        const len = valuePropEl.value.trim().length;
        charCountEl.innerText = `${len}/50`;
        charCountEl.style.color = len >= 50 ? '#22c55e' : '#94a3b8';
    });

    document.getElementById('onboardingForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const valueProp = document.getElementById('valueProp').value.trim();

        if (valueProp.length < 50) {
            alert(`Core Value Proposition must be at least 50 characters. Current length: ${valueProp.length}`);
            return;
        }

        const submitBtn = e.target.querySelector('button[type="submit"]');
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';

        const data = {
            business_name: document.getElementById('bizName').value,
            industry: document.getElementById('industry').value,
            core_value_prop: valueProp,
            contact_email: state.user?.email || ''
        };

        try {
            const profileResp = await api.get('/api/business/profile');
            if (profileResp?.status === 404) {
                await api.post('/api/business/profile', data);
            } else {
                await api.patch('/api/business/profile', data);
            }
            navigate('/dashboard');
        } catch (err) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="fas fa-rocket"></i> Complete Setup';
            let message = err.message;
            if (message.includes('Validation failed')) {
                message = `${message}\n\nTip: Core Value Proposition must be at least 50 characters.`;
            }
            alert('Failed to save profile: ' + message);
        }
    });
};
