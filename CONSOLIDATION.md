# Consolidation Plan — Reducing Entropy

This document tracks the technical debt reduction and consolidation
effort. The goal is to trim AI-generated bloat, eliminate redundancy,
and make the codebase more maintainable without changing external
behavior.

---

## Diagnosis Summary

| Source | Severity | Description |
|--------|----------|-------------|
| `oauth-token.controller.ts` | High | 816 lines, 7 routes, 20+ injected services — monolithic |
| Property-based tests | High | 87 files (45 % of all tests), many testing the same flows |
| Migrations | Medium | 29 files; could be squashed to ~5 logical milestones |
| `util/` vs `utils/` | Low | Two directories, same purpose, different AI sessions |
| `roleV2.controller.ts` | Medium | V2 endpoints added alongside V1 instead of consolidating |
| Duplicate `theme.service.ts` | Low | Byte-identical file in `_services/` and `component/theme/` |
| Inline Angular templates | Low | Only 1 `.html` file — all templates in backtick strings |
| Mirrored UI components | Medium | 8 pairs of near-identical dialogs between secure/super-admin |
| No barrel files | Low | All imports reference individual files directly |

---

## Phase 1 — Quick Wins

Low risk, high consistency gain. Can be done in any order.

### 1.1 Merge `util/` + `utils/` into single `util/` directory

**Files affected:**
- Move `srv/src/utils/slug.util.ts` → `srv/src/util/slug.util.ts`
- Move `srv/src/utils/redirect-uri.validator.ts` → `srv/src/util/redirect-uri.validator.ts`
- Update imports in `srv/src/services/app.service.ts` (2 imports)
- Delete `srv/src/utils/`

**Risk:** Trivial. No functional overlap between the files.

### 1.2 Remove duplicate `theme.service.ts`

**Files affected:**
- Delete `ui/src/app/_services/theme.service.ts`
- Update any imports pointing to `_services/theme.service` → `component/theme/theme.service`

**Risk:** Low. Check that no consumer still references the deleted path.

### 1.3 Add barrel files

Create `index.ts` in major directories for cleaner imports:

- `srv/src/controllers/index.ts`
- `srv/src/services/index.ts`
- `srv/src/auth/index.ts`
- `srv/src/entity/index.ts` (already has `entities.ts` — may just need renames)

**Risk:** Low. Barrels are additive; old import paths still work.

### 1.4 Delete empty `srv/src/test-utils/` directory

---

## Phase 2 — Structural Consolidation

Medium effort, clear architectural benefit.

### 2.1 Break up `oauth-token.controller.ts`

Split the 816-line monolith into focused controllers:

| Proposed File | Routes | Est. Lines |
|---|---|---|
| `authorize.controller.ts` | GET /authorize, POST /login, POST /consent | ~300 |
| `token.controller.ts` | POST /token, POST /exchange | ~200 |
| `session.controller.ts` | GET /session-info, GET /logout | ~100 |

**Shared logic** (private helpers today) moves to `auth/session-helper.service.ts`
or similar.

**Risk:** Medium. Route paths stay the same; only NestJS module registration
changes. Requires careful review of inter-helper dependencies.

### 2.2 Merge `roleV2.controller.ts` into `role.controller.ts`

**Files affected:**
- Add PATCH and GET-by-ID routes to `role.controller.ts`
- Make route prefix work for both `/api/tenant/my/role/:name` and `/api/role/:roleId`
  (either shared prefix with split paths, or two controller classes)
- Delete `roleV2.controller.ts`

**Risk:** Low to medium. Routes don't overlap; it's a file move with import
updates.

### 2.3 Squash migrations

Group 29 migrations into logical milestones:

| Milestone | Migrations | Topic |
|---|---|---|
| 1 | earliest ~6 | Initial schema + OIDC core |
| 2 | next ~6 | Refresh tokens, PKCE |
| 3 | next ~6 | Consent, sessions |
| 4 | next ~6 | Apps, subscriptions |
| 5 | latest ~5 | Tenant bits, per-app OAuth client |

**Risk:** Medium. Requires a fresh DB to apply. Must preserve column/table
names and data transformations exactly.

---

## Phase 3 — Test Consolidation

### 3.1 Audit property-based tests

Many of the 87 property tests exercise the same underlying auth-code flow.
Candidate merges (same domain → one file):

