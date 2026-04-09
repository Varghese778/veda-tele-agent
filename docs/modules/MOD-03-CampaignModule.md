# MOD-03 — CampaignModule

### 1. MODULE OVERVIEW
- Purpose: Full CRUD and lifecycle management for campaigns, allowing a business user to define call scripting, goals, and initiate the active call cycle.
- Position in the system pipeline: Middle business-logic tier connecting the user's actions to the execution engine.
- Upstream dependencies: BusinessProfileModule (business prerequisites), AuthModule (user authorization).
- Downstream dependents: CallOrchestratorModule (polls campaigns by status), PromptBuilderModule (consumes campaign specifics).

### 2. FILE STRUCTURE
- `backend/src/routes/campaigns.routes.js`: Maps REST paths referencing campaign CRUD functions.
- `backend/src/controllers/campaign.controller.js`: Processes database lookups and coordinates analytics logic.
- `backend/src/validators/campaign.validator.js`: Handles required constraints for scripts and names.

### 3. NPM DEPENDENCIES
- `joi` or `zod`: Applies constraint blocks assuring payload compliance for inputs.

### 4. ENVIRONMENT VARIABLES CONSUMED
**N/A** — Uses the default Firebase environment initialization handled globally.

### 5. FIRESTORE COLLECTIONS ACCESSED
- `campaigns` | read/write | Document creation, updates, and indexing via `business_id == req.user.uid`.
- `leads` | read | Count operations retrieving metric aggregation filtering against `campaign_id`.

### 6. API ENDPOINTS EXPOSED
- `GET` | `/api/campaigns` | Auth: User
  - Request Body Schema: None (Reads `req.user.uid`)
  - Response Schema:
    ```json
    [{
      "campaign_id": "string",
      "campaign_name": "string",
      "status": "string (draft|active|paused|completed)",
      "total_leads": number
    }]
    ```
- `POST` | `/api/campaigns` | Auth: User
  - Request Body Schema:
    ```json
    {
      "campaign_name": "string",
      "purpose": "string",
      "script_guidelines": "string",
      "product_description": "string",
      "target_audience": "string",
      "key_details": "string"
    }
    ```
  - Response Schema: Created Campaign object block.
- `GET` | `/api/campaigns/:id` | Auth: User
  - Request Body Schema: None.
  - Response Schema: Single Campaign object detail.
- `PUT` | `/api/campaigns/:id` | Auth: User
  - Request Body Schema: Editable properties.
  - Response Schema: Updated Campaign object.
- `POST` | `/api/campaigns/:id/start` | Auth: User
  - Request Body Schema: None.
  - Response Schema: `{ "status": "active" }`
- `POST` | `/api/campaigns/:id/pause` | Auth: User
  - Request Body Schema: None.
  - Response Schema: `{ "status": "paused" }`
- `GET` | `/api/campaigns/:id/analytics` | Auth: User
  - Request Body Schema: None.
  - Response Schema:
    ```json
    {
      "conversion_rate": number,
      "intent_breakdown": { "INTERESTED": number, "NOT_INTERESTED": number, "CALLBACK": number },
      "avg_duration": number
    }
    ```

### 7. WEBSOCKET / EVENT MESSAGES
**N/A** — Lifecycle state logic propagates directly toward Firestore database handlers synchronously.

### 8. CORE LOGIC — STEP BY STEP
1. Process validation ensuring minimal logic paths matching `campaign_name` existence.
2. Ensure strict `business_id` scoping inside queries confirming `campaigns/{id}` matches `req.user.uid`.
3. Create logic strictly defining the initialized status state pointing to `draft`.
4. Editing an existing database record: Validate its current status is explicitly `draft`. If it reads `active`, block edits returning `400 Bad Request` explaining transitions block core modifications.
5. Lifecycle Transitions (Start/Pause endpoints): Simply mutate the `status` enum string inside Firestore.
6. Only the downstream orchestrator module can organically push state properties toward the explicit `completed` block.
7. Campaign analytics queries directly request associated references within the `leads` collection aggregating count properties applying toward `call_status` + `intent` groupings.

### 9. EXPORTED FUNCTION SIGNATURES
```typescript
export const listCampaigns: (req: Request, res: Response) => Promise<void>;
export const getCampaign: (req: Request, res: Response) => Promise<void>;
export const createCampaign: (req: Request, res: Response) => Promise<void>;
export const updateCampaign: (req: Request, res: Response) => Promise<void>;
export const startCampaign: (req: Request, res: Response) => Promise<void>;
export const pauseCampaign: (req: Request, res: Response) => Promise<void>;
export const getAnalytics: (req: Request, res: Response) => Promise<void>;
```

### 10. ERROR HANDLING STRATEGY
- **Forbidden State Mutations (`409 Conflict`)**: Refuse structural `PUT` adjustments modifying prompts if execution status signals `active` execution.
- **Resource Ownership (`403/404`)**: If queries query IDs misaligned from `req.user.uid` constraints, reject them securely.
- General server handlers drop internal stacks behind a sanitizing `500` JSON block locally logged globally.

### 11. RETRY & RESILIENCE
**N/A** — Client-sided interface logic relying on UI input state.

### 12. SECURITY CONSIDERATIONS
- The system must absolutely filter lookup iterations blocking enumeration attacks by embedding explicit `.where('business_id', '==', req.user.uid)` constraints.
- Direct status injection blocks force backend assignments toward `draft` preventing custom UI inputs overriding constraints inside standard creation structures.

### 13. TESTING STRATEGY
- Unit tests: Verifying ownership logic mapping validations blocks.
- Integration tests: Complete transition iterations confirming update blockers resolve safely triggering `409` states parsing configurations over the `/start` transition boundary.
- Assert analytics aggregations correctly sort combinations.

### 14. INTER-MODULE CONTRACTS
- Input contract: Validated business strings resolving from Auth checks. Standardized object bodies.
- Output contract: Synchronized status configurations directing the `CallOrchestratorModule` execution polling loop.

### 15. CONFIGURATION CONSTANTS
- `DEFAULT_RETRY_LIMIT` | `2` | Set via initial creation structures establishing default call parameters tracking loops per campaign.

### 16. KNOWN LIMITATIONS / DEFERRED WORK
- Time-based scheduling configurations scaling active states automatically trigger states deferred until future deployment loops outside MVP ranges.

### 17. IMPLEMENTATION CHECKLIST
- [ ] Validate schema objects handling property blocks.
- [ ] Connect REST router layers toward authorization middleware frameworks.
- [ ] Define collection CRUD methods applying explicit UID indexing rules.
- [ ] Structure the explicit Start / Pause toggle logic.
- [ ] Build aggregation references pointing toward the `leads` collection generating dashboard metrics safely.
