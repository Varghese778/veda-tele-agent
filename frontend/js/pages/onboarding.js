/**
 * @file frontend/js/pages/onboarding.js
 */

import { api } from "../api.js";
import { navigate } from "../router.js";

export const renderOnboarding = async (container) => {
    container.innerHTML = `
        <div class="onboarding-page animate-fade-in">
            <div class="container flex flex-col items-center">
                <div class="onboarding-card glass p-lg">
                    <h2 class="font-heading">Complete Your Profile</h2>
                    <p class="text-muted">Tell us about your business to help Veda represent you better.</p>
                    
                    <form id="onboardingForm" class="flex flex-col gap-md">
                        <div class="form-group">
                            <label>Business Name</label>
                            <input type="text" id="bizName" placeholder="e.g. Acme Solar Solutions" required>
                        </div>
                        <div class="form-group">
                            <label>Industry</label>
                            <select id="industry" required>
                                <option value="">Select Industry...</option>
                                <option value="Real Estate">Real Estate</option>
                                <option value="SaaS">SaaS</option>
                                <option value="Healthcare">Healthcare</option>
                                <option value="Solar">Solar</option>
                                <option value="Financial Services">Financial Services</option>
                                <option value="Other">Other</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Primary Contact Phone (E.164)</label>
                            <input type="tel" id="bizPhone" placeholder="+15550000000" required>
                        </div>
                        
                        <button type="submit" class="btn btn-primary">
                            Finish Setup
                            <i class="fas fa-arrow-right"></i>
                        </button>
                    </form>
                </div>
            </div>
        </div>
    `;

    document.getElementById('onboardingForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const data = {
            business_name: document.getElementById('bizName').value,
            industry: document.getElementById('industry').value,
            phone_number: document.getElementById('bizPhone').value
        };

        try {
            await api.patch('/api/business/profile', data);
            navigate('/dashboard');
        } catch (err) {
            alert('Failed to save profile: ' + err.message);
        }
    });
};