- `consent-*.property.spec.ts` (6+ files) → `consent-properties.spec.ts`
- `redirect-uri-*.property.spec.ts` (3+ files) → `redirect-uri-properties.spec.ts`
- `pkce-*.property.spec.ts` (3+ files) → `pkce-properties.spec.ts`
- `refresh-token-*.property.spec.ts` (10+ files) → `refresh-token-properties.spec.ts`
- `token-*.property.spec.ts` (8+ files) → `token-properties.spec.ts`

**Check:** First verify whether each property test catches unique invariants
or whether they're all exercising the same API calls.

### 3.2 Shrink test API client surface

| Client | Lines | Recommendation |
|---|---|---|
| `RoleClient` | 19 | Fold into `TenantClient` or keep — tiny |
| `TenantBitsClient` | 38 | Keep as-is — distinct domain |
| `SearchClient` | 45 | Keep |
| `AppClient` | 164 | Keep |
| `ClientEntityClient` | 68 | Rename to `OAuthClientClient` |
| `AdminTenantClient` | 150 | Keep — distinct domain |
| `PolicyClient` | 93 | Keep |
| `GroupClient` | 114 | Keep |
| `TenantClient` | 249 | Could split tenant management vs. onboarding |
| `UserClient` | 249 | Keep — used everywhere |

No strong consolidation pressure here; the client structure is reasonable.

---

## Phase 4 — UI Consolidation

### 4.1 Externalize inline templates

Move backtick-string templates to `.html` files and inline styles to `.scss`.
This affects every Angular component (177 TS files).

**Approach:**
1. New file per component: `foo.component.html`, `foo.component.scss`
2. Update `@Component({ template: \`...\` })` → `templateUrl: './foo.component.html'`
3. Add `styleUrls` if styles exist in the TS

**Risk:** Low per file, but high volume. Best tackled incrementally or
with a codemod.

### 4.2 Review secure / super-admin duplication policy

The current rule (from AGENTS.md) forbids sharing any components, dialogs,
or API services between the admin (super-admin) and user (secure) sections.
This produces 8 pairs of near-identical dialogs.

**Question to resolve:** Does this rule still add value, or can we introduce
shared base classes / composition patterns while keeping the UI sections
logically independent?

| Component Pair | secure/ | super-admin/ | Overlap |
|---|---|---|---|
| create-app | 1 file | 1 file | Form fields identical; API service differs |
| update-app | 1 file | 1 file | Same |
| create-group | 1 file | 1 file | Same |
| update-group | 1 file | 1 file | Same |
| create-policy-modal | 1 file | 1 file | Same |
| update-role-modal | 1 file | 1 file | Same |
| update-tenant | 1 file | 1 file | Same |
| test-webhook | 1 file | 1 file | Same |

**Possible approach:** Extract a shared `@shared/` library of base dialog
components. Secure and super-admin sections import the base and wire in
their own API service via dependency injection.

---

## Appendix — File Inventory

### Backend (`srv/src/`)

| Directory | Files |
|---|---|
| `controllers/` | 27 |
| `auth/` | 25 |
| `entity/` | 21 |
| `migrations/` | 29 |
| `services/` | 15 |
| `casl/` | 12 |
| `core/` | 8 |
| `mail/` | 6 |
| `exceptions/` | 6 |
| `log/` | 4 |
| `util/` | 3 |
| `utils/` | 2 |
| `config/` | 2 |
| `security/` | 2 |
| `validation/` | 2 |
| `dto/` | 1 |
| root | 5 |
| `test-utils/` | 0 (empty) |
| **Total** | **169** |

### Frontend (`ui/src/app/`)

| Area | Files |
|---|---|
| `_services/` | 19 |
| `component/` | ~50 |
| `open-pages/` | 12 |
| `secure/` | varies (6 feature modules + dialogs) |
| `super-admin/` | varies (6 feature modules + dialogs) |
| `shared/` | 4 |
| `_helpers/` | 3 |
| `model/` | 1 |
| `error-pages/` | 1 |
| root | 3 |
| **Total** | **~177** |

### Tests (`srv/tests/`)

| Area | Files |
|---|---|
| `properties/` | 87 |
| `auth/` | 48 |
| root | 28 |
| `integration/` | 12 |
| `api-client/` | 11 |
| `tenant/` | 4 |
| `me/` | 3 |
| `users/` | 3 |
| `policy/` | 3 |
| `features/` | 3 |
| `consent/` | 2 |
| `onboarding/` | 2 |
| `apps_&_subscription/` | 2 |
| `client/` | 1 |
| `group/` | 1 |
| `password-grant/` | 1 |
| `tenant-key-value/` | 1 |
| `third-party-compliance/` | 1 |
| `casl/` | 1 |
| `util/` | 1 |
| **Total** | **193** |
