# System Modules Overview
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Veda-Tele-Agent is built on a highly modular architecture where each component (MOD-01 through MOD-15) performs a discrete, atomic responsibility within the AI tele-calling lifecycle.

## 🧱 Module Matrix

| ID | Module Name | Primary Responsibility | Key Files |
| :--- | :--- | :--- | :--- |
| **MOD-01** | AuthModule | Identity & Claims | `auth.routes.js`, `auth.middleware.js` |
| **MOD-02** | BusinessProfileModule | Multi-tenant context | `business.service.js`, `business.routes.js` |
| **MOD-03** | CampaignModule | Outreach Lifecycle | `campaigns.service.js`, `campaigns.routes.js` |
| **MOD-04** | LeadIngestionModule| CSV Pipeline | `leads.service.js`, `leads.routes.js` |
| **MOD-05** | CallOrchestrator | Background Polling | `orchestrator.service.js` |
| **MOD-06** | TwilioWebhook | Telephony Protocol | `twilio.routes.js`, `twilio.service.js` |
| **MOD-07** | GeminiLiveBridge | WebSocket Audio | `bridge.service.js`, `audio.converter.js` |
| **MOD-08** | PromptBuilder | Contextual Persona | `prompt.builder.js` |
| **MOD-09** | DataExtraction | Outcome Intelligence | `extraction.service.js` |
| **MOD-10** | TranscriptModule | Conversation Persistence| `transcript.service.js`, `transcript.controller.js` |
| **MOD-11** | RecordingModule | Audio Proxy | `recording.service.js`, `recording.controller.js` |
| **MOD-12** | AnalyticsDashboard | Metric Aggregation | `analytics.service.js`, `analytics.controller.js` |
| **MOD-13** | AdminModule | Platform Oversight | `admin.controller.js`, `admin.routes.js` |
| **MOD-14** | NotificationModule | Follow-up Automation | `notification.service.js` |
| **MOD-15** | FrontendModule | Premium UI | `frontend/`, `index.html`, `js/app.js` |

---

## 🛰️ Module Deep Dive

### High-Frequency Loop (The Core)
The system's heartbeat is the **Orchestrator (MOD-05)**, which continuously polls the Firestore `campaigns` collection. When it identifies a candidate for calling, it triggers a Twilio outbound call. 

### The Real-Time Bridge
The **GeminiLiveBridge (MOD-07)** is the most sophisticated module. It establishes a WebSocket link between Twilio and Vertex AI. It performs manual audio transcoding between G.711 mu-law (8kHz) and Linear16 PCM (16kHz/24kHz) to enable Google's Gemini 1.5 Flash models to "speak" directly to customers with sub-second latency.

### Data & Insight
As the call concludes, **DataExtraction (MOD-09)** and **TranscriptModule (MOD-10)** perform a post-mortem on the audio data, extracting structured JSON outcomes (PII, sentiment, intent) and assembling the final dialogue for business owner review.
