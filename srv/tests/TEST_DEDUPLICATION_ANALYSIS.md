# Test Suite Deduplication Analysis

> **Purpose:** Identify overlapping test coverage in `srv/tests/` to reduce redundancy, speed up the test suite, and clarify ownership of each behavior.

---

## Executive Summary

The test suite has **~160 integration test files** covering OAuth/OIDC flows. Several areas have **2–6 files testing the same behavior** from slightly different angles, often because new focused test files were added without removing the overlapping assertions from older, broader files.

**Top deduplication opportunities (by impact):**

| Priority | Overlap Area | Files Involved | Estimated Redundant Tests |
|----------|-------------|----------------|--------------------------|
| 🔴 HIGH | Refresh token replay vs revocation | 3 files | ~8 tests |
| 🔴 HIGH | Auth code client_id binding | 3 files | ~4 tests |
| 🔴 HIGH | Authorize endpoint validation | 2 files | ~10 tests |
| 🟡 MED | OAuth error response format | 4 files | ~12 tests |
| 🟡 MED | Token claims & response shape | 4 files | ~8 tests |
| 🟡 MED | Redirect URI binding/validation | 4 files | ~6 tests |
| 🟡 MED | Nonce handling | 3 files | ~4 tests |
| 🟢 LOW | PKCE enforcement | 4 files | ~3 tests |
| 🟢 LOW | Auth code single-use | 4 files | ~4 tests |

---

## Detailed Overlap Analysis

### 1. 🔴 Refresh Token Replay vs Revocation (HIGH — near-duplicate files)

**Files:**
- `auth/refresh-token-replay.spec.ts` — "Refresh Token Replay Detection"
- `auth/refresh-token-revocation.spec.ts` — "Refresh Token Revocation"
- `auth/refresh-token-rotation.spec.ts` — "Refresh Token Rotation" (partial overlap)

**The problem:** `refresh-token-replay` and `refresh-token-revocation` test **the same mechanism** — replaying a consumed token triggers family-wide revocation. They share identical helper functions (`getFreshTokensAndCreds`, `refreshGrant`) and test the same scenarios:

| Scenario | replay.spec | revocation.spec |
|----------|-------------|-----------------|
| Consumed token → invalid_grant | ✅ test 1 | ✅ test 1 |
| Replay revokes entire family (A→B, replay A, B fails) | ✅ test 2 | ✅ test 1 |
| Chained rotation (A→B→C), replay A, C fails | ✅ test 3 | ✅ test 2 |
| Error response is generic (no token details) | ✅ test 4 | ✅ test 3 |
| Independent families unaffected | ❌ | ✅ test 4 |

Additionally, `refresh-token-rotation.spec.ts` test 3 ("old refresh token cannot be used again after rotation") is the same assertion as replay test 1.

**Recommendation:** Merge into a single file `auth/refresh-token-lifecycle.spec.ts` with sections:
1. Rotation basics (new token issued, old consumed, chaining)
2. Replay detection (consumed → invalid_grant, family revocation)
3. Isolation (independent families unaffected)
4. Error response security (no details leaked)

---

### 2. 🔴 Auth Code client_id Binding (HIGH — duplicate files)

**Files:**
- `auth/auth-code-binding.spec.ts` — "auth code parameter binding at creation" (Req 1.1–1.4)
- `auth/auth-code-client-binding.spec.ts` — "client_id binding verification at token exchange" (Req 3.1–3.2)
- `auth/redirect-uri-binding.spec.ts` — also tests redirect_uri binding at exchange

**The problem:** `auth-code-binding.spec.ts` already tests:
- client_id stored → matching succeeds ✅
- client_id mismatch → rejected ✅
- redirect_uri stored → matching succeeds ✅
- redirect_uri mismatch → rejected ✅
- code_challenge stored → matching succeeds ✅
- code_challenge mismatch → rejected ✅

`auth-code-client-binding.spec.ts` tests:
- client_id mismatch → rejected ✅ (DUPLICATE of above)
- client_id match → succeeds ✅ (DUPLICATE of above)

