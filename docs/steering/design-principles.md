---
inclusion: manual
---

# Design Principles

This is an authorization and authentication server. Every decision must reflect that.

## 0. RFC Compliance

This server implements OAuth 2.0 and OpenID Connect. The RFCs are the source of truth for protocol behavior — not
convenience, not internal consistency preferences.

- Follow RFC 6749 (OAuth 2.0), RFC 7636 (PKCE), and OpenID Connect Core 1.0 for all protocol-facing behavior: error
  codes, error delivery method (JSON vs redirect), parameter requirements, and default values.
- The authorize endpoint error model has two phases per RFC 6749 §4.1.2.1:
    - **Pre-redirect errors** (JSON 400, never redirect): unknown `client_id`, unregistered `redirect_uri`. These fire
      before we have a safe URI to redirect to.
    - **Post-redirect errors** (302 redirect with error params): everything else — missing `state`, invalid `scope`,
      PKCE violations, nonce violations. Once the `redirect_uri` is confirmed safe, errors go there.
- `scope` is optional per RFC 6749 §3.3. When omitted, default to the client's `allowedScopes`.
- `redirect_uri` is optional per RFC 6749 §3.1.2.3 when the client has exactly one registered URI.
- `response_type` missing or unsupported both use the `unsupported_response_type` error code per RFC 6749 §4.1.2.1.
- When a spec requirement conflicts with an RFC, the RFC wins. Update the spec to match.

## 1. Safety First

Security is the top priority — above convenience, speed of delivery, or elegance.

- Never expose sensitive data (tokens, secrets, passwords) in logs, error messages, or API responses.
- Default to deny. Access must be explicitly granted, never implicitly assumed.
- Validate and sanitize all inputs at the boundary (controllers, guards, middleware). Trust nothing from the outside.
- Use constant-time comparisons for secrets and tokens to prevent timing attacks.
- Follow the principle of least privilege everywhere — services, database roles, API scopes.
- Never store plaintext secrets. Hash passwords with bcrypt (or argon2). Encrypt sensitive fields at rest when needed.
- Token expiry, rotation, and revocation must always be considered. No indefinite tokens.
- Fail securely. On error, return minimal information to the caller and log the detail internally.

## 2. Separation of Concerns

Clean boundaries between layers keep the codebase auditable and secure.

- Controllers handle HTTP concerns only — request parsing, validation, response shaping. No business logic.
- Services own the business logic — authorization decisions, token lifecycle, tenant management.
- Repositories handle data access only. No business rules in queries.
- Guards and middleware handle cross-cutting auth checks. Don't scatter auth logic across services.
- Keep crypto and token operations in dedicated utility modules, not inline in services.
- Each module (auth, tenants, users, tokens) should be self-contained with clear public interfaces.

## 3. UI Section Isolation — Admin vs User

The admin section and the normal user (secure) section must be completely independent. No shared components, no shared
API calls.

- Never share UI components (widgets, form elements, dialogs, tables) between the admin section and the user section. If
  both need a similar widget, create a separate copy in each section.
- API call services used by admin pages must live under the admin module. API call services used by user pages must live
  under the user/secure module. No cross-imports.
- This prevents accidental privilege escalation where a user-facing component inadvertently calls an admin API endpoint,
  or an admin component leaks into a user route.
- Each section should have its own routing, guards, and module boundaries. Treat them as two separate apps that happen
  to share a shell.
- When in doubt, duplicate rather than abstract. A small amount of code duplication is far safer than a shared component
  that serves two trust levels.

## 4. Design for Auditability

An auth server must be explainable and traceable.

- Every security-relevant action (login, token issue, permission change, failed auth) should produce a log entry.
- Prefer explicit code over clever abstractions. Reviewers need to follow the security flow without guessing.
- Keep authorization rules declarative and centralized (e.g., CASL policies) rather than scattered through handlers.

# UI Conventions

Concrete patterns for working in the Angular frontend (`ui/`).

## Tenant Context

- Normal user flows derive tenant from the JWT token via `SessionService.userTenantId()`. The user never picks a tenant.
- Admin flows must always pass tenant IDs explicitly. Never fall back to the logged-in user's tenant — admin actions are
  cross-tenant by nature.
- Backend user-scoped routes use `/tenant/my/...`. Admin-scoped routes use `/admin/tenant/{tenantId}/...`.

## Dialogs

- Dialogs are plain components. Data is passed in via `ModalService.open(Component, { initData: { key: value } })`,
  which sets properties directly on the component instance.
- Do not share dialog components between the admin section and the tenant detail/user section. If both need a similar
  dialog, create separate copies (e.g., `create-app.component.ts` for tenant-scoped use, `create-app-admin.component.ts`
  for admin cross-tenant use). This follows the UI Section Isolation principle.
- Dialog results use `activeModal.close(data)` for success and `activeModal.dismiss()` for cancellation/error.

## Data Loading

- List pages use the `DataSource` / `RestApiModel` pattern backed by `POST /api/search/{Entity}` with
  `{ pageNo, pageSize, where, orderBy, expand }`.
- For simple one-off data fetches inside dialogs or components, use `HttpClient` directly with `lastValueFrom()` — no
  need to wire up a full `DataSource`.

## Services

- `TenantService` — user-scoped, operates on "my" tenant. Used in the secure/user section.
- `AdminTenantService` — admin-scoped, takes explicit `tenantId` params. Used only in the admin section.
- `AppService`, `UserService`, etc. — shared services are acceptable only when the backend endpoint is the same for both
  sections. If admin needs different endpoints, create an admin-specific service.

## Authorization in the UI

- CASL abilities are loaded from the backend and stored via `SessionService.savePermissions()`.
- Use the `ablePure` pipe in templates for showing/hiding UI elements (e.g.,
  `[disabled]="!('create' | ablePure: 'Tenant')"`).
- UI authorization is cosmetic only — the backend always re-validates via `SecurityService`.
