# MOD-02 — BusinessProfileModule

### 1. MODULE OVERVIEW
- Purpose: Manages the business profile CRUD lifecycle, dynamically enforcing onboarding fields before campaigns can be run.
- Position in the system pipeline: Core data management (acting as a prerequisite gate for user interactions).
- Upstream dependencies: AuthModule (requires `req.user.uid`).
- Downstream dependents: CampaignModule, PromptBuilderModule, FrontendModule (onboarding UI gate).

### 2. FILE STRUCTURE
- `backend/src/routes/business.routes.js`: Defines `/api/business/profile` endpoints.
- `backend/src/controllers/business.controller.js`: Handles profile retrieval, creation, and property updates.
- `backend/src/validators/business.validator.js`: Provides JSON schema validation (e.g., string sanitization).

### 3. NPM DEPENDENCIES
- `joi` or `zod`: For input sanitization, type safety, and enforcing explicit restrictions like min length parameters.

### 4. ENVIRONMENT VARIABLES CONSUMED
**N/A** — Business profile architecture operates natively with standard Firestore environment configs.

### 5. FIRESTORE COLLECTIONS ACCESSED
- `businesses` | read/write | Document ID strictly maps to `req.user.uid`. 
- `platform_stats/global` | update | Increments `total_businesses` counter strictly on new profile creations.

### 6. API ENDPOINTS EXPOSED
- `GET` | `/api/business/profile` | Auth: User
  - Request Body: `None`
  - Response Schema:
    ```json
    {
      "business_id": "string",
      "business_name": "string",
      "industry": "string",
      "core_value_prop": "string",
      "profile_complete": true
    }
    ```
- `POST` | `/api/business/profile` | Auth: User
  - Request Body Schema:
    ```json
    {
      "business_name": "string",
      "industry": "string",
      "core_value_prop": "string"
    }
    ```
  - Response Schema: Same as GET format.
- `PUT` | `/api/business/profile` | Auth: User
  - Request Body Schema: Same format but elements are optional payloads.
  - Response Schema: Same as format.

### 7. WEBSOCKET / EVENT MESSAGES
**N/A** — Profile updates do not utilize background eventing pipelines.

### 8. CORE LOGIC — STEP BY STEP
1. Validate `req.body` using the schema validator. Missing mandatory fields trigger immediate rejection on `POST`.
2. Check that the `core_value_prop` length equates to a minimum of 50 characters to guarantee LLM context depth.
3. For `GET /profile`, query `businesses/{req.user.uid}`. If missing, return `404 Not Found` (This safely prompts the frontend router to invoke `/onboarding`).
4. For `POST /profile` (The Onboarding Submission):
   - Instantiate a Firestore batch write handler.
   - Assign document initialization at `businesses/{req.user.uid}`.
   - Set `profile_complete: true` automatically upon verification that all properties are adequately defined.
   - Atomically increment the `total_businesses` stat document via `FieldValue.increment(1)`.
   - Commit the transaction.
5. For `PUT /profile`: Target `businesses/{req.user.uid}` updating elements and logically recalculate `profile_complete` status.

### 9. EXPORTED FUNCTION SIGNATURES
```typescript
export const getProfile: (req: Request, res: Response) => Promise<void>;
export const createProfile: (req: Request, res: Response) => Promise<void>;
export const updateProfile: (req: Request, res: Response) => Promise<void>;
```

### 10. ERROR HANDLING STRATEGY
- **Validation Failure**: The client is issued a `400 Bad Request` holding structured error descriptions pinpointing explicit array parameters lacking compliance (e.g., string lengths).
- **Internal Firestore Exceptions**: Triggers a global generic `500` error blocking exposure of direct database query syntax constraints via client tracing; locally logged. 

### 11. RETRY & RESILIENCE
**N/A** — Form submit operations are initiated by user dashboards where client manual retries are fundamentally optimal.

### 12. SECURITY CONSIDERATIONS
- Force field string sanitizations preventing cross-site scripting vulnerabilities specifically concerning `core_value_prop` interpolation.
- Ensures a business account strictly references, modifies, and isolates documents enforcing DB lookups solely using `req.user.uid` resolved from authorization headers.

### 13. TESTING STRATEGY
- Unit tests: Verify logical assertions enforcing 50 char barriers applying toward the Zod mapping framework.
- Integration tests: Perform mocked creation workflows via Firestore emulators ensuring parallel increment structures fire accurately without double-counting updates on multiple trigger runs.
- Edge Case testing: Pass explicit `POST` workflows generating an incomplete 40 character argument confirming backend safety blocks handle failures promptly.

### 14. INTER-MODULE CONTRACTS
- Input contract: Validated business strings structured over explicit validation schema boundaries.
- Output contract: Successfully integrated documents. `PromptBuilderModule` strictly invokes outputs querying standard components.

### 15. CONFIGURATION CONSTANTS
- `MIN_VALUE_PROP_LENGTH` | Default: `50` | `src/validators/business.validator.js` | Directs high-level AI prompt instructions context density scaling.

### 16. KNOWN LIMITATIONS / DEFERRED WORK
- User hierarchical boundaries. Implementing secondary dashboard operators mapping a single DB account is restricted inside the primary iteration boundary.

### 17. IMPLEMENTATION CHECKLIST
- [ ] Initialize Zod schema templates.
- [ ] Define the primary routing structure targeting `/profile`.
- [ ] Code the standard `getProfile` controller component matching 404 handler responses.
- [ ] Write batch transactional methods scaling global stats for the `createProfile` endpoint.
- [ ] Refine `updateProfile` logics handling iterative save cycles.
