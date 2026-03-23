# OAuth 2.0 & OIDC Compliance Requirements

## Current State

The server implements a custom OAuth 2.0-inspired authentication system:
- 4 grant types: `authorization_code`, `password`, `client_credentials`, `refresh_token`
- PKCE support (S256, plain, OWH32)
- RS256-signed JWTs with per-tenant RSA key pairs
- HTTP Basic Auth for client authentication
- Multi-tenant architecture

It is **not fully OAuth 2.0 compliant** and **not OIDC compliant**.

---

## Project-Specific Findings (Validated Against Codebase)

### Architecture

| Component | Technology | Location |
|-----------|-----------|----------|
| Backend (srv) | NestJS + TypeORM + PostgreSQL | `srv/` |
| Frontend (ui) | Angular + PrimeNG + Bootstrap | `ui/` |
| External demo client | Vanilla HTML/JS | `external-user-app/` |
| Reverse proxy | Nginx (proxies `/api` → backend) | `ui/nginx/` |
| Database | PostgreSQL | `docker-compose.yml` |

### What Exists Today vs What the Plan Assumes

| Plan Assumption | Actual State | Impact |
|----------------|--------------|--------|
| `Tenant` is the client entity | ✅ Correct — `Tenant` holds `clientId`, `clientSecret`, RSA keys | REQ-CLIENT must decide: extend `Tenant` or create separate `Client` entity |
| `sub` = user email | ✅ Confirmed — `auth.service.ts` line: `sub: user.email` | REQ-I2 must change this to `user.id` (UUID) |
| Scopes = role names (array) | ✅ Confirmed — `scopes: scopesFromRoles` where roles are `TENANT_ADMIN` etc. | REQ-O2 must refactor this |
| Refresh token = JWT | ✅ Confirmed — `RefreshToken` is signed as JWT with RS256 | REQ-O4 must move to DB-backed opaque tokens |
| Auth code has no `redirect_uri` | ✅ Confirmed — `AuthCode` entity has no `redirect_uri` field | REQ-O1 must add this column |
| Auth code has no `scope` | ✅ Confirmed — `AuthCode` entity has no `scope` field | REQ-O1 must add this column |
| Auth code has no `nonce` | ✅ Confirmed — `AuthCode` entity has no `nonce` field | REQ-I6 must add this column |
| Auth code has no `used` flag | ✅ Confirmed — code is deleted after use via cron, not marked used | REQ-O1 must add atomic single-use enforcement |
| Auth code has no `expires_at` | ✅ Confirmed — expiry is calculated at runtime from `createdAt` + config | Should add explicit `expires_at` column |
| No `redirect_uri` validation | ✅ Confirmed — no registered redirect URIs exist on `Tenant` | REQ-O1 must add `redirect_uris` to client entity |
| Token response includes `token_type` | ✅ Partially — `token_type: "Bearer"` is present in most responses | REQ-O3 needs to ensure consistency across ALL responses |
| Token response includes `expires_in` | ⚠️ Returns config string, not always a number | REQ-O3 must ensure `expires_in` is always a number (seconds) |
| No `aud` claim | ✅ Confirmed — not present in any token | REQ-AUD must add |
| No `jti` claim | ✅ Confirmed — not present | REQ-O4 must add |
| No `nbf` claim | ✅ Confirmed — not present | Should add |
| No `kid` in JWT header | ✅ Confirmed — `JwtServiceRS256` does not set `kid` | REQ-I3 must add |
| CORS is configurable but broad | ✅ Confirmed — `app.enableCors()` with no origin restrictions | Must restrict to registered client origins |
| Error responses are NestJS exceptions | ✅ Confirmed — uses `BadRequestException`, `ForbiddenException` etc. | REQ error codes: must wrap in standard OAuth error shape |
| UI has `/authorize` route | ✅ Confirmed — `AuthorizeLoginComponent` at `/authorize` | Already handles login + redirect, needs spec compliance updates |
| UI already handles `state` param | ✅ Confirmed — reads `state` from query params, passes to redirect | Good foundation |
| PKCE S256 is broken in UI | ⚠️ `PKCEService.generateCodeChallenge` for S256 just returns the verifier (SHA-256 commented out) | Must fix — S256 is not actually working in the UI |
| `external-user-app` uses `plain` PKCE | ✅ Confirmed — hardcoded `code_verifier = "abcd-asfasf"` | Demo only, but shows the integration pattern |