`redirect-uri-binding.spec.ts` tests:
- redirect_uri match → succeeds ✅ (DUPLICATE)
- redirect_uri mismatch → rejected ✅ (DUPLICATE)
- redirect_uri omitted → rejected ✅ (unique)
- Both match → succeeds ✅ (DUPLICATE)

**Recommendation:** Delete `auth-code-client-binding.spec.ts` entirely (100% covered by `auth-code-binding.spec.ts`). Move the "omitted redirect_uri" test from `redirect-uri-binding.spec.ts` into `auth-code-binding.spec.ts`, then delete `redirect-uri-binding.spec.ts`.

---

### 3. 🔴 Authorize Endpoint Validation (HIGH — overlapping scope)

**Files:**
- `auth/authorize-endpoint.spec.ts` — "GET /api/oauth/authorize" (20 tests)
- `authorize-validation.integration.spec.ts` — "AuthorizeSchema validation" (22 tests)

**The problem:** Both test the same endpoint (`GET /api/oauth/authorize`) with significant overlap:

| Scenario | authorize-endpoint | authorize-validation |
|----------|-------------------|---------------------|
| Unknown client_id → 400 invalid_request | ✅ | ✅ |
| Missing client_id → 400 invalid_request | ✅ | ✅ |
| Invalid redirect_uri → 400 | ✅ | ❌ (business logic) |
| Missing response_type → unsupported_response_type | ✅ | ✅ |
| Invalid response_type (token) → unsupported_response_type | ✅ | ✅ |
| Missing state → redirect with error | ✅ | ✅ |
| PKCE required, no challenge → redirect error | ✅ (×2) | ❌ |
| PKCE plain when require_pkce=true → error | ✅ (×2) | ❌ |
| Redirect URI omitted, single URI → default | ✅ | ✅ |
| Redirect URI omitted, multiple URIs → error | ✅ | ❌ |
| Scope forwarded | ✅ | ✅ |
| Default scope when omitted | ✅ | ✅ |
| Nonce forwarded | ✅ | ❌ |
| Nonce 512 boundary | ✅ | ✅ |
| Nonce 513 rejected | ✅ | ✅ |
| State preserved | ✅ | ❌ |
| code_challenge_method invalid → error | ❌ | ✅ |
| prompt values (login/none/consent) | ❌ | ✅ |
| max_age validation | ❌ | ✅ |
| resource parameter passthrough | ❌ | ✅ |
| Schema-before-business ordering | ❌ | ✅ |
| abortEarly behavior | ❌ | ✅ |

**Recommendation:** These have different focuses:
- `authorize-endpoint.spec.ts` = **business logic** (PKCE enforcement, redirect URI resolution, scope defaults, nonce passthrough, state round-trip)
- `authorize-validation.integration.spec.ts` = **schema validation layer** (parameter format, error codes, ordering, new params)

**Action:** Remove the overlapping tests from `authorize-endpoint.spec.ts` that are already covered by `authorize-validation.integration.spec.ts`:
- Remove: unknown/missing client_id, missing/invalid response_type, missing state, nonce boundary/rejection, scope default
- Keep: PKCE enforcement (business logic), redirect URI resolution (multi-URI), nonce forwarding, state round-trip, downgrade prevention

This reduces `authorize-endpoint.spec.ts` from 20 to ~12 tests with zero coverage loss.

---

### 4. 🟡 OAuth Error Response Format (MEDIUM — 4 files, same assertions)

**Files:**
- `auth/oauth-error-responses.spec.ts` — RFC 6749 §5.2 format on token endpoint (7 tests)
- `auth/oauth-error-login-verify.spec.ts` — RFC format on login/verify/exchange (5 tests)
- `auth/oauth-error-suppression.spec.ts` — no internal fields leak (8 tests)
- `auth/token-flows-negative.spec.ts` — negative cases, older style (19 tests)

**The problem:**
- `oauth-error-responses` and `oauth-error-suppression` both test "wrong password → no internal fields, only error/error_description" on the same endpoint with the same payload.
- `token-flows-negative` tests the same error scenarios (wrong password, wrong grant type, missing params) but only asserts status codes, not RFC format.
- `oauth-error-responses` tests headers (Cache-Control, Pragma, Content-Type) which `oauth-error-suppression` doesn't.

