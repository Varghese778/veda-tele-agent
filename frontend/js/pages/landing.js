/**
 * @file frontend/js/pages/landing.js
 */

import { login, register, loginWithGoogleCredential } from "../auth.js";
import { navigate } from "../router.js";

export const renderLanding = async (container) => {
    container.innerHTML = `
        <div class="split-landing-page animate-fade-in">
            <!-- Left Pane: Visual & Branding -->
            <div class="split-left">
                <div class="split-left-content">
                    <div class="logo font-heading flex items-center gap-md">
                        <i class="fas fa-microchip text-primary" style="font-size: 1.5rem;"></i>
                        <span style="font-size: 1.25rem; font-weight: 700; letter-spacing: 1px;">VEDA</span>
                    </div>
                    <div class="split-left-text">
                        <p class="eyebrow">A WISE QUOTE</p>
                        <h1 class="font-heading">Get<br>Everything<br>You Want</h1>
                        <p class="subtitle text-muted mt-md">Empower your business with autonomous voice agents that qualify leads, handle objections, and close deals while you sleep.</p>
                    </div>
                </div>
            </div>

            <!-- Right Pane: Auth Form -->
            <div class="split-right">
                <div class="auth-container">
                    <div class="auth-header text-center mb-xl">
                        <h2 class="font-heading" style="font-size: 2.5rem; margin-bottom: 8px;">Welcome Back</h2>
                        <p class="text-muted" style="font-size: 0.95rem;">Enter your email and password to access your account</p>
                    </div>
                    
                    <form class="auth-form" id="authForm" onsubmit="return false;">
                        <div class="form-group mb-lg">
                            <label>Email</label>
                            <input type="email" id="emailInput" placeholder="Enter your email" required>
                        </div>
                        <div class="form-group mb-md">
                            <label>Password</label>
                            <input type="password" id="passwordInput" placeholder="Enter your password (min 8 chars)" required>
                        </div>
                        <div class="form-group mb-lg" style="margin-bottom: 24px;">
                            <label>Display Name (optional for register)</label>
                            <input type="text" id="nameInput" placeholder="Display name">
                        </div>
                        
                        <div class="flex justify-between items-center mb-xl text-sm text-muted">
                            <label class="flex items-center gap-sm cursor-pointer">
                                <input type="checkbox" id="rememberMe"> Remember me
                            </label>
                            <a href="#" class="forgot-link">Forgot Password</a>
                        </div>
                        
                        <div class="auth-actions flex flex-col gap-md">
                            <button id="loginBtn" class="btn btn-solid-dark w-full py-md" style="padding: 14px; border-radius: 12px; font-weight: 600; font-size: 1rem;">
                                Sign In
                            </button>
                            <button id="registerBtn" class="btn btn-outline w-full py-md" style="padding: 14px; border-radius: 12px; font-weight: 600; font-size: 1rem;">
                                Register
                            </button>
                        </div>
                        
                        <div class="divider text-muted text-sm text-center my-lg" style="margin: 24px 0; position: relative;">
                            <span style="background: var(--color-surface); padding: 0 10px; position: relative; z-index: 1;">Or</span>
                            <div style="position: absolute; top: 50%; left: 0; right: 0; height: 1px; background: var(--color-border); z-index: 0;"></div>
                        </div>

                        <div id="googleBtnContainer" class="flex justify-center mb-xl"></div>
                    </form>
                </div>
            </div>
        </div>
    `;

    const getCredentials = () => ({
        email: document.getElementById('emailInput').value.trim(),
        password: document.getElementById('passwordInput').value,
        displayName: document.getElementById('nameInput').value.trim(),
    });

    const googleClientId = window.__ENV__?.GOOGLE_OAUTH_CLIENT_ID;
    if (window.google?.accounts?.id && googleClientId) {
        window.google.accounts.id.initialize({
            client_id: googleClientId,
            callback: async (response) => {
                try {
                    await loginWithGoogleCredential(response.credential);
                    navigate('/dashboard');
                } catch (err) {
                    alert(`Google sign-in failed: ${err.message}`);
                }
            }
        });

        window.google.accounts.id.renderButton(
            document.getElementById('googleBtnContainer'),
            {
                theme: 'outline',
                size: 'large',
                text: 'signin_with',
                shape: 'pill',
                width: 280
            }
        );
    }

    document.getElementById('loginBtn').addEventListener('click', async () => {
        try {
            const creds = getCredentials();
            if (!creds.email || !creds.password) {
                alert('Please enter email and password.');
                return;
            }
            await login({ email: creds.email, password: creds.password });
            navigate('/dashboard');
        } catch (err) {
            alert(`Login failed: ${err.message}`);
        }
    });

    document.getElementById('registerBtn').addEventListener('click', async () => {
        try {
            const creds = getCredentials();
            if (!creds.email || !creds.password) {
                alert('Please enter email and password.');
                return;
            }
            await register({ email: creds.email, password: creds.password, displayName: creds.displayName });
            navigate('/dashboard');
        } catch (err) {
            alert(`Registration failed: ${err.message}`);
        }
    });
};
