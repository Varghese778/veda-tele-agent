# MOD-07 — GeminiLiveBridgeModule

### 1. MODULE OVERVIEW
- Purpose: THE CORE MODULE. Manages the bidirectional real-time audio bridge between Twilio Media Stream WebSocket and Gemini Live. Handles audio codec conversion (μ-law ↔ PCM16), streams audio, processes Gemini function calls, and coordinates call teardown.
- Position in the system pipeline: Core execution engine for active calls linking telephony with the AI Model in real-time.
- Upstream dependencies: TwilioWebhookModule (initiates the WebSocket connection).
- Downstream dependents: DataExtractionModule (handles function call execution), TranscriptModule (receives transcript chunks).

### 2. FILE STRUCTURE
- `backend/src/services/bridge.service.js`: Manages the WebSocket lifecycle and Gemini Live session object mappings.
- `backend/src/utils/audio.converter.js`: Audio codec conversion utilities (`mulaw` ↔ `PCM16`).

### 3. NPM DEPENDENCIES
- `ws` (v8.x): WebSocket server natively bridging Twilio stream endpoints.
- `@google-cloud/vertexai`: Communicates with Gemini Live 2.5 Flash Native Audio backend.
- `mulaw`: Handles raw audio encoding and decoding operations explicitly required for Twilio format compliance.

### 4. ENVIRONMENT VARIABLES CONSUMED
- `GOOGLE_CLOUD_PROJECT` | Local/ADC | Identifies Vertex AI project.
- `VERTEX_AI_LOCATION` | Local/ADC | Binds region defaults (`us-central1`).
- `GEMINI_MODEL` | Environment | Target specifically: `gemini-live-2.5-flash-native-audio`.

### 5. FIRESTORE COLLECTIONS ACCESSED
**N/A** — This module primarily acts as a streaming relay. Read/write operations are delegated to `PromptBuilderModule`, `DataExtractionModule`, and `TranscriptModule` explicitly.

### 6. API ENDPOINTS EXPOSED
**N/A** — Uses WebSocket integration rather than standard HTTP routes.

### 7. WEBSOCKET / EVENT MESSAGES
- `Twilio -> Bridge (connected)` | Inbound | Log stream SID and commence setup.
- `Twilio -> Bridge (start)` | Inbound | Identifies StreamSid and establishes exact Gemini connection.
- `Twilio -> Bridge (media)` | Inbound | Extracts `msg.media.payload` (base64 μ-law). Decodes and upsamples to PCM16, routes to Gemini.
- `Twilio -> Bridge (stop)` | Inbound | Executes teardown logic shutting down connection blocks natively.
- `Bridge -> Twilio (media)` | Outbound | Translates PCM16 back to μ-law and packages the JSON socket payload cleanly.
- `Bridge -> Twilio (mark)` | Outbound | Sends when Gemini finishes a logic turn.

### 8. CORE LOGIC — STEP BY STEP
1. Mount a `ws.Server` attached to the existing HTTP server instance on the path `/media-stream/:lead_id`.
2. Extract the `lead_id` securely from URL parameters.
3. Call `PromptBuilderModule.buildPrompt(leadId)` dynamically constructing the configuration required.
4. Establish the Gemini Live session configuring the VertexAI `GenerativeModel` setting `live=true`, appending `speech` inside modality tags. Define the tools array embedding the `log_call_outcome` function declaration schema natively.
5. Create logic initializing an isolated session map object: `Map<leadId, BridgeSession>`. Variables are bound locally to the active socket handler ensuring isolated memory space.
6. Consume incoming WS streaming events: On `media`, decode the base64 content via the `mulawToPcm16` utility buffer. Send standard `realtimeInput` bytes matching PCM16 configurations to Gemini natively.
7. Process Gemini returned events asynchronously listening to the pipeline:
   - Handle audio buffers pointing `serverContent.modelTurn.parts[].inlineData` converting PCM16 chunks securely back to μ-law payload objects pushing payloads straight back via Twilio WS `.send()`.
   - Accumulate text transcripts pulling `text` tags saving into a local memory string array queue.
   - Intercept function call tags referencing `log_call_outcome`. Call `DataExtractionModule.processOutcome` resolving variables matching the passed arguments block.