**Specific duplicates:**
| Scenario | error-responses | error-suppression | token-flows-negative |
|----------|----------------|-------------------|---------------------|
| Wrong password → 400 | ✅ | ✅ | ✅ |
| Unsupported grant_type → 400 | ✅ | ✅ | ✅ |
| Missing username → 400 | ✅ | ✅ | ❌ |
| Wrong client_secret → 401 | ✅ | ✅ (verify endpoint) | ✅ |

**Recommendation:** Merge `oauth-error-responses` and `oauth-error-suppression` into a single `auth/oauth-error-compliance.spec.ts` that tests:
1. RFC body shape (error + error_description only)
2. No internal field leakage
3. Correct headers (Cache-Control, Pragma)
4. Non-OAuth endpoints unchanged

Keep `token-flows-negative.spec.ts` as a **smoke test** for all invalid input combinations (it tests breadth, not format compliance). Remove the `console.log` statements from it.

---

### 5. 🟡 Token Claims & Response Shape (MEDIUM — overlapping assertions)

**Files:**
- `auth/token-claims-compliance.spec.ts` — JWT payload claims for password grant (8 tests)
- `auth/token-response-compliance.spec.ts` — response shape across all grants (20 tests)
- `auth/token-abstraction-flows.spec.ts` — scope/role separation across all grants (5 tests)
- `auth/token-flows.spec.ts` — basic happy-path (3 tests)

**The problem:**
- `token-claims-compliance` asserts: sub is UUID, aud is array, scope is string, no email/name, roles present, grant_type=password
- `token-abstraction-flows` asserts: sub is UUID (not email), scope is OIDC-only string, roles are internal-only, no email/name/userId/userTenant
- `token-flows` asserts: refresh works, client_credentials works, verify works (subset of `token-abstraction-flows`)

**Specific duplicates:**
| Assertion | claims-compliance | abstraction-flows | token-flows |
|-----------|------------------|-------------------|-------------|
| sub is UUID, not email | ✅ | ✅ | ❌ |
| scope is space-delimited OIDC string | ✅ | ✅ | ❌ |
| No email/name/userId in JWT | ✅ | ✅ | ❌ |
| roles present as array | ✅ | ✅ | ❌ |
| grant_type=password | ✅ | ✅ | ❌ |
| Refresh token grant works | ❌ | ✅ | ✅ |
| Client credentials works | ❌ | ✅ | ✅ |
| Verify endpoint works | ❌ | ✅ | ✅ |

**Recommendation:** 
- Delete `token-flows.spec.ts` — it's a legacy happy-path file fully superseded by `token-abstraction-flows.spec.ts` and `token-response-compliance.spec.ts`.
- Merge `token-claims-compliance.spec.ts` into `token-abstraction-flows.spec.ts` (add the unique assertions: aud is array, jti is UUID, nbf=iat, 11 required claims check, tenant object structure).
- Rename to `auth/token-jwt-compliance.spec.ts`.

---

### 6. 🟡 Redirect URI Validation (MEDIUM — spread across 4 files)

**Files:**
- `auth/redirect-uri-binding.spec.ts` — binding at token exchange (4 tests)
- `auth/redirect-uri-bypass.spec.ts` — regression: domain client_id bypass (2 tests)
- `auth/redirect-uri-validation.spec.ts` — comprehensive validation (18 tests)
- `auth/authorize-endpoint.spec.ts` — redirect URI resolution section (2 tests)

**The problem:** `redirect-uri-validation.spec.ts` already covers:
- Matching/non-matching URIs at authorize ✅
- Matching/non-matching URIs at token exchange ✅ (overlaps with `redirect-uri-binding`)
- Omission with single/multiple URIs ✅ (overlaps with `authorize-endpoint`)
- Case sensitivity, trailing slash ✅

`redirect-uri-binding.spec.ts` is a subset of `redirect-uri-validation.spec.ts` (and also of `auth-code-binding.spec.ts`).

**Recommendation:** 
- Delete `redirect-uri-binding.spec.ts` (fully covered by `redirect-uri-validation.spec.ts` and `auth-code-binding.spec.ts`)
- Move the 2 tests from `redirect-uri-bypass.spec.ts` into `redirect-uri-validation.spec.ts` as a "regression" section, then delete the file
- Remove the "redirect URI resolution" tests from `authorize-endpoint.spec.ts` (covered by `redirect-uri-validation` and `authorize-validation`)

