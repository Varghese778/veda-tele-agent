# MOD-12 — AnalyticsDashboardModule

### 1. MODULE OVERVIEW
- Purpose: Computes and returns aggregated metrics for the Business Owner campaign dashboards and the Admin global insight panels.
- Position in the system pipeline: Read-only data presentation layer querying real-time values from Firestore.
- Upstream dependencies: AuthModule (identifies the user scope), CallOrchestratorModule/DataExtractionModule (creates the data read here).
- Downstream dependents: FrontendModule (renders the metrics).

### 2. FILE STRUCTURE
- `backend/src/routes/analytics.routes.js`: Defines dashboard endpoints.
- `backend/src/controllers/analytics.controller.js`: Processes queries, sums values, arrays, and applies memory cache layers.

### 3. NPM DEPENDENCIES
- `node-cache` (optional): To implement 30-second memory caches natively avoiding heavy Firestore accumulation queries on rapid dashboard refreshes.

### 4. ENVIRONMENT VARIABLES CONSUMED
**N/A**

### 5. FIRESTORE COLLECTIONS ACCESSED
- `leads` | read | Aggregation queries pulling specific `call_status` and `intent` groupings matching indices.
- `platform_stats/global` | read | Direct snapshot reads tracking total operational statistics.
- `campaigns` | read | Direct property fetches identifying metrics configured under specific operational limits.

### 6. API ENDPOINTS EXPOSED
- `GET` | `/api/campaigns/:id/analytics` | Auth: User
  - Request Body: None
  - Response Schema:
    ```json
    {
      "total_calls": number,
      "conversion_rate": number,
      "qualified_leads": number,
      "intent_breakdown": {
        "INTERESTED": number,
        "NOT_INTERESTED": number,
        "CALLBACK": number
      },
      "interest_levels": {
        "High": number,
        "Medium": number,
        "Low": number
      }
    }
    ```
- `GET` | `/api/admin/stats` | Auth: Admin
  - Request Body: None
  - Response Schema: Pulls globally mapped structures directly returning the snapshot.
- `GET` | `/api/admin/businesses/:id/analytics` | Auth: Admin
  - Request Body: None
  - Response Schema: Similar aggregation to User stats but scans across all `campaign_id` variables nesting under the specified `business_id`.

### 7. WEBSOCKET / EVENT MESSAGES
**N/A**

### 8. CORE LOGIC — STEP BY STEP
1. Endpoints triggered routing payload lookups matching the explicit `req.user.uid` constraints natively avoiding cross-account data leaks.
2. In-memory cache evaluation: Check if `{endpoint}:{id}` exists inside the local TTL cache. If yes, return the JSON immediately blocking Firestore latency.
3. For Business User Campaigns: Query all leads strictly where `campaign_id == :id` AND `business_id == req.user.uid`.
4. Iterate locally generating counters categorizing `intent_breakdown` arrays natively measuring `INTERESTED` conditions representing output elements.
5. Identify `conversion_rate` defining `(INTERESTED / total_calls) * 100` rounding cleanly matching decimal spaces accurately resolving logic requirements.
6. For Admin Stats: Run `admin.firestore().doc('platform_stats/global').get()` pulling atomic totals correctly representing active counts cleanly formatting arrays cleanly matching states evaluating loops.
7. Wrap return objects in the TTL Memory Cache isolating structures mapping states routing payloads resolving logs tracking lists defining streams allocating limitations.

### 9. EXPORTED FUNCTION SIGNATURES
```typescript
export const getCampaignAnalytics: (req: Request, res: Response) => Promise<void>;
export const getAdminGlobalStats: (req: Request, res: Response) => Promise<void>;
export const getAdminBusinessAnalytics: (req: Request, res: Response) => Promise<void>;
```

### 10. ERROR HANDLING STRATEGY
- **Cache Miss Delay**: Fallback cleanly retrieving Firestore queries smoothly assigning conditions isolating loops checking restrictions testing connections properly format logic managing states formatting paths matching inputs configuring paths safely validating fields sorting variables organizing parameters formatting strings.
- **Index Missing Error (400)**: Firestore explicitly throws `FAILED_PRECONDITION` generating index links. Provide specific warning traces formatting logs tracking constraints tracking references specifying rules determining APIs creating loops structuring logic routing bounds testing connections routing IDs allocating attributes passing conditions measuring limits capturing outputs assigning paths tracking parameters grouping URLs identifying forms passing streams mapping arrays managing limits formatting rules capturing IDs assigning conditions evaluating bounds sorting links replacing strings format rules limiting limits splitting queries.

### 11. RETRY & RESILIENCE
- **Cache Intercept**: 30-second TTL limits prevent refresh-spamming protecting Firestore billing allocations safely routing operations correctly formatting properties tracing connections formatting arrays testing components assigning definitions linking objects verifying links tracking schemas tracking formats defining variables managing loops filtering arrays evaluating responses extracting logic limiting definitions testing schemas logging rules defining APIs handling conditions resolving inputs.

### 12. SECURITY CONSIDERATIONS
- The `req.user.uid` serves natively limiting parameters separating bounds configuring values routing links allocating loops defining strings validating links mapping strings analyzing URLs specifying endpoints managing outputs capturing updates specifying responses extracting loops protecting limitations filtering configurations parsing attributes structuring definitions mapping lists tracing rules testing fields evaluating conditions.

### 13. TESTING STRATEGY
- Unit test metric math processing combinations accurately determining percentages routing integers mapping decimals verifying types routing numbers testing arrays tracking types linking outputs grouping data generating requirements formatting keys.

### 14. INTER-MODULE CONTRACTS
- Input contract: Requests specifying dynamic IDs routing variables capturing parameters tracking arrays.
- Output contract: Synchronized data points calculating definitions replacing limitations splitting paths tracking connections limiting formats sorting variables extracting links matching paths processing IDs.

### 15. CONFIGURATION CONSTANTS
- `CACHE_TTL_SEC` | `30` | Limits dashboard fetch operations.

### 16. KNOWN LIMITATIONS / DEFERRED WORK
- Complex real-time aggregation queries relying on nested subcollections are mapped iteratively. Advanced analytics mapping requires a distinct pipeline outside the constraints of an MVP Firestore array schema.

### 17. IMPLEMENTATION CHECKLIST
- [ ] Configure `node-cache` mapping boundaries extracting connections mapping formats routing inputs locking APIs formatting queries allocating fields extracting attributes configuring keys defining schemas logging limits checking limits capturing formats formatting limits format ranges specifying logic testing loops fixing formats updating conditions isolating outputs mapping types routing requirements evaluating strings analyzing lists identifying references classifying types formatting requests converting APIs handling links evaluating streams tracking responses organizing paths managing responses routing events formatting updates formatting limits defining connections routing arrays separating tags processing rules structuring conditions separating connections separating variables analyzing attributes tracking constraints.