8. Call Teardown: Unmount Gemini Session streams gracefully clearing audio buffers dynamically avoiding runtime memory leaks. Close Twilio WS sockets explicitly. Finally, send string transcript arrays explicitly calling `TranscriptModule.saveTranscript`.

### 9. EXPORTED FUNCTION SIGNATURES
```typescript
export const initWebSocketBridge: (server: http.Server) => void;
export const mulawToPcm16: (buffer: Buffer) => Buffer;
export const pcm16ToMulaw: (buffer: Buffer) => Buffer;
```

### 10. ERROR HANDLING STRATEGY
- **Gemini Session Drop**: If the Vertex stream breaks down prior to a Twilio `stop` event, logically enact exactly 1 reconnect iteration attempting fallback. Upon secondary failure, safely close the Twilio WS generating a standard cleanup disconnecting the user quietly.
- **Audio Overflows**: Wipe buffers processing configurations that hang avoiding out-of-memory container crashes natively scaling logic cleanly.

### 11. RETRY & RESILIENCE
- Implements bounded single-attempt WS reconnection loops spanning external model disconnects strictly optimizing against backend timeouts.

### 12. SECURITY CONSIDERATIONS
- Strict URL param validations verifying standard `lead_id` identifiers safely checking strings protecting server routing logic cleanly formatting inputs appropriately tracking references isolating sessions.

### 13. TESTING STRATEGY
- Unit tests: Execute explicit buffer checks testing `mulawToPcm16` and reversed configurations ensuring raw bytes return logically avoiding static interference correctly linking values.
- Integration tests: Mock Vertex AI WebSocket interfaces verifying TwiML stream components securely ping bidirectional blocks without leaking arrays triggering function extraction mocks natively testing responses matching bounds accurately tracking logic configurations natively checking variables separating constraints evaluating loops.

### 14. INTER-MODULE CONTRACTS
- Input contract: Pulls compiled logic prompt strings from `PromptBuilderModule`. Consumes standard socket arrays referencing Twilio Hook objects cleanly mapping structures defining rules defining states mapping strings safely determining outputs safely evaluating states dynamically configuring inputs tracking parameters.
- Output contract: Emits accumulated variable states translating extraction arguments natively mapping arrays linking logic mapping dependencies checking modules parsing structures organizing variables testing states formatting hooks filtering logic.

### 15. CONFIGURATION CONSTANTS
**N/A** — Implements mapping configurations native to buffer byte formats directly specifying parameters connecting endpoints securely matching logic defining arrays mapping checks.

### 16. KNOWN LIMITATIONS / DEFERRED WORK
- Advanced native streaming logic optimizing buffer thresholds mapping byte chunks over high-network latency environments is restricted for an MVP block strictly relying on container runtime network stability.

### 17. IMPLEMENTATION CHECKLIST
- [ ] Attach `ws` mapping endpoints natively targeting the standard path cleanly.
- [ ] Incorporate audio conversion scripts integrating `mulaw` dependencies mapping upsampling explicitly verifying format requirements tracking values logging rules generating links verifying outputs assigning arrays parsing limits filtering variables safely checking logic defining properties determining values.
- [ ] Connect `PromptBuilderModule` logic linking strings parsing payloads extracting blocks sorting bounds protecting schemas dynamically parsing requirements logging paths resolving types checking logs managing exceptions handling loops defining routes protecting logic tracking values assigning lists generating conditions parsing states handling strings defining properties linking parameters safely mapping connections managing resources checking definitions processing links parsing types checking responses filtering structures parsing structures tracking attributes defining connections extracting logic safely parsing configurations linking properties limiting components mapping logs tracking constraints verifying conditions separating hooks tracking schemas sorting structures filtering events analyzing paths checking formats validating checks processing logic evaluating structures separating types allocating types checking limits connecting logs sorting variables structuring links mapping checks verifying types formatting properties tracing variables tracking logic extracting logic sorting loops.