---

### 7. 🟡 Nonce Handling (MEDIUM — 3 files)

**Files:**
- `auth/nonce-replay-protection.spec.ts` — nonce round-trip through auth code flow (6 tests)
- `id-token-integration.spec.ts` — section 8.4 "nonce round-trip" (2 tests)
- `id-token.property.spec.ts` — P4 "nonce echo-back" (1 property test)

**The problem:**
| Scenario | nonce-replay-protection | id-token-integration |
|----------|------------------------|---------------------|
| Nonce provided → appears in ID token | ✅ (tests 1, 3) | ✅ |
| Nonce omitted → absent from ID token | ✅ (tests 2, 4) | ✅ |
| Nonce 512 boundary | ✅ | ❌ |
| Nonce 513 rejected | ✅ | ❌ |

Tests 1+3 and 2+4 in `nonce-replay-protection.spec.ts` are themselves duplicates (Req 1.1 ≡ Req 2.1, Req 1.2 ≡ Req 2.2).

**Recommendation:**
- Remove section 8.4 from `id-token-integration.spec.ts` (nonce round-trip is fully covered by `nonce-replay-protection.spec.ts`)
- Deduplicate within `nonce-replay-protection.spec.ts`: merge tests 1+3 into one, merge tests 2+4 into one (they assert the same thing with different describe labels)
- Keep the property test (different testing approach — unit vs integration)

---

### 8. 🟢 PKCE Enforcement (LOW — different layers)

**Files:**
- `auth/pkce-format-validation.spec.ts` — verifier format at token endpoint (9 tests)
- `auth/pkce-s256-enforcement.spec.ts` — S256 enforcement at authorize (6 tests)
- `auth/pkce-s256-verification.spec.ts` — S256 round-trip (3 tests)
- `auth/authorize-endpoint.spec.ts` — PKCE enforcement section (4 tests)

**The problem:** `authorize-endpoint.spec.ts` PKCE section overlaps with `pkce-s256-enforcement.spec.ts`:
- "require_pkce=true, no challenge → error" — tested in both
- "require_pkce=true, plain method → error" — tested in both

**Recommendation:** Remove the PKCE enforcement section from `authorize-endpoint.spec.ts` (4 tests) since `pkce-s256-enforcement.spec.ts` covers it more thoroughly. The three PKCE files have distinct focuses (format, enforcement, verification) and should remain separate.

---

### 9. 🟢 Auth Code Single-Use (LOW — different angles)

**Files:**
- `auth/auth-code-single-use.spec.ts` — dedicated single-use (2 tests)
- `auth/auth-code-concurrency.spec.ts` — concurrency variant (1 test)
- `auth/auth-code-expiration.spec.ts` — includes "redeemed code rejected" (1 overlapping test)
- `auth/auth-code.service.spec.ts` — includes single-use test (1 overlapping test)

**The problem:** "Second redemption of same code → invalid_grant" is tested in 3 files.

**Recommendation:** Keep `auth-code-single-use.spec.ts` as the canonical test. Remove the overlapping assertion from `auth-code-expiration.spec.ts` (test 2: "redeemed code rejected") and `auth-code.service.spec.ts` (single-use test). Keep `auth-code-concurrency.spec.ts` (tests atomicity under race conditions — different concern).

---

## Summary of Recommended Actions

### Files to DELETE (fully redundant):
1. `auth/auth-code-client-binding.spec.ts` → covered by `auth-code-binding.spec.ts`
2. `auth/redirect-uri-binding.spec.ts` → covered by `redirect-uri-validation.spec.ts` + `auth-code-binding.spec.ts`
3. `auth/token-flows.spec.ts` → covered by `token-abstraction-flows.spec.ts` + `token-response-compliance.spec.ts`

