# Token Architecture — Scope/Role Separation

The JWT token model separates OAuth scopes from internal roles. These are independent concerns and must never be mixed.

## Token Fields

| Field | Contains | Used By | Purpose |
|-------|----------|---------|---------|
| `scopes` (JWT) | OIDC values: `openid`, `profile`, `email` | OAuth client libraries | Client access control per RFC 6749 |
| `roles` (JWT) | Role enums: `SUPER_ADMIN`, `TENANT_ADMIN`, `TENANT_VIEWER` | CASL ability factory, UI | User authorization |
| `scope` (HTTP response) | Space-delimited OIDC scopes | OAuth client libraries | RFC 6749 §3.3 compliance |

## Rules

- `scopes` must only contain OIDC values. Never put role names in `scopes`.
- `roles` must only contain role enum names. Never put OIDC values in `roles`.
- CASL abilities are derived from `token.roles`, never from `token.scopes`.
- `isSuperAdmin` checks `roles.includes('SUPER_ADMIN')` combined with the super tenant domain. It does not check scopes.
- OAuth scope resolution is a two-way intersection: `requested ∩ client.allowedScopes`. Roles are not involved in scope computation.
- When `scope` is omitted from a token request, the client's full `allowedScopes` are used as the default.
- `TechnicalToken` (client_credentials) has `scopes` but no `roles` field — there is no user.
- `TenantToken` (user grants) has both `scopes` and `roles`.

## Key Services

- `ScopeResolverService.resolveScopes(requested, clientAllowed)` — two-way intersection, throws `invalid_scope` if empty.
- `ScopeNormalizer` — splits, deduplicates, sorts scope strings. Pure utility, no role awareness.
- `CaslAbilityFactory.createForSecurityContext(token)` — reads `token.roles` to build permission rules.
- `SecurityService.isSuperAdmin(token)` — checks `token.roles` for `SUPER_ADMIN` + super tenant domain.
- `AuthService.createUserAccessToken(user, tenant, scopes, roles)` — accepts scopes and roles as separate params.
- `TokenIssuanceService.issueToken(user, tenant, options)` — orchestrates scope resolution (two-way) and role fetching from DB, then passes both to auth service.

## Default Scopes

- Client allowed scopes default: `openid profile email`
- Technical token default scopes: `['openid', 'profile', 'email']`
- Do not include `tenant.read`, `tenant.write`, or any role-derived values in scope defaults.

## UI

- `DecodedToken` has both `scopes: string[]` and `roles: string[]`.
- `isSuperAdmin()` and `isTenantAdmin()` read from `roles`, not `scopes`.
- `TokenVerificationService` validates both `scopes` and `roles` are present arrays.
