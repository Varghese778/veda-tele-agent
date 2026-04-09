# Implementation Deep-Dive
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

This document provides a technical explanation of how Veda-Tele-Agent was built, focusing on the specialized engineering challenges encountered.

## 🌉 The "Bridge" Architecture (MOD-07)

The core innovation of Veda is the **Real-Time Voice Bridge**. Traditional AI voice systems often rely on high-level APIs with significant latency. Veda utilizes Twilio's **Media Streams** to pipe raw 8-bit, 8kHz u-law audio directly into our Node.js runtime.

### Audio Transcoding
Because Twilio and Gemini speak different "audio languages," the bridge performs manual transcoding:
- **Upstream**: 8kHz G.711 u-law (Twilio) -> Linear16 PCM 16kHz (Gemini). We achieve this by converting u-law bytes to signed integers and performing linear interpolation to double the sample rate.
- **Downstream**: Linear16 PCM 24kHz (Gemini) -> 8kHz G.711 u-law (Twilio). This involves decimation (removing samples) and µ-law compression.

## 🤖 The Prompt Builder (MOD-08)

To ensure the AI maintains a consistent and professional persona, the **PromptBuilder** assembles a system instruction in real-time. It performs parallel Firestore lookups for:
1.  **Business Profile**: For branding and industry context.
2.  **Campaign Metadata**: For the specific script and objective.
3.  **Lead Details**: To personalize the greeting and reference lead-specific data points.

## 🔐 Multi-Tenancy & Security

Multi-tenancy is enforced at the database layer via **Business ID Isolation**.
- Every document in the `campaigns`, `leads`, and `transcripts` collections is indexed by a `business_id`.
- Handlers in the `api.js` (frontend) and `verifyToken` (backend) ensure that tokens only grant access to data where `token.uid == doc.business_id`.

## 📈 Aggregation & Caching (MOD-12)

The dashboard provides real-time analytics. To prevent O(N) Firestore read costs on every page load, we use an **In-Memory TTL Cache**:
- Analytics summaries are computed and stored for 30 seconds.
- Concurrent requests for the same campaign dashboard hit the cache, drastically reducing Firebase billing costs and improving UI responsiveness.

## 🐳 Containerization Strategy

The system is containerized using a **Multi-Stage Dockerfile**.
- **Stage 1 (Builder)**: Installs all dependencies and removes development tools.
- **Stage 2 (Runtime)**: Copies only the essential production artifacts into a slim Node.js 20 environment, minimizing the image size to <100MB fior fast deployment on Cloud Run.
