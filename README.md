# Veda-Tele-Agent 🤖🎙️
### AI-Powered Intelligent Tele-Calling & Real-time Voice Outreach

Veda-Tele-Agent is a production-ready, autonomous voice outreach platform that bridges the gap between **Twilio Telephony** and **Google Gemini 1.5 Flash**. It allows businesses to run intelligent, human-like voice campaigns that qualify leads, handle objections, and capture structured insights in real-time.

---

## 🌟 Key Features

- **Real-time AI Voice Bridge**: Sub-second latency audio streaming between Gemini Live and Twilio.
- **Dynamic Persona Engineering**: Automated system prompt assembly based on business profile and campaign objectives.
- **Intelligent Data Extraction**: Automatically extracts sentiment, intent, and structured outcomes (JSON) from every call.
- **Premium Glassmorphism Dashboard**: A sleek, real-time control center for business owners and administrators.
- **Multi-Tenant Isolation**: Robust tenant gating ensuring complete data privacy across multiple businesses.
- **Automated Follow-ups**: Immediate SMS callbacks for interested leads using Programmable SMS.

---

## 🏗️ Architecture Summary

Veda is built on a modular Node.js backend with a Vanilla JS frontend.
- **Orchestration**: Background polling of campaigns to initiate outbound calls.
- **Media Transcoding**: Manual u-law <-> PCM16 conversion for high-fidelity audio bridging.
- **Infrastructure**: Designed for serverless deployment on Google Cloud Run.

> [!TIP]
> Check out the **[Architecture Diagrams](docs/MERMAID_ARCHITECTURE.md)** for a visual deep-dive.

---

## 🚀 Quick Start (Local Setup)

### 1. Prerequisites
- **Node.js**: v20 or newer.
- **Twilio**: Account SID, Auth Token, and a verified Twilio Number.
- **Google Cloud**: A project with Vertex AI and Firestore (Native Mode) enabled.

### 2. Installation
```bash
git clone https://github.com/your-repo/veda-tele-agent.git
cd veda-tele-agent/backend
npm install
```

### 3. Configuration
Create a `.env` file in the `backend/` directory:
```env
PORT=8080
GOOGLE_CLOUD_PROJECT=your-project-id
TWILIO_ACCOUNT_SID=your-sid
TWILIO_AUTH_TOKEN=your-token
TWILIO_NUMBER=your-twilio-number
```

### 4. Running the App
**Start Backend:**
```bash
npm run dev
```
**Start Frontend:**
Open `frontend/index.html` in your browser or use a static server:
```bash
npx serve ../frontend
```

---

## 🐳 Docker Deployment

The fastest way to get Veda running in a production-like environment:

1. Ensure your `.env` is configured in the root.
2. Run Docker Compose:
```bash
docker-compose up --build
```
The backend will be available at `:8080` and the frontend at `:3000`.

---

## 📚 Documentation
- **[System Modules](docs/SYSTEM_MODULES.md)**: Breakdown of all 15 core components.
- **[Implementation Details](docs/IMPLEMENTATION.md)**: The "how-it-works" for developers.
- **[Tech Stack](docs/TECH_STACK.md)**: Full inventory of libraries and cloud services.
- **[Requirements](requirements.txt)**: Human-readable setup manifest.

---

## 🔐 Security Notes
- **In-Memory ID Tokens**: The frontend stores ID tokens in RAM only to prevent local storage theft.
- **Read-Only Admin**: The administrative portal is read-only at MVP to ensure critical data integrity.
- **Audio Privacy**: Raw Twilio audio URLs are proxied and never exposed to the client.

## ⚖️ License
Veda-Tele-Agent is licensed under the **Business Source License 1.1 (BUSL-1.1)**.
