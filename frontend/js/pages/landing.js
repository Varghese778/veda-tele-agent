/**
 * @file frontend/js/pages/landing.js
 */

import { login, state } from "../auth.js";
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
                    <p class="text-muted">Sign in with your corporate Google account to access your dashboard.</p>
                    <button id="loginBtn" class="btn btn-primary">
                        <i class="fab fa-google"></i>
                        Sign in with Google
                    </button>
                    <p class="terms">By signing in, you agree to our Terms of Service.</p>
                </div>
            </main>

            <div class="bg-glow"></div>
        </div>
    `;

    document.getElementById('loginBtn').addEventListener('click', async () => {
        try {
            await login();
            navigate('/dashboard');
        } catch (err) {
            alert('Login failed. Please try again.');
        }
    });
};
