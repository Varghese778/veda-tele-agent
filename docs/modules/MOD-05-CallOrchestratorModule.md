# MOD-05 — CallOrchestratorModule

### 1. MODULE OVERVIEW
- Purpose: The core campaign execution engine polling Firestore for active campaigns to dispatch outbound Twilio calls dynamically matching logic queues.
- Position in the system pipeline: The primary background service loop invoking external telephony constraints globally.
- Upstream dependencies: LeadIngestionModule (supplies `pending` leads), CampaignModule (modifies status to `active`).
- Downstream dependents: TwilioWebhookModule (answers external callback pings updating tracking values mappings natively).

### 2. FILE STRUCTURE
- `backend/src/services/orchestrator.service.js`: Singleton logic establishing polling interval loops.
- `backend/src/services/twilio.service.js`: Standardized wrapped configurations encapsulating REST definitions securely passing parameters cleanly.

### 3. NPM DEPENDENCIES
- `twilio` (v4.x+): Standard npm module dispatching `calls.create()` triggers securely connecting variables matching external environments natively.

### 4. ENVIRONMENT VARIABLES CONSUMED
- `TWILIO_ACCOUNT_SID` | Secret | Authenticates account identifiers.
- `TWILIO_AUTH_TOKEN` | Secret | Rest client verification configurations.
- `TWILIO_NUMBER` | Secret | Determines originating outbound number elements mapped structurally.
- `BACKEND_URL` | Local/Cloud | Ensures `statusCallback` mapping defines exact reachable callback webhooks correctly tracking parameters.

### 5. FIRESTORE COLLECTIONS ACCESSED
- `campaigns` | read/write | Filter explicitly tracing records targeting `status == active` arrays. Mapped resolving completion loops. 
- `leads` | read/write | Query rows scaling properties returning `call_status` variables mapping cleanly toward `calling` states locking variables.

### 6. API ENDPOINTS EXPOSED
**N/A** — Fully asynchronous background polling mechanism structurally running standalone loops apart from explicit API routing mappings. 

### 7. WEBSOCKET / EVENT MESSAGES
**N/A** — Uses polling parameters; does not natively leverage pub/sub sockets for queue ingestion sequences.

### 8. CORE LOGIC — STEP BY STEP
1. Boot looping sets running intervals firing queries tracking strictly `campaigns` scaling elements reading `status == 'active'` every 10 seconds.
2. Foreach matched iteration query nested `leads` isolating documents reading `call_status='pending'` OR (`call_status='retry_queued'` bounded alongside `attempt_count < retry_limit` AND delays exceeding timestamps matching `5 minutes`).
3. Evaluate Concurrency constraints parsing an active global `activeCallCount`; limit variables skipping execution blocks if tracking variables exceed `10` limits.
4. Rate limit executions separating calls pacing iterations `2 seconds` scaling external telephony endpoints securely matching API boundaries.
5. Setup the parameter block triggering `twilioClient.calls.create({ to, from, url, statusCallback })`. The `url` directly maps toward `TwilioWebhookModule` generating TwiML configurations dynamically.
6. Upon instantiation resolution map documents returning success values explicitly transitioning `lead.call_status='calling'` tracking increments adding cleanly onto `lead.attempt_count++`, binding strictly appending the `twilio_call_sid`.
7. Transition Completion Logic: Loop validation checks verifying `leads` constraints bounding properties corresponding zero iterations reflecting `pending/calling/retry_queued`. Trigger updates modifying `campaign.status='completed'`.

### 9. EXPORTED FUNCTION SIGNATURES
```typescript
export const startOrchestrator: () => void;
export const stopOrchestrator: () => void;
export const initiateCall: (leadId: string, phoneNumber: string) => Promise<string>;
```

### 10. ERROR HANDLING STRATEGY
- **Twilio Connectivity Failure**: Logs standard HTTP status error iterations; maps document immediately defaulting `call_status='failed'` securely returning structural elements natively protecting retry tracking blocks safely.
- **Database Lock Limitations**: General internal issues catch arrays dumping metrics without leaking sensitive loops bounding execution elements appropriately protecting orchestrator runs continuously.

### 11. RETRY & RESILIENCE
- **Queuing Bounds**: Maps values identifying unanswered variables iterating state mapping logic into `retry_queued` conditions locking tracking timeouts cleanly enforcing exact `5 minute` backoff periods handling cooldown iterations dynamically. Max attempt limits natively bounded strictly scaling `campaign.retry_limit`.

### 12. SECURITY CONSIDERATIONS
- Webhook domains bound securely mapping `statusCallback` configurations tracking exact dynamic IDs securely linking endpoints guaranteeing explicit identification arrays returning configurations natively matching state components tracking variables distinctly.

### 13. TESTING STRATEGY
- Unit tests: Simulate loop logic explicitly returning zero configurations testing active skip mappings securely validating boundaries resolving iterations matching bounds appropriately locking constraints efficiently.
- Integration tests: Connect mocked implementations targeting `twilioClient.calls.create` passing structures resolving execution parameters reliably iterating state configuration properties.
- Verify `attempt_count` iterations successfully reject configurations exceeding retry allocations defining `failed` mappings correctly resolving transitions.

### 14. INTER-MODULE CONTRACTS
- Input contract: Validated queries locating execution arrays natively bound to UI campaign toggles.
- Output contract: Inserts payload parameters structurally pointing toward webhooks tracking completion configurations continuously mapping sequences logically.

### 15. CONFIGURATION CONSTANTS
- `MAX_CONCURRENT_CALLS` | `10` | Embedded variable | Tracks explicit global API definitions protecting downstream webhooks cleanly.
- `INTER_CALL_DELAY_MS` | `2000` | Loop tracking boundary | Generates staggered outbound configurations.
- `POOLING_INTERVAL_MS` | `10000` | Initialization variable | Syncs batch iteration rates logically matching execution timelines globally.

### 16. KNOWN LIMITATIONS / DEFERRED WORK
- Distributing tasks spanning multiple nodes strictly utilizes lightweight lock limitations defining structural counts bounding queries simply. Dedicated pub/sub brokers are deferred optimizing MVP single-container iteration constraints scaling effectively.

### 17. IMPLEMENTATION CHECKLIST
- [ ] Structure looping queries indexing `campaigns` filtering properly mapping explicit criteria indexing logic natively bounding structures cleanly parsing states correctly scaling.
- [ ] Connect `twilio` dependency arrays initiating connections natively mapping Webhook parameters scaling routes dynamically mapping lead variables accurately formatting links cleanly defining TwiML origins cleanly generating loops logically parsing iterations precisely formatting elements strictly resolving components.
- [ ] Develop closure hooks validating variables triggering termination logic securely parsing execution variables completing arrays successfully managing counts precisely formatting logs appropriately managing constraints fully defining elements cleanly.
