# MOD-01 — AuthModule

### 1. MODULE OVERVIEW
- Purpose: Handles all authentication and authorization for the backend by verifying Firebase ID tokens and extracting custom claims.
- Position in the system pipeline: Request entry point (Middleware layer).
- Upstream dependencies: Firebase Auth (Google OAuth2).
- Downstream dependents: Every other API module relies on the `verifyToken` and `isAdmin` middleware logic.

### 2. FILE STRUCTURE
- `backend/src/config/firebase.js`: Firebase Admin SDK singleton initialization.
- `backend/src/middleware/auth.middleware.js`: Contains `verifyToken` and `isAdmin` functions.
- `backend/src/routes/auth.routes.js`: Exposes `/api/auth/init-profile`.
- `backend/src/routes/admin.routes.js`: Exposes `/api/admin/set-admin` capability.
- `backend/src/controllers/auth.controller.js`: Controller logic for initialization and claims.

### 3. NPM DEPENDENCIES
- `firebase-admin`: For verifying ID tokens and managing custom claims without REST overhead.

### 4. ENVIRONMENT VARIABLES CONSUMED
- `GOOGLE_CLOUD_PROJECT` | Environment | Project ID for Application Default Credentials (ADC).
- `FIREBASE_PROJECT_ID` | Extracted / Secret | Identifies the Firebase project.
- `FIREBASE_CLIENT_EMAIL` | Secret | Service account email for local dev.
- `FIREBASE_PRIVATE_KEY` | Secret | Service account key for local dev.

### 5. FIRESTORE COLLECTIONS ACCESSED
- `businesses` | read/write | Used by `init-profile` to read or create the `businesses/{uid}` document if it does not exist upon first login.

### 6. API ENDPOINTS EXPOSED
- `POST` | `/api/auth/init-profile` | Auth: User
  - Request Body Schema: `{}` (Relies entirely on Bearer token)
  - Response Schema:
    ```json
    {
      "message": "Profile initialized",
      "business_id": "string",
      "isNew": true
    }
    ```
- `POST` | `/api/admin/set-admin` | Auth: Superuser
  - Request Body Schema:
    ```json
    {
      "target_uid": "string"
    }
    ```
  - Response Schema:
    ```json
    {
      "message": "Admin claim set for target_uid"
    }
    ```

### 7. WEBSOCKET / EVENT MESSAGES
**N/A** — Authentication operates strictly over synchronous HTTP request headers.

### 8. CORE LOGIC — STEP BY STEP
1. Frontend sends request with `Authorization: Bearer <token>`.
2. `verifyToken` middleware splits the header string. If missing or invalid format, immediately return `401 Unauthorized`.
3. Calls `admin.auth().verifyIdToken(token)`. If this throws an error, return `401 Unauthorized` (Token expired/invalid).
4. Extracts `decodedToken`. Sets `req.user = { uid: decodedToken.uid, email: decodedToken.email, admin: decodedToken.admin === true }`.
5. Calls `next()` to proceed.
6. For Admin routes, the `isAdmin` middleware runs right after `verifyToken`: checks if `req.user.admin === true`.
7. If false, returns `403 Forbidden`. If true, calls `next()`.
8. On a user's first login, frontend calls `POST /api/auth/init-profile`.
9. The controller queries if `businesses/{req.user.uid}` exists. If not, it creates a basic document skeleton with default fields.

### 9. EXPORTED FUNCTION SIGNATURES
```typescript
export const verifyToken: (req: Request, res: Response, next: NextFunction) => Promise<void>;
export const isAdmin: (req: Request, res: Response, next: NextFunction) => void;
export const initProfile: (req: Request, res: Response) => Promise<void>;
export const setAdminClaim: (req: Request, res: Response) => Promise<void>;
```

### 10. ERROR HANDLING STRATEGY
- **Token Expired (`auth/id-token-expired`)**: Caught by middleware; returns `401` JSON telling frontend to silently refresh the token via Firebase SDK.
- **Malformed Token / Missing Header**: Returns `401` JSON `Invalid or missing token`.
- **Firestore Access Logic Failure**: Triggers default `500` error handler in controller; logs error structure to Cloud Logging without returning explicit DB details to the client.

### 11. RETRY & RESILIENCE
**N/A** — Token verification is a stateless library call against Firebase Admin using cached local certificate payloads. Token refresh is handled entirely by the frontend Firebase SDK.

### 12. SECURITY CONSIDERATIONS
- `verifyToken` middleware MUST be mounted *before* all protected route subgroups in the Express application.
- JWT tokens are naturally verified without external API calls once the public keys are fetched by `firebase-admin`.
- `req.user.admin` cannot be spoofed by a client-provided JSON payload (enforced by Firebase signed JWT custom claims).

### 13. TESTING STRATEGY
- Unit tests: Mock `firebase-admin.auth().verifyIdToken` to resolve with a valid payload and to reject with an `auth/id-token-expired` string.
- Integration tests: Call `/api/auth/init-profile` with a valid mock JWT.
- Assertions: Check that `req.user` accurately matches decoded details; verify that a `403` status triggers on `isAdmin` when the `admin: true` key is missing.

### 14. INTER-MODULE CONTRACTS
- Input contract: Express `req` object strictly formatted with `Authorization` header containing the Bearer pattern.
- Output contract: Mutations to the Express `req` object, explicitly attaching `req.user: { uid, email, admin }`.

### 15. CONFIGURATION CONSTANTS
**N/A** — Auth logic heavily relies on configuration environment variables and the Firebase Admin standard defaults.

### 16. KNOWN LIMITATIONS / DEFERRED WORK
- Rate limiting on API routes is deferred for MVP.
- Revocation of active tokens (via a blacklisted token registry) is out of MVP scope; relying entirely on natural 1-hour Firebase token expiration.

### 17. IMPLEMENTATION CHECKLIST
- [ ] Set up Firebase project configuration and ADC service account.
- [ ] Initialize `firebase-admin` in `src/config/firebase.js` (singleton).
- [ ] Write `verifyToken` middleware in `src/middleware/auth.middleware.js`.
- [ ] Write `isAdmin` middleware.
- [ ] Implement `initProfile` controller for first-time business document creation.
- [ ] Implement `scripts/set-admin.js` script utility.
