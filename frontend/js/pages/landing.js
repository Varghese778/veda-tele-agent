/**
 * @file frontend/js/pages/landing.js
 */

import { login, register, loginWithGoogleCredential } from "../auth.js";
import { navigate } from "../router.js";

export const renderLanding = async (container) => {
    container.innerHTML = `
        <div class="landing-page animate-fade-in">
            <nav class="navbar glass">
                <div class="container flex justify-between items-center">
                    <div class="logo font-heading flex items-center gap-md">
                        <i class="fas fa-microchip text-primary"></i>
                        <span>VEDA</span>
                    </div>
                </div>
            </nav>

            <main class="hero container flex flex-col items-center justify-center text-center">
                <h1 class="hero-title">Intelligent AI Tele-Calling<br/><span class="text-primary">At Scale</span></h1>
                <p class="hero-subtitle text-muted">Empower your business with autonomous voice agents that qualify leads, handle objections, and close deals while you sleep.</p>
                
                <div class="login-box glass p-lg">
                    <h3>Get Started</h3>
                    <p class="text-muted">Create an account or sign in to access your dashboard.</p>
                    <div id="googleBtnContainer" class="mb-md"></div>
                    <div class="text-muted" style="margin: 8px 0;">or use email/password</div>
                    <div class="form-group">
                        <input type="email" id="emailInput" placeholder="Email" required>
                    </div>
                    <div class="form-group">
                        <input type="password" id="passwordInput" placeholder="Password (min 8 chars)" required>
                    </div>
                    <div class="form-group">
                        <input type="text" id="nameInput" placeholder="Display name (optional)">
                    </div>
                    <div class="flex gap-md" style="display:flex; gap: 10px; margin-top: 10px;">
                        <button id="loginBtn" class="btn btn-primary" style="flex:1;">
                            Sign In
                        </button>
                        <button id="registerBtn" class="btn btn-outline" style="flex:1;">
                            Register
                        </button>
                    </div>
                    <p class="terms">By signing in, you agree to our Terms of Service.</p>
                </div>
            </main>

            <div class="bg-glow"></div>
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