---

## Architectural Decisions (Locked)

### Decision 1 — Multi-Tenant Issuer Model

**Chosen: Shared Issuer**
- `iss = https://auth.server.com` for all tenants
- Single discovery document, single JWKS endpoint
- `tenant_id` lives inside the token as a claim

### Decision 2 — Audience (`aud`) Strategy

**Chosen: Multiple APIs, always array format**
```json
"aud": ["payments-api"]
```

Always array — never bare string. Future: RFC 8707 resource indicators.

### Decision 3 — Roles vs Scopes

- **Scopes** — OAuth/OIDC: `openid`, `profile`, `email`, `tenant.read`, `tenant.write`
- **Roles** — internal: `TENANT_ADMIN`, `TENANT_VIEWER`

| Role | Permitted Scopes |
|------|-----------------|
| `SUPER_ADMIN` | `openid profile email tenant.read tenant.write` |
| `TENANT_ADMIN` | `openid profile email tenant.read tenant.write` |
| `TENANT_VIEWER` | `openid profile email tenant.read` |

### Decision 4 — Token Revocation Strategy

- Access tokens: short-lived (5–15 min), validated locally
- Refresh tokens: rotate on every use, family-based replay detection
- Blocklist: only for explicit logout and compromised tokens

### Decision 5 — `sub` Stability Guarantee

`sub` = user UUID (`user.id`). Immutable. MUST NEVER change. Currently uses `user.email` — must be changed.

### Decision 6 — Token Format Abstraction

Current: JWT (RS256). Isolate behind `TokenGenerator` and `SigningKeyProvider` interfaces.

### Decision 7 — Refresh Token Expiry Model

Dual expiry: absolute (max session lifetime) + sliding (per rotation, capped by absolute).

### Decision 8 — Client Secret Rotation

Support multiple active secrets with overlap window.

### Decision 9 — Client Entity Strategy

**Current state**: `Tenant` entity serves as both tenant and OAuth client. It holds `clientId`, `clientSecret`, RSA keys.

**Options**:
- **Option A**: Extend `Tenant` with new columns (`redirect_uris`, `allowed_scopes`, `is_public`, etc.)
- **Option B**: Create a separate `Client` entity with FK to `Tenant` (a tenant can have multiple clients)

**Recommendation**: Option B. The `App` entity already exists and represents applications owned by tenants. A `Client` entity per app makes the model cleaner and supports the real-world case where one tenant has a web app, a mobile app, and a backend service — each needing different OAuth configs.

---

## Changes By Component

### `srv` (Backend) Changes

#### Entity Changes

| Entity | Change | Phase |
|--------|--------|-------|
| `AuthCode` | Add: `redirect_uri`, `scope`, `nonce`, `expires_at`, `used` (boolean), `used_at` | Phase 1/4 |
| `Tenant` | Add: `redirect_uris` (json array) — or move to new `Client` entity | Phase 1 |
| New: `Client` | `client_id`, `client_secrets` (json), `redirect_uris`, `allowed_scopes`, `grant_types`, `response_types`, `token_endpoint_auth_method`, `is_public`, `require_pkce`, `allow_password_grant`, `allow_refresh_token`, FK to `Tenant` | Phase 1 |
| New: `RefreshTokenRecord` | `id`, `token_hash`, `family_id`, `parent_id` (UNIQUE), `user_id`, `client_id`, `tenant_id`, `scope`, `absolute_expires_at`, `expires_at`, `revoked`, `used_at` | Phase 2 |
| New: `LoginSession` | `sid`, `user_id`, `tenant_id`, `auth_time`, `created_at`, `expires_at` | Phase 4 |
| New: `UserConsent` | `user_id`, `client_id`, `granted_scopes`, `consent_version`, `created_at`, `updated_at` | Phase 4 |

