# MOD-11 — RecordingModule

### 1. MODULE OVERVIEW
- Purpose: Handles the Twilio recording ready callback, fetches the recording metadata, and stores the recording URL to Firestore.
- Position in the system pipeline: Asynchronous post-call processing handling telephony artifacts.
- Upstream dependencies: TwilioWebhookModule (forwards the recording request payload).
- Downstream dependents: FrontendModule (displays the audio file playback link).

### 2. FILE STRUCTURE
- `backend/src/services/recording.service.js`: Contains `handleRecordingCallback`.
- `backend/src/routes/recording.routes.js`: Defines `/api/campaigns/:campaign_id/leads/:id/recording` proxy.
- `backend/src/controllers/recording.controller.js`: Processes proxy logic bridging Twilio's HTTP basic auth.

### 3. NPM DEPENDENCIES
- `axios` or `node-fetch`: To natively proxy the audio MP3 file down to the frontend, attaching Twilio HTTP Basic Auth credentials securely on the backend.

### 4. ENVIRONMENT VARIABLES CONSUMED
- `TWILIO_ACCOUNT_SID` | Secret | Required for Twilio Basic Auth.
- `TWILIO_AUTH_TOKEN` | Secret | Required for Twilio Basic Auth.

### 5. FIRESTORE COLLECTIONS ACCESSED
- `leads` | update | Patches `leads/{leadId}` with `recording_url` and `call_duration_sec`.

### 6. API ENDPOINTS EXPOSED
- `GET` | `/api/campaigns/:campaign_id/leads/:id/recording` | Auth: User
  - Request Body: None
  - Response Schema: Acts as an audio buffer proxy streaming `audio/mpeg` explicitly from Twilio to the browser to hide Twilio credentials.

### 7. WEBSOCKET / EVENT MESSAGES
**N/A**

### 8. CORE LOGIC — STEP BY STEP
1. Receiving Callback: Twilio invokes the `POST /twilio/recording/:lead_id` mapped via `TwilioWebhookModule` passing the payload.
2. The controller extracts `RecordingSid`, `RecordingUrl`, `RecordingDuration`, and `CallSid`.
3. Validation check: If `RecordingDuration = 0` or variables are missing, log a warning and skip the Firestore write (do not return a 500 to Twilio; return 200 OK cleanly).
4. Update `leads/{leadId}` explicitly adding `recording_url: \`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Recordings/${RecordingSid}.mp3\``. Note the `.mp3` appendage for direct playback format mapping.
5. Set `call_duration_sec: parseInt(RecordingDuration, 10)`.
6. Proxy Playback logic: Frontend dashboard audio players hit `GET /api/campaigns/:campaign_id/leads/:id/recording`.
7. `RecordingController` verifies the Business user owns the campaign and lead.
8. It opens an Axios stream to the stored `recording_url` passing `Authorization: Basic ${base64(SID:TOKEN)}`.
9. It pipes the resulting `audio/mpeg` stream response directly out to the frontend response object.

### 9. EXPORTED FUNCTION SIGNATURES
```typescript
export const handleRecordingCallback: (leadId: string, payload: Record<string, string>) => Promise<void>;
export const proxyRecordingStreaming: (req: Request, res: Response) => Promise<void>;
```

### 10. ERROR HANDLING STRATEGY
- **Twilio Callback Fails**: Missing parameters are gracefully caught, logged, and a 200 is issued so Twilio does not retry the webhook aggressively.
- **Proxy Stream Error**: If the Twilio API returns a 404 for the recording, the proxy returns a `404 Not Found` JSON structure instead of crashing the pipe.

### 11. RETRY & RESILIENCE
**N/A** — Twilio manages webhook retry configurations natively if the server goes offline during the callback.

### 12. SECURITY CONSIDERATIONS
- Raw Twilio URLs require HTTP Basic Auth to download. By storing the URL but forcing the frontend to read through a proxy endpoint, we isolate the `TWILIO_AUTH_TOKEN` strictly to the backend without expiring JWTs or signing complex temporary URLs.

### 13. TESTING STRATEGY
- Unit tests: Verify `.mp3` gets appended correctly during string translation.
- Integration tests: Mock an Axios stream replicating a Twilio `200` buffer and verify the Express `res.pipe` successfully mimics the exact byte responses without buffering the entire file linearly in memory.

### 14. INTER-MODULE CONTRACTS
- Input contract: Express controller JSON inputs resolving webhook parameters.
- Output contract: Audio byte streams piped down client HTTP sockets.

### 15. CONFIGURATION CONSTANTS
**N/A**

### 16. KNOWN LIMITATIONS / DEFERRED WORK
- **P2 Deferred Work**: Downloading the MP3 permanently to Google Cloud Storage (`veda-recordings-bucket/{business_id}/{campaign_id}/{lead_id}.mp3`). At MVP, relying directly upon Twilio's hosted storage is acceptable. 

### 17. IMPLEMENTATION CHECKLIST
- [ ] Connect parsing properties extracting Payload variables explicitly identifying `RecordingSid`.
- [ ] Implement database write logics updating `leads` parameters safely.
- [ ] Build the proxy streaming architecture wrapping an authenticated Axios pipe directly onto `res`.
- [ ] Assign Auth checks verifying campaign permissions before opening proxy streams.
