# MOD-04 — LeadIngestionModule

### 1. MODULE OVERVIEW
- Purpose: Handles CSV file upload, parsing, validation, deduplication, and batch writing of leads to Firestore.
- Position in the system pipeline: Data ingestion layer running prior to call orchestration.
- Upstream dependencies: Fast and robust multipart/form-data Express router limits.
- Downstream dependents: The `CallOrchestratorModule` which polls rows set to `pending`.

### 2. FILE STRUCTURE
- `backend/src/routes/leads.routes.js`: Exposes `/api/campaigns/:id/upload`.
- `backend/src/controllers/leads.controller.js`: Business logic coordinating parsing and uploading to Firestore.
- `backend/src/utils/csv.parser.js`: Extracted CSV-parsing streams manipulating row variables natively.

### 3. NPM DEPENDENCIES
- `multer` (v1.4.5-lts.1+): To parse incoming multipart/form-data.
- `csv-parse` (v5.x): To reliably stream buffer contents matching precise string headers.

### 4. ENVIRONMENT VARIABLES CONSUMED
**N/A** — Uses localized node stream logic handling buffer processing.

### 5. FIRESTORE COLLECTIONS ACCESSED
- `leads` | read/write | Validates deduplications against `campaign_id` then issues batch commit insertions targeting initialization constraints.
- `campaigns` | update | Triggers an update rewriting `total_leads` counts replacing parameters against prior values.

### 6. API ENDPOINTS EXPOSED
- `POST` | `/api/campaigns/:id/upload` | Auth: User
  - Request Body: `multipart/form-data`, file input: `contacts`
  - Response Schema:
    ```json
    {
      "accepted": 450,
      "rejected": [
        { "row": 2, "reason": "Invalid E.164 phone number format" },
        { "row": 14, "reason": "Duplicate phone number inside CSV" }
      ]
    }
    ```

### 7. WEBSOCKET / EVENT MESSAGES
**N/A** — Strictly an HTTP request processing string buffers completely synchronously.

### 8. CORE LOGIC — STEP BY STEP
1. Validate ownership: Query `campaigns/{id}` verifying `business_id == req.user.uid`.
2. Execute `multer` storing files directly logically in-memory utilizing up to 2MB barriers accepting strictly `.csv` headers.
3. Pass memory buffers streaming across the `csv-parse` string components scanning `customer_name`, `phone_number`, and `email` structures.
4. If row parameters exceed 500 components, safely return `400 Bad Request` killing stream reads immediately to protect scale structures.
5. In-flight checks ensuring regex mappings `^\+[1-9]\d{7,14}$` resolving E.164 format. Record failed constraints against `rejected` iteration arrays.
6. Local Deduplication loop tracks identical variables logging repeats over in-memory sets. 
7. Cross references Firestore databases resolving duplicate phones matching `campaign_id`. Note rejected instances.
8. Slice valid segments organizing chunks at a maximum size of 499 rows corresponding strictly to Firestore batch limitations.
9. Initialize `call_status: 'pending'` and `attempt_count: 0`. Iteratively loop arrays commiting each `.commit()` sequence securely.
10. Finalize processing resolving `campaign.total_leads` properties pointing against `accepted` counts completely matching total results dynamically scaling payload results.

### 9. EXPORTED FUNCTION SIGNATURES
```typescript
export const uploadLeads: (req: Request, res: Response) => Promise<void>;
export const parseCSVData: (buffer: Buffer) => Promise<Array<{customer_name: string, phone_number: string, email?: string}>>;
```

### 10. ERROR HANDLING STRATEGY
- **Exceeded Constraints (400)**: Reject batches surpassing 500 rows returning detailed `size limit exceeded` properties.
- **Validation Errors (200 OK w/ Issues)**: Return partial structures communicating rows successfully parsed and distinct elements failing validation.
- **Ownership Mismatch (403)**: Decline processing requests when a client references IDs disconnected from `req.user.uid` constraints natively securing tenants.

### 11. RETRY & RESILIENCE
**N/A** — Retries logic applied explicitly along UI integrations matching 400 rejection responses enabling human resolution flows.

### 12. SECURITY CONSIDERATIONS
- Implement restrictive `multer` processing avoiding hard-drive path injection mapping purely toward ephemeral memory variables.
- Filter and sanitize `customer_name` discarding script elements injected matching standard cross-site rules. `phone_number` safely validates heavily formatted regex boundaries.

### 13. TESTING STRATEGY
- Unit tests: Run specific string iterations challenging regex validations and inner duplicate checks.
- Integration tests: Verify large multi-batch chunks correctly divide exactly at the 499 Firestore barrier limiting explicit payload blocks committing iterations organically.
- Assert validation blocks decline unformatted inputs protecting the database reliably.

### 14. INTER-MODULE CONTRACTS
- Input contract: Streams formatted standard CSV columns strictly referencing matching labels.
- Output contract: Inserts standardized collections formatting rows mapping directly against definitions scaling `CallOrchestratorModule` loops.

### 15. CONFIGURATION CONSTANTS
- `MAX_UPLOAD_ROWS` | `500` | Defined within controller | Ensures scalable Firestore transaction batch processing mapping bounds.
- `FIRESTORE_BATCH_LIMIT` | `499` | Handled internally |

### 16. KNOWN LIMITATIONS / DEFERRED WORK
- Parsing large scale files mapping above 10,000 units is specifically ruled outside `MVP` structures enforcing immediate batch operations dynamically allocating small synchronous streams.

### 17. IMPLEMENTATION CHECKLIST
- [ ] Incorporate `multer` matching single field `contacts` configurations targeting 2MB boundaries.
- [ ] Build parsing blocks configuring E.164 verifications directly tracking row errors correctly.
- [ ] Connect batched queries mapping distinct elements generating `leads/` elements.
- [ ] Sync logic targeting `campaigns/{id}` overriding metrics securely matching accepted numbers natively.