#### Service Changes

| File | Change | Phase |
|------|--------|-------|
| `auth.service.ts` | Change `sub` from `user.email` to `user.id` in all token payloads | Phase 3 |
| `auth.service.ts` | Add `aud` (array), `jti`, `nbf` to access token payloads | Phase 2 |
| `auth.service.ts` | Remove `email`, `name`, `userId`, `tenant`, `userTenant` from access token (move to id_token) | Phase 3 |
| `auth.service.ts` | Add `id_token` generation when `openid` scope requested | Phase 3 |
| `auth.service.ts` | Refactor `createUserAccessToken` to return DB-backed refresh token instead of JWT | Phase 2 |
| `auth-code.service.ts` | Add atomic single-use enforcement (`UPDATE ... WHERE used = false`) | Phase 1 |
| `auth-code.service.ts` | Store `redirect_uri`, `scope`, `nonce` with auth code | Phase 1/4 |
| `auth-code.service.ts` | Add explicit `expires_at` (5 min from creation) | Phase 1 |
| `jwt.service.ts` | Add `kid` to JWT sign options | Phase 2 |
| `contexts.ts` | Refactor `TenantToken` — remove profile data from access token context | Phase 3 |
| `casl-ability.factory.ts` | Refactor to use new scope model instead of role names in `token.scopes` | Phase 1 |

#### Controller Changes

| File | Change | Phase |
|------|--------|-------|
| `auth.controller.ts` | Standardize all error responses to OAuth error format (`{ error, error_description }`) | Phase 1 |
| `auth.controller.ts` | Ensure `expires_in` is always a number (currently may return string from config) | Phase 1 |
| `auth.controller.ts` | Add `scope` as space-delimited string in all responses (currently conditional) | Phase 1 |
| `auth.controller.ts` | Add `POST /api/oauth/introspect` endpoint | Phase 1 |
| `auth.controller.ts` | Add `POST /api/oauth/revoke` endpoint | Phase 2 |
| `auth.controller.ts` | Add `GET /api/oauth/userinfo` endpoint | Phase 5 |
| `auth.controller.ts` | Refactor `handleCodeGrant` — validate `redirect_uri` binding, enforce atomic code use | Phase 1 |
| `auth.controller.ts` | Refactor `handleRefreshTokenGrant` — use DB-backed tokens with rotation | Phase 2 |
| New controller | Add `GET /.well-known/openid-configuration` | Phase 5 |
| New controller | Add `GET /.well-known/jwks.json` | Phase 2 |

#### Validation Schema Changes

| Schema | Change | Phase |
|--------|--------|-------|
| `PasswordGrantSchema` | Change `scopes` from array to space-delimited string `scope` | Phase 1 |
| `ClientCredentialGrantSchema` | Same | Phase 1 |
| `RefreshTokenGrantSchema` | Same | Phase 1 |
| `CodeGrantSchema` | Add `redirect_uri` (required if present in /authorize) | Phase 1 |
| All grant schemas | Add scope validation: `requested ∩ client.allowed ∩ user.permitted` | Phase 1 |
| New: `AuthorizeSchema` | `response_type`, `client_id`, `redirect_uri`, `scope`, `state` (required), `code_challenge`, `code_challenge_method`, `nonce` | Phase 4 |

#### Migration

A new TypeORM migration is needed for:
- `AuthCode` schema changes (new columns)
- `Client` entity table creation
- `RefreshTokenRecord` table creation
- `LoginSession` table creation
- `UserConsent` table creation

#### CryptUtil Changes

| Change | Phase |
|--------|-------|
| Add `code_verifier` length validation (43–128 chars) | Phase 1 |
| Add `code_verifier` charset validation (`[A-Za-z0-9\-._~]`) | Phase 1 |
| Enforce S256 when client has `require_pkce = true` — reject `plain` | Phase 1 |