### Files to MERGE:
4. `auth/refresh-token-replay.spec.ts` + `auth/refresh-token-revocation.spec.ts` → `auth/refresh-token-lifecycle.spec.ts`
5. `auth/oauth-error-responses.spec.ts` + `auth/oauth-error-suppression.spec.ts` → `auth/oauth-error-compliance.spec.ts`
6. `auth/token-claims-compliance.spec.ts` into `auth/token-abstraction-flows.spec.ts` → rename to `auth/token-jwt-compliance.spec.ts`
7. `auth/redirect-uri-bypass.spec.ts` into `auth/redirect-uri-validation.spec.ts`

### Tests to REMOVE from existing files:
8. `authorize-endpoint.spec.ts`: remove ~8 tests overlapping with `authorize-validation.integration.spec.ts` and PKCE files
9. `id-token-integration.spec.ts`: remove section 8.4 (nonce round-trip)
10. `nonce-replay-protection.spec.ts`: deduplicate internal tests (6 → 4)
11. `auth-code-expiration.spec.ts`: remove "redeemed code rejected" test
12. `auth-code.service.spec.ts`: remove single-use test
13. `token-flows-negative.spec.ts`: remove `console.log` statements (not a dedup, but cleanup)

### Estimated Impact:
- **~30 redundant tests removed**
- **3 files deleted, 4 file merges**
- **~8 tests removed from other files**
- **Net reduction: ~35–40 tests** with zero coverage loss
- **Faster CI:** fewer SharedTestFixture instantiations (each creates a NestJS app + DB)

---

## File-by-File Reference

Below is a quick-reference of what each test file covers (for future maintenance):

### Root-level integration tests
| File | Focus |
|------|-------|
| `authorize-validation.integration.spec.ts` | Schema validation layer for /authorize |
| `id-token-integration.spec.ts` | ID token generation (claims, scope gating, at_hash, auth_time) |
| `id-token.property.spec.ts` | Property-based: IdTokenService invariants |
| `claims-resolver.property.spec.ts` | Property-based: scope-to-claims mapping |
| `jwks.integration.spec.ts` | JWKS endpoint (RFC 7517, caching, tenant isolation) |
| `key-rotation.integration.spec.ts` | Key rotation lifecycle |
| `token-kid.integration.spec.ts` | JWT kid header, JWKS matching, verification |
| `offline-access.integration.spec.ts` | offline_access scope, refresh token gating |
| `userinfo.integration.spec.ts` | /userinfo endpoint (scope-based claims, errors) |
| `cors-origin-restriction.integration.spec.ts` | CORS origin validation from redirect_uris |
| `discovery.integration.spec.ts` | OIDC Discovery metadata |
| `tenant-isolation.integration.spec.ts` | Multi-tenant cryptographic isolation |

### auth/ — Token
| File | Focus |
|------|-------|
| `token-abstraction-flows.spec.ts` | Scope/role separation across all grants |
| `token-claims-compliance.spec.ts` | JWT payload structure (RFC 9068) |
| `token-response-compliance.spec.ts` | Response shape across all grants (RFC 6749 §5.1) |
| `token-validation-claims.spec.ts` | Token validation pipeline (malformed JWT rejection) |
| `token-clock-skew.spec.ts` | Clock skew config and startup validation |
| `token-introspection.spec.ts` | /introspect endpoint (RFC 7662) |
| `token-revocation.integration.spec.ts` | /revoke and /logout (RFC 7009) |
| `token-exchange.spec.ts` | /exchange (cross-tenant) |
| `token-flows-negative.spec.ts` | Negative smoke tests (all invalid inputs) |
| `token-ambiguous-tenant.spec.ts` | Tenant ambiguity resolution |

### auth/ — Refresh Token
| File | Focus |
|------|-------|
| `refresh-token-rotation.spec.ts` | Rotation mechanics (new token, old consumed, chaining) |
| `refresh-token-replay.spec.ts` | Replay detection → family revocation |
| `refresh-token-revocation.spec.ts` | Family-wide revocation (MERGE with above) |
| `refresh-token-client-binding.spec.ts` | Client_id binding on refresh |
| `refresh-token-expiry.spec.ts` | Sliding window expiry |
| `refresh-token-grace-window.spec.ts` | Grace window for duplicate requests |
| `refresh-token-issuance.spec.ts` | Initial issuance (opaque, present in response) |
| `refresh-token-scope.spec.ts` | Scope down-scoping on refresh |

