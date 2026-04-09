# PRS.md — Veda-Tele-Agent: AI-Powered Intelligent Tele-Calling SaaS Platform
> **GCP Project ID:** `veda-tele-agent` | **Hackathon Build:** 24-Hour MVP Sprint  
> **Classification:** Bit-Level Product Requirements Specification  
> **Version:** 1.0 | **Status:** ACTIVE BUILD

---

## TABLE OF CONTENTS

1. [System Overview](#1-system-overview)
2. [Architecture Blueprint](#2-architecture-blueprint)
3. [Module Registry](#3-module-registry)
4. [Tech Stack & GCP Resource Map](#4-tech-stack--gcp-resource-map)
5. [Database Schema (Firestore)](#5-database-schema-firestore)
6. [Authentication & Authorization](#6-authentication--authorization)
7. [Telephony Bridge — Twilio ↔ Gemini Live](#7-telephony-bridge--twilio--gemini-live)
8. [AI Agent System Prompt — Reviewed](#8-ai-agent-system-prompt--reviewed)
9. [API Contract Reference](#9-api-contract-reference)
10. [Environment Variables & Secrets](#10-environment-variables--secrets)
11. [Local Dev — GCP ADC Setup](#11-local-dev--gcp-adc-setup)
12. [CI/CD Pipeline](#12-cicd-pipeline)
13. [Dockerization](#13-dockerization)
14. [Deployment — Cloud Run](#14-deployment--cloud-run)
15. [UI Design System](#15-ui-design-system)
16. [Functional Requirements (P0/P1/P2)](#16-functional-requirements-p0p1p2)
17. [Non-Functional Requirements](#17-non-functional-requirements)
18. [Risk Register](#18-risk-register)
19. [Module Generation Prompt for Opus 4.6](#19-module-generation-prompt-for-opus-46)

---

## 1. SYSTEM OVERVIEW

**Product Name:** Veda-Tele-Agent  
**Type:** Multi-Tenant B2B SaaS — AI Outbound Calling Platform  
**Core Value:** Replace human tele-calling teams with a Gemini Live–powered voice agent that calls contacts, holds real conversations, qualifies leads, and logs outcomes autonomously.

### The Three Portals

| Portal | User | Core Purpose |
|--------|------|-------------|
| **Business Owner Portal** | Registered businesses | Campaign creation, contact upload, call monitoring, lead data |
| **Admin Superuser Portal** | Platform admin | Global oversight, drill-down analytics, platform health |
| **Telephony + AI Engine** | Internal (background worker) | Twilio ↔ Gemini Live bridge, call execution, data extraction |

### Call Execution Pipeline (End-to-End)

```
Business uploads CSV
        ↓
Backend detects active campaign → queues leads
        ↓
Backend calls Twilio REST API → Twilio dials customer
        ↓
Customer answers → Twilio opens Media Stream WebSocket → Node.js Bridge
        ↓
Node.js Bridge: pulls business context + campaign + lead → builds system prompt
        ↓
Gemini Live 2.5 Flash Native Audio ← bi-directional audio stream → Twilio
        ↓
AI handles conversation in real-time
        ↓
On call end → Gemini triggers function_call → Node.js writes to Firestore
        ↓
Dashboard updates for Business User + Admin
```

---

## 2. ARCHITECTURE BLUEPRINT

```
┌─────────────────────────────────────────────────────────────────────┐
│                        FRONTEND (Firebase Hosted)                    │
│  ┌──────────────────────┐      ┌──────────────────────────────────┐ │
│  │  Business Owner UI   │      │        Admin Portal UI           │ │
│  │  /dashboard          │      │        /admin                    │ │
│  └──────────┬───────────┘      └──────────────┬───────────────────┘ │
└─────────────┼────────────────────────────────-┼─────────────────────┘
              │  HTTPS REST + Firestore SDK      │
              ▼                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                  BACKEND — Node.js on Cloud Run                      │
│                                                                      │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────────────────┐ │
│  │  Auth       │  │  Campaign    │  │  Call Orchestrator         │ │
│  │  Middleware │  │  API Router  │  │  (Queue + Retry Logic)     │ │
│  └─────────────┘  └──────────────┘  └────────────────────────────┘ │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │              WebSocket Bridge Server                          │   │
│  │   Twilio Media Stream WS ←→ Node.js ←→ Gemini Live WS        │   │
│  └──────────────────────────────────────────────────────────────┘   │
└──────┬────────────────────────┬───────────────────────┬─────────────┘
       │                        │                        │
       ▼                        ▼                        ▼
  Firestore DB            Twilio REST/WS           Gemini Live API
  (Multi-tenant)          (Outbound Calls)         (Vertex AI)
       │
       ▼
  GCS Bucket
  (Call Recordings)
```

---

## 3. MODULE REGISTRY

| Module ID | Name | Responsibility |
|-----------|------|---------------|
| `MOD-01` | **AuthModule** | OAuth2 login, JWT validation, custom claims (admin/user), session management |
| `MOD-02` | **BusinessProfileModule** | Business registration, profile CRUD, onboarding flow |
| `MOD-03` | **CampaignModule** | Campaign CRUD, status lifecycle (draft→active→completed), script config |
| `MOD-04` | **LeadIngestionModule** | CSV upload, validation, parsing, Firestore write per lead |
| `MOD-05` | **CallOrchestratorModule** | Campaign queue polling, Twilio REST call initiation, retry logic |
| `MOD-06` | **TwilioWebhookModule** | Handles Twilio status callbacks, TwiML response generation |
| `MOD-07` | **GeminiLiveBridgeModule** | Core WS bridge: Twilio ↔ Node.js ↔ Gemini Live audio stream |
| `MOD-08` | **PromptBuilderModule** | Dynamic system prompt construction from business + campaign + lead context |
| `MOD-09` | **DataExtractionModule** | Parses Gemini function_call output, writes lead outcome to Firestore |
| `MOD-10` | **TranscriptModule** | Assembles full transcript from Gemini text stream, stores to Firestore |
| `MOD-11` | **RecordingModule** | Retrieves Twilio recording, stores URL to Firestore / GCS |
| `MOD-12` | **AnalyticsDashboardModule** | Aggregates metrics for Business + Admin views, Firestore queries |
| `MOD-13` | **AdminModule** | Superuser routes — global business list, drill-down, platform stats |
| `MOD-14` | **NotificationModule** | Post-call SMS/email summary via Twilio SMS (simulated follow-up) |
| `MOD-15` | **FrontendModule** | HTML/JS/CSS — Business Portal + Admin Portal, Firebase SDK integration |

---

## 4. TECH STACK & GCP RESOURCE MAP

| Layer | Technology | GCP Service / Resource |
|-------|-----------|------------------------|
| Frontend | HTML + Vanilla JS + Firebase SDK | Firebase Hosting |
| Backend Runtime | Node.js 20 LTS + Express 4 + `ws` | Cloud Run (us-central1) |
| AI Engine | Gemini Live 2.5 Flash Native Audio | Vertex AI (`@google-cloud/aiplatform`) |
| Telephony | Twilio Voice API + Media Streams | External (Twilio account) |
| Database | Firestore (Native Mode) | Cloud Firestore (`veda-tele-agent`) |
| Auth | OAuth2 via Google + Firebase Auth | Firebase Authentication |
| Secrets | API Keys, Twilio tokens | Secret Manager |
| File Storage | Call recordings (optional) | Cloud Storage (`veda-recordings-bucket`) |
| CI/CD | GitHub Actions | Cloud Build + Artifact Registry |
| Container Registry | Docker images | Artifact Registry (`us-central1-docker.pkg.dev/veda-tele-agent/veda-repo`) |
| Logging | Structured logs | Cloud Logging (auto via Cloud Run) |
| Monitoring | Uptime + Error alerting | Cloud Monitoring |

### GCP APIs to Enable

```bash
gcloud services enable \
  run.googleapis.com \
  aiplatform.googleapis.com \
  firestore.googleapis.com \
  secretmanager.googleapis.com \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com \
  storage.googleapis.com \
  --project=veda-tele-agent
```

---

## 5. DATABASE SCHEMA (FIRESTORE)

### Multi-Tenant Isolation Strategy
Every document carries `business_id`. Firestore Security Rules enforce that authenticated users can ONLY read/write documents where `business_id == request.auth.uid`. Admin claims bypass this.

---

### Collection: `businesses`

```
businesses/{business_id}
├── business_id         : String   — equals Firebase Auth UID
├── business_name       : String   — "Acme Corp"
├── industry            : String   — "EdTech" | "FinTech" | etc.
├── core_value_prop     : String   — mandatory onboarding input (used in AI prompt)
├── contact_email       : String   — owner's email
├── created_at          : Timestamp
├── updated_at          : Timestamp
└── is_admin            : Boolean  — false (admin set via custom claim, not here)
```

---

### Collection: `campaigns`

```
campaigns/{campaign_id}
├── campaign_id         : String   — auto-generated
├── business_id         : String   — FK → businesses
├── campaign_name       : String   — "Spring Promo 2026"
├── purpose             : String   — "Drive demo bookings for our SaaS product"
├── script_guidelines   : String   — "Be friendly, mention 30-day free trial"
├── product_description : String   — injected into AI prompt
├── target_audience     : String   — "SME owners in Chennai"
├── key_details         : String   — "Pricing: ₹2999/mo, Offer ends May 31"
├── status              : String   — "draft" | "active" | "paused" | "completed"
├── total_leads         : Number   — count on upload
├── called_count        : Number   — incremented per call
├── retry_limit         : Number   — default: 2
├── created_at          : Timestamp
└── updated_at          : Timestamp
```

---

### Collection: `leads`

```
leads/{lead_id}
├── lead_id             : String   — auto-generated
├── campaign_id         : String   — FK → campaigns
├── business_id         : String   — FK → businesses (for admin queries)
├── customer_name       : String   — from CSV
├── phone_number        : String   — E.164 format (+919876543210)
├── email               : String   — optional from CSV
├── call_status         : String   — "pending" | "calling" | "completed" | "failed" | "retry_queued"
├── attempt_count       : Number   — default: 0
├── twilio_call_sid     : String   — set on call initiation
├── recording_url       : String   — set post-call
├── transcript          : String   — full conversation text
├── extracted_data      : Map
│   ├── name            : String
│   ├── interest_level  : String   — "High" | "Medium" | "Low"
│   ├── intent          : String   — "INTERESTED" | "NOT_INTERESTED" | "CALLBACK"
│   ├── summary         : String
│   └── next_action     : String
├── call_duration_sec   : Number
├── called_at           : Timestamp
└── completed_at        : Timestamp
```

---

### Collection: `platform_stats` (Admin read-only aggregates)

```
platform_stats/global
├── total_businesses    : Number
├── total_campaigns     : Number
├── total_calls_made    : Number
├── total_leads_qualified: Number
└── last_updated        : Timestamp
```

---

### Firestore Security Rules

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    function isAdmin() {
      return request.auth.token.admin == true;
    }

    function isOwner(business_id) {
      return request.auth.uid == business_id;
    }

    match /businesses/{business_id} {
      allow read, write: if isAdmin() || isOwner(business_id);
    }

    match /campaigns/{campaign_id} {
      allow read, write: if isAdmin() ||
        isOwner(resource.data.business_id);
      allow create: if isOwner(request.resource.data.business_id);
    }

    match /leads/{lead_id} {
      allow read, write: if isAdmin() ||
        isOwner(resource.data.business_id);
      allow create: if isOwner(request.resource.data.business_id);
    }

    match /platform_stats/{doc} {
      allow read: if isAdmin();
      allow write: if false; // backend-only via Admin SDK
    }
  }
}
```

---

## 6. AUTHENTICATION & AUTHORIZATION

### Flow: OAuth2 via Google (Firebase Auth)

```
User clicks "Sign in with Google"
        ↓
Firebase Auth → Google OAuth2 consent screen
        ↓
Firebase issues ID Token (JWT)
        ↓
Frontend sends ID Token in every API request:
  Authorization: Bearer <firebase_id_token>
        ↓
Backend middleware: admin.auth().verifyIdToken(token)
        ↓
Decoded token → check custom claims
  → { admin: true }  → admin routes
  → { admin: false } → user routes filtered by uid
```

### Setting Admin Custom Claim (one-time CLI)

```javascript
// scripts/set-admin.js
const admin = require('firebase-admin');
admin.initializeApp();
admin.auth().setCustomUserClaims('ADMIN_UID_HERE', { admin: true });
```

### Auth Middleware (backend)

```javascript
// middleware/verifyToken.js
const verifyToken = async (req, res, next) => {
  const token = req.headers.authorization?.split('Bearer ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    req.user = await admin.auth().verifyIdToken(token);
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
};
```

---

## 7. TELEPHONY BRIDGE — TWILIO ↔ GEMINI LIVE

### Step-by-Step Call Execution

#### Step 1 — Initiate Call (Twilio REST)

```javascript
// CallOrchestratorModule
const call = await twilioClient.calls.create({
  to: lead.phone_number,           // E.164 format
  from: process.env.TWILIO_NUMBER, // Your Twilio number
  url: `${BACKEND_URL}/twilio/twiml/${lead.lead_id}`, // TwiML webhook
  statusCallback: `${BACKEND_URL}/twilio/status/${lead.lead_id}`,
  statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
  record: true,
  recordingStatusCallback: `${BACKEND_URL}/twilio/recording/${lead.lead_id}`
});
await updateLeadStatus(lead.lead_id, 'calling', { twilio_call_sid: call.sid });
```

#### Step 2 — TwiML Response (Opens Media Stream)

```javascript
// TwilioWebhookModule — GET /twilio/twiml/:lead_id
app.get('/twilio/twiml/:lead_id', (req, res) => {
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
  <Response>
    <Connect>
      <Stream url="wss://${req.headers.host}/media-stream/${req.params.lead_id}">
        <Parameter name="lead_id" value="${req.params.lead_id}"/>
      </Stream>
    </Connect>
  </Response>`;
  res.type('text/xml').send(twiml);
});
```

#### Step 3 — WebSocket Bridge (Core)

```
                    ┌──────────────────────────────────┐
                    │     GeminiLiveBridgeModule        │
                    │                                   │
Twilio WS ─── μ-law audio ──→ decode to PCM16 ──────→ Gemini Live WS
                    │                                   │
Twilio WS ←── μ-law audio ←── encode from PCM16 ←──── Gemini Live WS
                    │                                   │
                    │  On Gemini function_call:         │
                    │    → DataExtractionModule         │
                    │  On Gemini text chunk:            │
                    │    → TranscriptModule (append)    │
                    └──────────────────────────────────┘
```

```javascript
// GeminiLiveBridgeModule — simplified core logic
wss.on('connection', async (twilioWs, req) => {
  const leadId = extractLeadId(req.url);
  const { systemPrompt } = await buildPrompt(leadId); // PromptBuilderModule

  // Connect to Gemini Live
  const geminiSession = await vertexAI.preview.getGenerativeModel({
    model: 'gemini-live-2.5-flash-native-audio',
  }).startChat({ /* config */ });

  let transcript = '';

  twilioWs.on('message', async (msg) => {
    const data = JSON.parse(msg);
    if (data.event === 'start') {
      // Send initial system prompt to Gemini
      await geminiSession.sendMessage([{ text: systemPrompt }]);
    }
    if (data.event === 'media') {
      // Forward audio: μ-law → PCM16 → Gemini
      const pcm = mulawToPcm16(Buffer.from(data.media.payload, 'base64'));
      await geminiSession.sendRealtimeInput({ audio: pcm });
    }
    if (data.event === 'stop') {
      await finalizeCall(leadId, transcript);
    }
  });

  // Receive from Gemini → forward to Twilio
  geminiSession.on('content', (chunk) => {
    if (chunk.audio) {
      const mulaw = pcm16ToMulaw(chunk.audio);
      twilioWs.send(JSON.stringify({
        event: 'media',
        streamSid: currentStreamSid,
        media: { payload: mulaw.toString('base64') }
      }));
    }
    if (chunk.text) transcript += chunk.text;
    if (chunk.functionCall?.name === 'log_call_outcome') {
      DataExtractionModule.process(leadId, chunk.functionCall.args);
    }
  });
});
```

### Gemini Live — Function Declaration for Data Extraction

```javascript
const callOutcomeTool = {
  function_declarations: [{
    name: 'log_call_outcome',
    description: 'Log the outcome of the call after conversation ends.',
    parameters: {
      type: 'object',
      properties: {
        name:           { type: 'string', description: 'Customer name extracted from conversation' },
        interest_level: { type: 'string', enum: ['High', 'Medium', 'Low'] },
        intent:         { type: 'string', enum: ['INTERESTED', 'NOT_INTERESTED', 'CALLBACK'] },
        summary:        { type: 'string', description: 'Brief summary of conversation' },
        next_action:    { type: 'string', description: 'What should happen next' }
      },
      required: ['interest_level', 'intent', 'summary']
    }
  }]
};
```

---

## 8. AI AGENT SYSTEM PROMPT — REVIEWED

> **Reviewer Notes:** The draft is structurally sound. Issues: (1) Output JSON block at the bottom leaks internal structure to the model unnecessarily — replaced with function_call declaration. (2) "Simulate sending a message" is ambiguous — clarified as actual Twilio SMS trigger via function. (3) Fillers section is good but needs a "DO NOT use these more than once per call" constraint to prevent robotic repetition.

### Finalized System Prompt Template

```
You are Veda, a professional AI voice agent for {business_name}.

## YOUR IDENTITY
You are calling on behalf of {business_name}, a {business_type} company.
Your name is Veda. You are friendly, natural, and human-like — not robotic.

## BUSINESS CONTEXT
- Product/Service: {product_description}
- Campaign Goal: {campaign_goal}
- Target Audience: {target_audience}
- Key Details: {key_details}

## CONVERSATION STRUCTURE
Follow this flow naturally — do not announce steps:

1. GREET: Use the customer's name ({customer_name}). Introduce yourself and {business_name} briefly.
   Example: "Hi {customer_name}, this is Veda calling from {business_name}. Is this a good time to chat for 2 minutes?"

2. ENGAGE: Ask 1 qualifying question relevant to {campaign_goal}.
   Listen carefully. Mirror their energy.

3. PRESENT: Share the value of {product_description} naturally.
   Tie it to what they just said. No reading from a list.

4. HANDLE OBJECTIONS:
   - Price concern → acknowledge, pivot to value and ROI
   - Not interested → ask why briefly, respect the answer, close warmly
   - Busy right now → offer a specific callback time

5. QUALIFY: By end of conversation, you must know:
   - Their interest level
   - Their intent (proceed / not now / callback)

6. CLOSE: Based on intent:
   - INTERESTED → confirm next step clearly
   - CALLBACK → confirm exact time, say you will reach out
   - NOT INTERESTED → close with warmth: "No problem at all, have a great day!"

## BEHAVIOR RULES
- Max 2–3 sentences per turn. Never monologue.
- Use natural fillers ONCE per call maximum: "Sure, give me just a second..." or "That's a great question —"
- Never repeat the same phrase twice in one call.
- If you don't know something: "Let me have our specialist follow up on that — they'll have the exact details."
- Handle interruptions: stop speaking immediately, listen, respond to what was said.

## CALL TERMINATION
When the conversation reaches a natural close, call the function `log_call_outcome` with the extracted data.
Do not announce this to the customer.
```

---

## 9. API CONTRACT REFERENCE

### REST Endpoints (Backend — Express)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/auth/profile` | User | Create/update business profile |
| `GET` | `/api/campaigns` | User | List campaigns for authenticated business |
| `POST` | `/api/campaigns` | User | Create new campaign |
| `PATCH` | `/api/campaigns/:id` | User | Update campaign (status, details) |
| `POST` | `/api/campaigns/:id/upload` | User | Upload CSV, parse leads, write to Firestore |
| `POST` | `/api/campaigns/:id/start` | User | Set status to `active`, trigger orchestrator |
| `GET` | `/api/campaigns/:id/leads` | User | List leads for a campaign |
| `GET` | `/api/campaigns/:id/analytics` | User | Campaign-level metrics |
| `GET` | `/api/admin/businesses` | Admin | List all businesses |
| `GET` | `/api/admin/businesses/:id` | Admin | Business detail + campaigns |
| `GET` | `/api/admin/campaigns/:id` | Admin | Campaign detail + all leads |
| `GET` | `/api/admin/stats` | Admin | Platform-wide aggregates |
| `GET` | `/twilio/twiml/:lead_id` | None (Twilio) | Returns TwiML with Media Stream |
| `POST` | `/twilio/status/:lead_id` | None (Twilio) | Call status callback |
| `POST` | `/twilio/recording/:lead_id` | None (Twilio) | Recording ready callback |
| `WS` | `/media-stream/:lead_id` | None (Twilio) | WebSocket — audio bridge |

### CSV Upload Format (Lead Ingestion)

```csv
customer_name,phone_number,email
Rahul Mehta,+919876543210,rahul@example.com
Priya Sharma,+918765432109,priya@example.com
```

**Validation rules:**
- `phone_number` MUST be E.164 format — reject row if not
- `customer_name` — required
- `email` — optional
- Max 500 rows per upload (MVP limit)
- Duplicate phone numbers within campaign → skip with warning

---

## 10. ENVIRONMENT VARIABLES & SECRETS

### `.env.local` (Local Development — never commit)

```env
# GCP
GOOGLE_CLOUD_PROJECT=veda-tele-agent
GOOGLE_APPLICATION_CREDENTIALS=./service-account-key.json  # ADC fallback
VERTEX_AI_LOCATION=us-central1

# Gemini
GEMINI_MODEL=gemini-live-2.5-flash-native-audio

# Twilio
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_NUMBER=+1XXXXXXXXXX

# Firebase Admin
FIREBASE_PROJECT_ID=veda-tele-agent
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxx@veda-tele-agent.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"

# App
PORT=8080
BACKEND_URL=https://veda-backend-xxxx-uc.a.run.app  # update after deploy
NODE_ENV=development
```

### Secret Manager Setup (Production)

```bash
# Store secrets
echo -n "$TWILIO_ACCOUNT_SID" | gcloud secrets create TWILIO_ACCOUNT_SID \
  --data-file=- --project=veda-tele-agent

echo -n "$TWILIO_AUTH_TOKEN" | gcloud secrets create TWILIO_AUTH_TOKEN \
  --data-file=- --project=veda-tele-agent

echo -n "$FIREBASE_PRIVATE_KEY" | gcloud secrets create FIREBASE_PRIVATE_KEY \
  --data-file=- --project=veda-tele-agent
```

### Cloud Run — Secret Injection

```yaml
# In cloudbuild.yaml deploy step:
--set-secrets=TWILIO_ACCOUNT_SID=TWILIO_ACCOUNT_SID:latest,\
              TWILIO_AUTH_TOKEN=TWILIO_AUTH_TOKEN:latest,\
              FIREBASE_PRIVATE_KEY=FIREBASE_PRIVATE_KEY:latest
```

---

## 11. LOCAL DEV — GCP ADC SETUP

```bash
# From project root — authenticate with your GCP account
gcloud auth application-default login

# Set project
gcloud config set project veda-tele-agent

# Verify ADC is working
gcloud auth application-default print-access-token
```

**Code note:** In Node.js, when `GOOGLE_APPLICATION_CREDENTIALS` is not set and ADC is active, the Vertex AI and Firestore clients auto-discover credentials:

```javascript
// This works automatically with ADC locally AND with Cloud Run's service account in prod
const { VertexAI } = require('@google-cloud/vertexai');
const vertexAI = new VertexAI({
  project: process.env.GOOGLE_CLOUD_PROJECT,
  location: process.env.VERTEX_AI_LOCATION
});
// No explicit credentials needed — ADC handles local, SA handles Cloud Run
```

**For Twilio local testing:** use [ngrok](https://ngrok.com) to expose your local WebSocket server:
```bash
ngrok http 8080
# Then set BACKEND_URL=https://xxxx.ngrok.io in .env.local
```

---

## 12. CI/CD PIPELINE

### GitHub Actions Workflow (`.github/workflows/deploy.yml`)

```yaml
name: Build and Deploy — Veda-Tele-Agent

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

env:
  PROJECT_ID: veda-tele-agent
  REGION: us-central1
  REPO: veda-repo
  SERVICE_BACKEND: veda-backend
  IMAGE: us-central1-docker.pkg.dev/veda-tele-agent/veda-repo/veda-backend

jobs:
  test:
    name: Run Tests
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: backend/package-lock.json
      - run: cd backend && npm ci
      - run: cd backend && npm test

  build-and-deploy:
    name: Build Docker Image & Deploy to Cloud Run
    needs: test
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'

    permissions:
      contents: read
      id-token: write  # For Workload Identity Federation

    steps:
      - uses: actions/checkout@v4

      - name: Authenticate to GCP (Workload Identity)
        uses: google-github-actions/auth@v2
        with:
          workload_identity_provider: ${{ secrets.WIF_PROVIDER }}
          service_account: ${{ secrets.WIF_SERVICE_ACCOUNT }}

      - name: Set up Cloud SDK
        uses: google-github-actions/setup-gcloud@v2

      - name: Configure Docker for Artifact Registry
        run: gcloud auth configure-docker ${{ env.REGION }}-docker.pkg.dev --quiet

      - name: Build Docker Image
        run: |
          docker build \
            --tag ${{ env.IMAGE }}:${{ github.sha }} \
            --tag ${{ env.IMAGE }}:latest \
            --file backend/Dockerfile \
            ./backend

      - name: Push to Artifact Registry
        run: |
          docker push ${{ env.IMAGE }}:${{ github.sha }}
          docker push ${{ env.IMAGE }}:latest

      - name: Deploy to Cloud Run
        run: |
          gcloud run deploy ${{ env.SERVICE_BACKEND }} \
            --image ${{ env.IMAGE }}:${{ github.sha }} \
            --region ${{ env.REGION }} \
            --platform managed \
            --allow-unauthenticated \
            --port 8080 \
            --memory 1Gi \
            --cpu 2 \
            --concurrency 80 \
            --min-instances 1 \
            --max-instances 10 \
            --set-env-vars GOOGLE_CLOUD_PROJECT=${{ env.PROJECT_ID }},VERTEX_AI_LOCATION=${{ env.REGION }},NODE_ENV=production \
            --set-secrets \
              TWILIO_ACCOUNT_SID=TWILIO_ACCOUNT_SID:latest,\
              TWILIO_AUTH_TOKEN=TWILIO_AUTH_TOKEN:latest,\
              TWILIO_NUMBER=TWILIO_NUMBER:latest,\
              FIREBASE_PRIVATE_KEY=FIREBASE_PRIVATE_KEY:latest,\
              FIREBASE_CLIENT_EMAIL=FIREBASE_CLIENT_EMAIL:latest \
            --project ${{ env.PROJECT_ID }}

      - name: Output Service URL
        run: |
          gcloud run services describe ${{ env.SERVICE_BACKEND }} \
            --region ${{ env.REGION }} \
            --format 'value(status.url)'
```

### GitHub Secrets Required

```
WIF_PROVIDER          — Workload Identity Federation provider resource name
WIF_SERVICE_ACCOUNT   — SA email with Cloud Run + Artifact Registry permissions
TWILIO_ACCOUNT_SID    — (used to set Secret Manager, then referenced via --set-secrets)
TWILIO_AUTH_TOKEN
TWILIO_NUMBER
FIREBASE_PRIVATE_KEY
FIREBASE_CLIENT_EMAIL
```

---

## 13. DOCKERIZATION

### `backend/Dockerfile`

```dockerfile
# Stage 1: Build
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .

# Stage 2: Runtime
FROM node:20-alpine AS runner
WORKDIR /app

# Create non-root user
RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nodeuser

COPY --from=builder --chown=nodeuser:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nodeuser:nodejs /app ./

USER nodeuser

EXPOSE 8080

ENV NODE_ENV=production
ENV PORT=8080

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost:8080/health || exit 1

CMD ["node", "src/index.js"]
```

### `backend/.dockerignore`

```
node_modules
.env*
*.md
.git
.github
service-account-key.json
coverage
*.test.js
```

### `docker-compose.yml` (Local Dev)

```yaml
version: '3.9'
services:
  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    ports:
      - "8080:8080"
    environment:
      - NODE_ENV=development
      - GOOGLE_CLOUD_PROJECT=veda-tele-agent
      - GOOGLE_APPLICATION_CREDENTIALS=/app/service-account-key.json
      - PORT=8080
    volumes:
      - ./service-account-key.json:/app/service-account-key.json:ro
      - ./backend/src:/app/src  # hot reload in dev
    command: ["node", "--watch", "src/index.js"]

  # Firestore emulator for local testing
  firestore-emulator:
    image: gcr.io/google.com/cloudsdktool/google-cloud-cli:emulators
    command: gcloud emulators firestore start --host-port=0.0.0.0:8090
    ports:
      - "8090:8090"
```

---

## 14. DEPLOYMENT — CLOUD RUN

### Service Account Permissions (IAM)

```bash
# Create dedicated service account for Cloud Run
gcloud iam service-accounts create veda-backend-sa \
  --display-name="Veda Backend Service Account" \
  --project=veda-tele-agent

SA_EMAIL="veda-backend-sa@veda-tele-agent.iam.gserviceaccount.com"

# Grant required roles
gcloud projects add-iam-policy-binding veda-tele-agent \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/aiplatform.user"

gcloud projects add-iam-policy-binding veda-tele-agent \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/datastore.user"

gcloud projects add-iam-policy-binding veda-tele-agent \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/secretmanager.secretAccessor"

gcloud projects add-iam-policy-binding veda-tele-agent \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/storage.objectAdmin"

# Assign SA to Cloud Run service
gcloud run services update veda-backend \
  --service-account=${SA_EMAIL} \
  --region=us-central1
```

### WebSocket Support on Cloud Run

Cloud Run natively supports WebSockets. Ensure:
- `--timeout=3600` (1 hour max — matches max call duration)
- `--concurrency=80` — each WS connection holds one goroutine

```bash
gcloud run services update veda-backend \
  --timeout=3600 \
  --region=us-central1
```

---

## 15. UI DESIGN SYSTEM

**Design Language:** Glassmorphism — 70% Solid + 30% Glass  
**Rule:** Only 4 components use glass: Navbar, Live Call Panel, AI Insights Panel, Floating Action Button

### Design Tokens

```css
:root {
  --color-primary:    #22c55e;     /* Green — CTAs, active states */
  --color-accent:     #3b82f6;     /* Blue — links, secondary actions */
  --color-bg:         #f1f5f9;     /* Light grey page background */
  --color-surface:    #ffffff;     /* Card/panel background */
  --color-text:       #1e293b;     /* Primary text */
  --color-muted:      #64748b;     /* Secondary text */

  /* Glass */
  --glass-bg:         rgba(255, 255, 255, 0.6);
  --glass-border:     rgba(255, 255, 255, 0.3);
  --glass-blur:       blur(12px);

  /* Shadows */
  --shadow-soft:      0 8px 32px rgba(0, 0, 0, 0.05);
  --shadow-medium:    0 4px 16px rgba(0, 0, 0, 0.08);

  /* Transitions */
  --transition:       0.2s ease;

  /* Border radius */
  --radius-sm:        8px;
  --radius-md:        16px;
  --radius-lg:        24px;
}

.glass {
  background: var(--glass-bg);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-soft);
}
```

### Page Structure

```
┌──────────────────────────── GLASS NAVBAR ────────────────────────────┐
│  🤖 Veda  [Search...]                    [🔔] [Campaign ▾] [Avatar]   │
└──────────────────────────────────────────────────────────────────────┘
┌──────────┐ ┌──────────────────────────────────────────────────────────┐
│  SIDEBAR │ │  MAIN CONTENT AREA                                        │
│  (icons) │ │  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐                   │
│  📊      │ │  │Calls │ │Conv% │ │Leads │ │Active│  ← SOLID CARDS     │
│  📞      │ │  │ 142  │ │ 38%  │ │  54  │ │  3   │                    │
│  👥      │ │  └──────┘ └──────┘ └──────┘ └──────┘                   │
│  ⚙️      │ │                                                           │
│          │ │  ┌─────────────────────────┐ ┌────────────────────────┐ │
│          │ │  │  🎤 LIVE CALL PANEL      │ │  💡 AI INSIGHTS        │ │
│          │ │  │       (GLASS) 🔥        │ │       (GLASS)          │ │
│          │ │  │  ● Calling: Rahul Mehta │ │  Sentiment: Positive   │ │
│          │ │  │  ~~~ wave animation ~~~ │ │  Lead Score: 8.2/10    │ │
│          │ │  │  [Live transcript...]   │ │  Intent: INTERESTED    │ │
│          │ │  └─────────────────────────┘ └────────────────────────┘ │
└──────────┘ └──────────────────────────────────────────────────────────┘
                                            ┌────────────────────────────┐
                                            │  Floating AI Button (glass)│
                                            │  [🤖] pulsing green glow   │
                                            └────────────────────────────┘
```

---

## 16. FUNCTIONAL REQUIREMENTS (P0/P1/P2)

### P0 — Launch Blockers

| ID | Requirement |
|----|-------------|
| F-01 | User SHALL be able to sign in via Google OAuth2 and create a business profile |
| F-02 | User SHALL be able to create a campaign with name, purpose, and script guidelines |
| F-03 | User SHALL be able to upload a CSV of up to 500 contacts with phone + name |
| F-04 | System SHALL validate phone numbers to E.164 format before accepting CSV |
| F-05 | System SHALL initiate outbound Twilio calls for all leads in an active campaign |
| F-06 | System SHALL open a Twilio Media Stream WebSocket for each answered call |
| F-07 | System SHALL connect the audio stream bidirectionally to Gemini Live |
| F-08 | System SHALL inject business context + campaign + customer name into AI prompt |
| F-09 | System SHALL capture the Gemini `log_call_outcome` function call and write to Firestore |
| F-10 | System SHALL update lead `call_status` to `completed` or `failed` after each call |
| F-11 | Business user dashboard SHALL display call statuses and extracted lead data |
| F-12 | Admin SHALL be able to view all businesses and their campaigns |

### P1 — Important

| ID | Requirement |
|----|-------------|
| F-13 | System SHALL implement retry logic — failed/unanswered calls queued for 1 retry |
| F-14 | System SHALL capture full conversation transcript from Gemini text stream |
| F-15 | System SHALL store Twilio recording URL to each lead's Firestore document |
| F-16 | Campaign dashboard SHALL display conversion rate (INTERESTED / total called) |
| F-17 | System SHALL send a Twilio SMS follow-up when intent = CALLBACK |
| F-18 | Admin SHALL be able to drill down to individual call transcripts |

### P2 — Nice to Have

| ID | Requirement |
|----|-------------|
| F-19 | Multi-language support (Hindi as secondary language) |
| F-20 | Campaign scheduling (start at specific date/time) |
| F-21 | Gamified agent dashboard — conversion leaderboard |
| F-22 | CSV export of all lead outcomes for a campaign |

---

## 17. NON-FUNCTIONAL REQUIREMENTS

| Category | Requirement |
|----------|------------|
| **Latency** | Audio round-trip (Twilio → Gemini → Twilio) < 800ms p95 |
| **Availability** | Backend uptime ≥ 99.5% (Cloud Run SLA) |
| **Concurrency** | Support ≥ 10 simultaneous active calls at MVP |
| **Security** | All API routes protected by Firebase ID token verification |
| **Security** | No credentials in source code — all via Secret Manager or ADC |
| **Security** | Firestore rules enforce business_id isolation |
| **Scalability** | Cloud Run auto-scales to 10 instances; each handles ~8 concurrent WS |
| **Data Retention** | Transcripts and recordings retained for 90 days (MVP) |
| **Compliance** | TRAI DND registry check DEFERRED (post-MVP — [OPEN QUESTION]) |

---

## 18. RISK REGISTER

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Gemini Live WebSocket instability during long calls | Med | High | Implement reconnect logic with exponential backoff; store partial transcript |
| Twilio WebSocket and Gemini Live audio codec mismatch (μ-law vs PCM16) | Med | High | Use `mulaw` npm package; test codec conversion in unit tests before integration |
| Cloud Run WebSocket timeout (default 60s request timeout) | High | High | Set `--timeout=3600` on deploy; document in runbook |
| TRAI DND regulations blocking outbound calls in India | High | High | Add disclaimer to UI; defer compliance module; test with whitelisted numbers only |
| Gemini Live 2.5 Flash Native Audio API not yet GA | Med | High | Verify Vertex AI preview access on `veda-tele-agent` project before build |
| CSV with malformed phone numbers causing call failures | High | Med | Strict E.164 validation at upload; reject and report invalid rows |
| Multi-tenant data leak via Firestore misconfiguration | Low | Critical | Security rules tested with Firebase emulator before deploy |
| Twilio trial account limitations (can only call verified numbers) | High | Med | Upgrade to paid Twilio account; verify test numbers upfront |

---

## 19. MODULE GENERATION PROMPT FOR OPUS 4.6

Use this prompt to generate each `MOD-XX.md` file. Replace `{MODULE_ID}`, `{MODULE_NAME}`, and `{MODULE_DESCRIPTION}` for each module.

---

```
You are a senior software architect generating a precise, implementation-ready module specification for a production Node.js backend.

## PROJECT CONTEXT
- Product: Veda-Tele-Agent — AI Outbound Tele-Calling SaaS
- GCP Project: veda-tele-agent
- Runtime: Node.js 20 LTS + Express 4 + ws (WebSocket)
- Database: Google Cloud Firestore (Native Mode), multi-tenant, business_id isolation
- AI: Gemini Live 2.5 Flash Native Audio via Vertex AI
- Telephony: Twilio Voice API + Media Streams WebSocket
- Auth: Firebase Auth + OAuth2 (Google), custom claims { admin: true/false }
- Deployment: Cloud Run (containerized via Docker, CI/CD via GitHub Actions)
- Local Dev: GCP Application Default Credentials (ADC) from project root
- Production: Cloud Run uses Service Account credentials directly (no key file)
- Secrets: Secret Manager in prod; .env.local locally

## MODULE TO SPECIFY
Module ID: {MODULE_ID}
Module Name: {MODULE_NAME}
Module Description: {MODULE_DESCRIPTION}

## OUTPUT FORMAT — STRICT 17-SECTION STRUCTURE

Generate the full MODULE.md following EXACTLY this structure:

### 1. MODULE OVERVIEW
- Purpose in one sentence
- Where it fits in the system pipeline
- Dependencies: which other modules it consumes or produces for

### 2. FILE STRUCTURE
- Exact file paths relative to `backend/src/`
- One-line description per file

### 3. DEPENDENCIES (npm packages)
- Package name, version, and why it's used

### 4. ENVIRONMENT VARIABLES CONSUMED
- Variable name, source (Secret Manager / .env), and purpose

### 5. FIRESTORE COLLECTIONS ACCESSED
- Collection name, operation (read/write/listen), and what fields are used

### 6. API ENDPOINTS EXPOSED (if any)
- Method, path, auth requirement, request body schema, response schema
- Use JSON Schema format for bodies

### 7. EVENTS / WEBSOCKET MESSAGES HANDLED (if any)
- Event name, direction (inbound/outbound), payload schema

### 8. CORE LOGIC — STEP BY STEP
- Numbered pseudocode/prose steps covering the full execution path
- Cover happy path AND failure paths
- Be specific enough that a developer can code directly from this

### 9. FUNCTION SIGNATURES
- All exported functions with full TypeScript-style signatures
- Input params, return types, and a one-line description

### 10. ERROR HANDLING STRATEGY
- What errors can occur and how each is caught
- What is logged vs returned vs retried

### 11. RETRY / RESILIENCE LOGIC (if applicable)
- When retries trigger, max attempts, backoff strategy

### 12. SECURITY CONSIDERATIONS
- Auth checks performed
- Data validation rules
- What must NOT be accessible without authentication

### 13. TESTING STRATEGY
- Unit tests: what to mock, what to assert
- Integration tests: what Firestore/Twilio/Gemini behaviors to test
- Edge cases to cover explicitly

### 14. INTER-MODULE CONTRACTS
- What data this module expects from upstream modules (exact shape)
- What data this module passes to downstream modules (exact shape)

### 15. CONFIGURATION CONSTANTS
- Hardcoded values that might need tuning (e.g., retry limits, timeouts)
- Where they live in code

### 16. KNOWN LIMITATIONS / DEFERRED WORK
- What is intentionally out of scope for MVP
- What technical debt is being accepted

### 17. IMPLEMENTATION CHECKLIST
- Ordered checklist of tasks to implement this module from scratch
- Checkboxes format: [ ] Task description

---

Generate the full specification now. Do not omit any section. If a section is not applicable, write "N/A — [one sentence reason]." Be precise, implementation-ready, and assume the developer has the PRS.md as their reference.
```

---

### How to Use This Prompt with Opus 4.6

Invoke it for each module ID from the registry:

| Invocation | Module |
|-----------|--------|
| Replace with MOD-01, AuthModule | Firebase token verification, admin claims, middleware |
| Replace with MOD-05, CallOrchestratorModule | Twilio call initiation, campaign queue, retry |
| Replace with MOD-07, GeminiLiveBridgeModule | Core WebSocket bridge — highest complexity |
| Replace with MOD-08, PromptBuilderModule | Dynamic system prompt assembly |
| Replace with MOD-09, DataExtractionModule | Function call parsing, Firestore write |

**Priority order for 24hr hackathon:**
`MOD-07 → MOD-05 → MOD-08 → MOD-09 → MOD-01 → MOD-03 → MOD-04 → MOD-15`

---

*End of PRS.md — Veda-Tele-Agent v1.0*
*Build fast. Build real. Ship by morning.*