#### CORS Changes

| Change | Phase |
|--------|-------|
| Replace `app.enableCors()` with origin whitelist from registered client `redirect_uris` | Phase 4 |
| `/.well-known/*` endpoints: allow `*` | Phase 5 |

---

### `ui` (Frontend) Changes

| File | Change | Phase |
|------|--------|-------|
| `pkce.service.ts` | Fix S256 — currently returns verifier unchanged (SHA-256 is commented out). Must implement proper `BASE64URL(SHA256(verifier))` using Web Crypto API | Phase 1 |
| `authorize-login.component.ts` | Add `state` generation and validation (currently reads but doesn't generate) | Phase 4 |
| `authorize-login.component.ts` | Validate `state` on redirect callback | Phase 4 |
| `authorize-login.component.ts` | Support `nonce` parameter (generate, pass to `/authorize`, validate in `id_token`) | Phase 3 |
| `session.service.ts` | Update `isSuperAdmin()` / `isTenantAdmin()` — currently checks `scopes` for role names, must adapt to new scope model | Phase 1 |
| `session.service.ts` | Handle `id_token` storage and decoding (currently only handles access token) | Phase 3 |
| `session.service.ts` | Update `getDecodedToken()` — `sub` will change from email to UUID | Phase 3 |
| `auth.service.ts` | Add `fetchUserInfo()` method calling `GET /api/oauth/userinfo` | Phase 5 |
| `auth.service.ts` | Add logout method calling `POST /api/oauth/revoke` | Phase 2 |
| `session-confirmation.component.ts` | May need updates for new session/consent flow | Phase 4 |
| `tenant-selection.component.ts` | No changes expected | — |
| New: consent screen component | Show requested scopes, allow user to approve (future, for third-party clients) | Future |

#### Critical UI Bug: PKCE S256

In `ui/src/app/_services/pkce.service.ts`, the `generateCodeChallenge` method for S256 is broken:
```typescript
if (method === 'S256') {
    // S256 method is commented out as it requires HTTPS
    return verifier; // ← THIS IS WRONG — returns verifier as-is
}
```

This means S256 PKCE is not actually working. The fix:
```typescript
if (method === 'S256') {
    const encoder = new TextEncoder();
    const data = encoder.encode(verifier);
    const hash = await crypto.subtle.digest('SHA-256', data);
    return this.base64urlencode(hash);
}
```

Note: `crypto.subtle` requires HTTPS or localhost. The comment says "requires HTTPS" — this is only true for production. It works on `localhost` for development.

---

### `external-user-app` Changes

| File | Change | Phase |
|------|--------|-------|
| `index.html` | Update to use proper PKCE (currently hardcoded `code_verifier = "abcd-asfasf"`) | Phase 1 |
| `index.html` | Add `state` parameter to authorize request | Phase 4 |
| `index.html` | Handle `id_token` in token response | Phase 3 |
| `server.js` | Update `verifyToken` — currently checks `grant_type` and `tenant.domain` directly from JWT. Must adapt to new token schema (no profile data in access token) | Phase 3 |

---

### Database Migration Plan

New migration file needed (single migration covering all schema changes per phase):

**Phase 1 migration:**
- Add columns to `auth_code`: `redirect_uri`, `scope`, `nonce`, `expires_at`, `used` (default false), `used_at`
- Create `clients` table

**Phase 2 migration:**
- Create `refresh_tokens` table with `UNIQUE(parent_id)` constraint
- Create index on `refresh_tokens(family_id)` for family revocation queries
- Create index on `refresh_tokens(token_hash)` for lookup

**Phase 4 migration:**
- Create `login_sessions` table
- Create `user_consents` table

---

### Nginx / Infrastructure Changes

| Change | Phase |
|--------|-------|
| Add proxy rule for `/.well-known/*` → backend | Phase 2/5 |
| Current config only proxies `/api` — `.well-known` paths won't reach the backend | Phase 2 |

The current nginx config:
```nginx
location ^~ /api {
    proxy_pass ${AUTH_SERVER};
}
```

Must add:
```nginx
location ^~ /.well-known {
    proxy_pass ${AUTH_SERVER};
}
```

---

### Docker / Deployment Changes

| Change | Phase |
|--------|-------|
| Consider adding Redis for `jti` blocklist (optional — can use PostgreSQL with TTL cleanup initially) | Phase 2 |
| No other infrastructure changes required | — |

---

## Security Rules

### Binding Rules

| Rule | Check |
|------|-------|
| Auth code → client | `auth_code.client_id == requesting client_id` |
| Refresh token → client | `refresh_token.client_id == requesting client_id` |
| Auth code → redirect | `auth_code.redirect_uri == request redirect_uri` |

### Atomicity Requirements

**Auth code exchange:**
```sql
UPDATE auth_code SET used = true, used_at = NOW()
WHERE code = ? AND used = false
RETURNING *
```

**Refresh token rotation:**
```sql
UPDATE refresh_token SET used_at = NOW()
WHERE id = ? AND used_at IS NULL
RETURNING *
```

`UNIQUE(parent_id)` prevents parallel refresh race conditions.

### Scope Rules

```
final_scope = requested ∩ client.allowed_scopes ∩ user_role.permitted_scopes
```

Normalize: split → deduplicate → sort. Empty scope = `invalid_request`. Omitted scope = client defaults.

### PKCE Verification

S256: `BASE64URL(SHA256(code_verifier)) == stored code_challenge`
plain: `code_verifier == stored code_challenge`

`code_verifier`: 43–128 chars, charset `[A-Za-z0-9\-._~]`.

Downgrade prevention: if `require_pkce = true`, reject `plain`.

### `redirect_uri` Validation

1. Must exactly match one of client's registered `redirect_uris[]`
2. If present in `/authorize`, must also be present in `/token`
3. In `/token`, must match the value from `/authorize`

### `state` — required for all clients

### Zombie Access Prevention

APIs must validate user still belongs to `tenant_id`. Accept risk for short-lived tokens or use membership cache.

---

## Clock Skew: ±30s on `iat`, `nbf`, `exp`

## Error Codes: Standard OAuth 2.0 (RFC 6749 §5.2). Protected endpoints: `WWW-Authenticate: Bearer error="invalid_token"`

## CORS: Registered origins only on `/token`, `/userinfo`. Public on `/.well-known/*`

## Rate Limiting: `/token` per `client_id`, `/login` per IP, `/authorize` per IP

## Logging: Never log tokens/secrets. Alert on replay detection, `invalid_grant` spikes

## Logout: Revoke refresh family → invalidate session → clear cookie

## JWKS: `kid = {tenant_id}:{key_version}`. Safe rotation: add key → wait cache TTL → sign → keep old until expiry

---

## Token Schemas

### Access Token
```json
{
  "iss": "https://auth.server.com",
  "sub": "user-uuid",
  "aud": ["api"],
  "exp": 1234567890,
  "iat": 1234567890,
  "nbf": 1234567890,
  "jti": "globally-unique-id",
  "scope": "tenant.read tenant.write",
  "client_id": "tenant-client-id",
  "tenant_id": "tenant-uuid",
  "grant_type": "authorization_code"
}
```

### ID Token
```json
{
  "iss": "https://auth.server.com",
  "sub": "user-uuid",
  "aud": ["client-id"],
  "azp": "client-id",
  "exp": 1234567890,
  "iat": 1234567890,
  "auth_time": 1234567890,
  "nonce": "client-provided-nonce",
  "at_hash": "left-half-of-sha256-of-access-token",
  "sid": "session-id",
  "acr": "urn:mace:incommon:iap:silver",
  "amr": ["pwd"],
  "email": "user@example.com",
  "email_verified": true,
  "name": "John Doe"
}
```

---

## Implementation Phases

### Phase 1 — Core Correctness

| Requirement | Effort |
|-------------|--------|
| REQ-O3: Token response shape (ensure `expires_in` is number, `scope` always present) | 0.5 days |
| REQ-O2: Scope format + validation chain (refactor role-based scopes) | 1.5 days |
| REQ-O5: Introspection endpoint | 0.5 days |
| REQ-CLIENT: Client registration entity (new entity + migration) | 1.5 days |
| Fix PKCE S256 in UI (`pkce.service.ts`) | 0.5 days |
| Fix auth code single-use (add `used` flag + atomic update) | 0.5 days |

Phase 1 total: ~5 days

### Phase 2 — Security Foundation

| Requirement | Effort |
|-------------|--------|
| REQ-O4: DB-backed refresh tokens + rotation + family model + revocation endpoint | 2–3 days |
| REQ-I3: JWKS endpoint + `kid` in JWT headers + nginx proxy rule | 1.5–2 days |
| REQ-AUD: `aud` claim on all tokens | 0.5 days |

Phase 2 total: ~4–5.5 days

### Phase 3 — OIDC Core

| Requirement | Effort |
|-------------|--------|
| REQ-I2: ID token generation + change `sub` to UUID + strip profile from access token | 2–3 days |
| REQ-I6: Nonce support (auth code + id_token) | 0.5 days |
| REQ-I5: OIDC scopes mapping | 1 day |
| UI: handle `id_token`, update `session.service.ts` for new `sub` | 1 day |
| `external-user-app`: update `verifyToken` for new token schema | 0.5 days |

Phase 3 total: ~5–6 days

### Phase 4 — User-Facing Flows

| Requirement | Effort |
|-------------|--------|
| REQ-O1: `/authorize` redirect endpoint (server-side `GET` handler) | 2–3 days |
| Login session entity + cookie management | 1 day |
| UI: `state` generation/validation, consent flow prep | 1 day |
| CORS restriction to registered origins | 0.5 days |

Phase 4 total: ~4.5–5.5 days

### Phase 5 — OIDC Ecosystem

| Requirement | Effort |
|-------------|--------|
| REQ-I4: UserInfo endpoint | 1 day |
| REQ-I1: Discovery document + nginx rule | 0.5 days |

Phase 5 total: ~1.5 days

### Phase 6 — Cleanup

| Requirement | Effort |
|-------------|--------|
| REQ-O6: Password grant deprecation | 0.5 days |

---

## Summary

| Requirement | Phase | Effort |
|-------------|-------|--------|
| REQ-O3: Token response shape | 1 | 0.5 days |
| REQ-O2: Scope format + validation | 1 | 1.5 days |
| REQ-O5: Introspection | 1 | 0.5 days |
| REQ-CLIENT: Client registration | 1 | 1.5 days |
| Fix PKCE S256 (UI) | 1 | 0.5 days |
| Fix auth code single-use | 1 | 0.5 days |
| REQ-O4: Revocation + refresh rotation | 2 | 2–3 days |
| REQ-I3: JWKS + rotation | 2 | 1.5–2 days |
| REQ-AUD: Audience enforcement | 2 | 0.5 days |
| REQ-I2: ID token | 3 | 2–3 days |
| REQ-I6: Nonce | 3 | 0.5 days |
| REQ-I5: OIDC scopes | 3 | 1 day |
| UI + external-app updates | 3 | 1.5 days |
| REQ-O1: /authorize | 4 | 2–3 days |
| Session + consent entities | 4 | 1 day |
| UI state/CORS | 4 | 1.5 days |
| REQ-I4: UserInfo | 5 | 1 day |
| REQ-I1: Discovery document | 5 | 0.5 days |
| REQ-O6: Password grant deprecation | 6 | 0.5 days |
| **Total** | | **~21–26 days** |

The revised estimate is higher than the original 15–18 days because it now accounts for:
- UI changes across Angular components and services
- The PKCE S256 bug fix
- DB migration work
- Nginx config changes
- `external-user-app` updates
- The `sub` change ripple effect across frontend and backend
- Refactoring the CASL ability factory for the new scope model