### auth/ — Auth Code
| File | Focus |
|------|-------|
| `auth-code-flow.spec.ts` | Happy-path auth code flow |
| `auth-code-binding.spec.ts` | Parameter binding (client_id, redirect_uri, scope, PKCE) |
| `auth-code-single-use.spec.ts` | Single-use enforcement |
| `auth-code-concurrency.spec.ts` | Atomic single-use under race conditions |
| `auth-code-expiration.spec.ts` | Expiration window |
| `auth-code-cleanup.spec.ts` | Cleanup cron preconditions |
| `auth-code-reuse-bug-condition.spec.ts` | Regression: verify rejects used/expired |
| `auth-code-reuse-preservation.spec.ts` | Regression: valid codes still work |
| `auth-code.service.spec.ts` | Service-level lifecycle (creation, PKCE, subscriber_tenant_hint) |

### auth/ — PKCE
| File | Focus |
|------|-------|
| `pkce-format-validation.spec.ts` | code_verifier format (length, charset) |
| `pkce-s256-enforcement.spec.ts` | S256 enforcement at authorize |
| `pkce-s256-verification.spec.ts` | S256 challenge/verifier round-trip |

### auth/ — Redirect URI
| File | Focus |
|------|-------|
| `redirect-uri-validation.spec.ts` | Comprehensive validation (authorize + token) |
| `redirect-uri-bypass.spec.ts` | Regression: domain alias bypass |

### auth/ — Resource Indicators
| File | Focus |
|------|-------|
| `resource-indicator-audience.spec.ts` | Audience claim construction |
| `resource-indicator-auth-code-flow.spec.ts` | Resource through auth code flow |
| `resource-indicator-validation.spec.ts` | Resource parameter validation |

### auth/ — OAuth Errors
| File | Focus |
|------|-------|
| `oauth-error-responses.spec.ts` | RFC 6749 §5.2 format + headers |
| `oauth-error-login-verify.spec.ts` | RFC format on login/verify/exchange |
| `oauth-error-suppression.spec.ts` | No internal field leakage |
| `oauth-www-authenticate.spec.ts` | WWW-Authenticate header (RFC 6750 §3) |

### auth/ — Other
| File | Focus |
|------|-------|
| `authorize-endpoint.spec.ts` | Authorize endpoint business logic |
| `nonce-replay-protection.spec.ts` | Nonce round-trip to ID token |
| `id-token-audience.integration.spec.ts` | ID token aud/azp, id_token_hint |
| `membership-verification.integration.spec.ts` | Tenant membership enforcement |
| `forgot-reset-password.spec.ts` | Forgot/reset password flow |
| `role.guard.spec.ts` | RoleGuard unit test |

### integration/
| File | Focus |
|------|-------|
| `login-session.integration.spec.ts` | Login session creation/validation |
| `login-session-expiry.integration.spec.ts` | Session expiry |
| `login-session-logout.integration.spec.ts` | Session logout |
| `login-session-threading.integration.spec.ts` | Session threading (multi-tab) |
| `login-session-token-claims.integration.spec.ts` | Session claims in tokens |
| `session-auth-flow.integration.spec.ts` | Session-based auth code flow |
| `token-abstraction-wiring.spec.ts` | Token abstraction DI wiring |
| `shared-infrastructure.spec.ts` | Shared infra (SMTP, webhook) |
| `client-credentials-migration.spec.ts` | Client credentials migration |
| `permission-migration.spec.ts` | Permission migration |
| `smtp-adapter-e2e.spec.ts` | SMTP adapter |
| `webhook-adapter-e2e.spec.ts` | Webhook adapter |

### Other folders
| Folder/File | Focus |
|-------------|-------|
| `consent/` | Consent flow + service |
| `client/` | Client CRUD |
| `onboarding/` | Tenant onboarding, app-owned roles |
| `tenant/` | Tenant admin/super-admin/viewer roles |
| `users/` | User CRUD, lock/unlock |
| `me/` | Self-service, registration |
| `policy/` | Permissions, policy flow |
| `password-grant/` | Password grant deprecation |
| `group/` | User groups |
| `tenant-key-value/` | Tenant bits (feature flags) |
| `properties/` | ~90 property-based tests (no overlap with integration tests) |
