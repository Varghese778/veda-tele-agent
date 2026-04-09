# Veda-Tele-Agent Manifest & Requirements
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

# Runtime Ecosystem
Node.js >= 20.x
npm >= 10.x

# Core External Services
Google Cloud Platform (GCP)
  - Firebase Auth (Google Provider)
  - Firestore (Native Mode)
  - Vertex AI (Gemini 1.5 Flash / Live)
Twilio
  - Programmable Voice (Media Streams)
  - Programmable SMS (Follow-ups)

# Backend Dependencies (Core)
express        # Web framework
ws             # Real-time media streaming
twilio         # Telephony integration
firebase-admin # Database & Auth management
alawmulaw      # Audio transcoding (G.711 <-> Linear16)
joi            # Schema validation
multer         # CSV file uploads (Multipart)
csv-parse      # Streaming lead ingestion

# Frontend Dependencies
Firebase Web SDK v10 (Modular ES Modules)
Vanilla JS (Minimal footprint)

# Infrastructure Requirements
Docker >= 24.0
Docker Compose >= 2.20
Cloud Run (Service Runtime)
- Recommended: 1GiB RAM, 1-2 vCPU

# Credential Requirements
GCP Service Account (JSON or ADC) with:
  - roles/datastore.user
  - roles/aiplatform.user
Twilio API Key:
  - Account SID
  - Auth Token
  - Verifed Phone Number
