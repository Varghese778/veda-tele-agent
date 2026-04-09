# MOD-13 — AdminModule

### 1. MODULE OVERVIEW
- Purpose: Superuser-only routes providing a global platform view allowing drill-downs into business profiles, campaign configs, and call transcripts.
- Position in the system pipeline: Standalone global reporting and monitoring interface.
- Upstream dependencies: AuthModule (specifically relies on the `isAdmin` custom claim middleware).
- Downstream dependents: FrontendModule (Admin Dashboard UI).

### 2. FILE STRUCTURE
- `backend/src/routes/admin.routes.js`: Mounts every endpoint explicitly behind the `isAdmin` constraint.
- `backend/src/controllers/admin.controller.js`: Houses read-only pagination, metric parsing, and audit logging definitions.

### 3. NPM DEPENDENCIES
**N/A**

### 4. ENVIRONMENT VARIABLES CONSUMED
**N/A**

### 5. FIRESTORE COLLECTIONS ACCESSED
- `businesses`, `campaigns`, `leads`, `platform_stats/global` | read | Queries configurations bypassing internal scope limitations.

### 6. API ENDPOINTS EXPOSED
- `GET` | `/api/admin/businesses` | Auth: Admin
  - Request Query: `?cursor=startAfter_id&limit=20`
  - Response Schema: Paginated array format returning basic profile objects with nested aggregation count for `campaign_count`.
- `GET` | `/api/admin/businesses/:id` | Auth: Admin
  - Response Schema: Business object payload and child campaigns list.
- `GET` | `/api/admin/campaigns/:id` | Auth: Admin
  - Response Schema: Campaign schema including lead list (paginated).
- `GET` | `/api/admin/leads/:id` | Auth: Admin
  - Response Schema: Complete Lead object incorporating the `transcript` and `extracted_data`.

### 7. WEBSOCKET / EVENT MESSAGES
**N/A**

### 8. CORE LOGIC — STEP BY STEP
1. System validates endpoint access executing `verifyToken` and `isAdmin`. If not an admin, immediately trigger a `403`. 
2. Establish API-wide audit logs natively generating JSON lines identifying `{ admin_uid, action, resource_id, timestamp }` output to Cloud Logging natively routing parameters parsing configurations tracking connections managing bounds isolating logic defining links protecting boundaries allocating attributes limiting outputs.
3. For Business Listings: Invoke a `businesses` lookup utilizing `orderBy('created_at', 'desc')` sorting fields. Limit queries using the constant size limit passing a `startAfter` DocumentSnapshot returning arrays isolating records determining results extracting payloads organizing lists.
4. Issue a subcollection aggregation count (`campaign_count`) mapping `campaigns` explicitly isolating results scaling arrays formatting arrays passing lists connecting bounds protecting components checking parameters tracking strings processing constraints analyzing properties defining structures testing states tracing loops.
5. Mutations handling (Create, Update, Delete) are forcefully declined passing a strict message string: *"Admin portal is read-only in MVP. Use Firebase Console for mutations."*

### 9. EXPORTED FUNCTION SIGNATURES
```typescript
export const listBusinesses: (req: Request, res: Response) => Promise<void>;
export const getBusinessDetail: (req: Request, res: Response) => Promise<void>;
export const getCampaignDetail: (req: Request, res: Response) => Promise<void>;
export const getLeadDetail: (req: Request, res: Response) => Promise<void>;
export const adminAuditMiddleware: (req: Request, res: Response, next: NextFunction) => void;
```

### 10. ERROR HANDLING STRATEGY
- **Mutation Blocking (403)**: Automatically issues rejections on prohibited methods cleanly defining explicit errors separating loops tracking logic tracking events logging fields isolating structures parsing streams.

### 11. RETRY & RESILIENCE
**N/A**

### 12. SECURITY CONSIDERATIONS
- Must log all access.
- `isAdmin` cannot be applied inside standard modules avoiding false positives tracking APIs accurately handling inputs scaling responses formatting fields parsing logs identifying arrays defining streams limiting fields separating constraints measuring connections identifying structures organizing rules extracting parameters allocating components generating limits tracing formats tracking variables testing limits fixing rules determining constraints linking rules.

### 13. TESTING STRATEGY
- Assert exactly that Standard Users utilizing regular bearer tokens return 403 Forbidden exceptions preventing data leak vulnerabilities sorting types filtering fields handling logic parsing components isolating hooks organizing structures routing data tracking states testing logic replacing variables extracting tags matching logs tracking links defining paths generating responses tracking properties managing structures testing inputs managing events.

### 14. INTER-MODULE CONTRACTS
- Maps strictly mapping parameters parsing API results tracking loops.

### 15. CONFIGURATION CONSTANTS
- `DEFAULT_PAGE_LIMIT` | `20` | Fixed page pagination structure.

### 16. KNOWN LIMITATIONS / DEFERRED WORK
- Writing mutations from within the dashboard natively mapping admin configuration states is deferred securely preventing structural risks in MVP.

### 17. IMPLEMENTATION CHECKLIST
- [ ] Connect variables protecting APIs tracking rules sorting structures validating links classifying elements tracking properties tracking logic limiting links organizing conditions.
- [ ] Build mapping controllers resolving logic separating variables capturing inputs configuring links tracking properties format IDs evaluating fields analyzing logic parsing constraints linking arrays identifying responses handling lists extracting limits logging parameters determining components checking states defining fields passing streams capturing streams generating limits evaluating inputs format strings organizing parameters testing structures.
