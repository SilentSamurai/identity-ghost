# Architecture Overview

## Overview

The Auth Server is a multi-tenant OAuth 2.0 / OpenID Connect authorization server. It issues and validates JWTs, manages tenant isolation through per-tenant RSA key pairs, and enforces authorization through a CASL-based role system that is completely independent from OAuth scopes.

This document describes the high-level architecture: how tenants are isolated, how tokens are structured, how scopes and roles are separated, and how the major components fit together.

---

## System Components

```
┌─────────────────────────────────────────────────────────────────────┐
│                          Auth Server                                │
│                                                                     │
│  ┌──────────────────┐        ┌──────────────────────────────────┐   │
│  │  Angular Frontend │        │        NestJS Backend            │   │
│  │  (ui/)            │◄──────►│        (srv/)                    │   │
│  │                   │  HTTP  │                                  │   │
│  │  - Login UI       │        │  - OAuth 2.0 / OIDC endpoints    │   │
│  │  - Consent UI     │        │  - Token issuance & validation   │   │
│  │  - Admin panel    │        │  - Tenant management API         │   │
│  │  - Tenant portal  │        │  - User management API           │   │
│  └──────────────────┘        │  - CASL authorization            │   │
│                               └──────────────┬───────────────────┘   │
│                                              │                       │
│                               ┌──────────────▼───────────────────┐   │
│                               │         PostgreSQL               │   │
│                               │                                  │   │
│                               │  - Users, tenants, members       │   │
│                               │  - OAuth clients                 │   │
│                               │  - Per-tenant RSA key pairs      │   │
│                               │  - Refresh token chains          │   │
│                               │  - Login sessions & consents     │   │
│                               │  - CASL authorization policies   │   │
│                               └──────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘

         ▲                                          ▲
         │ OAuth / OIDC flows                       │ Token verification
         │                                          │ (JWKS fetch)
┌────────┴────────┐                      ┌──────────┴──────────┐
│  OAuth Clients   │                      │  Resource Servers   │
│  (web apps,      │                      │  (your APIs)        │
│   mobile apps,   │                      │                     │
│   SPAs)          │                      │                     │
└─────────────────┘                      └─────────────────────┘
```

### NestJS Backend (`srv/`)

The backend handles all protocol-level concerns:

- **OAuth 2.0 endpoints** — `/api/oauth/authorize`, `/api/oauth/token`, `/api/oauth/verify`
- **OIDC endpoints** — `/{tenantDomain}/.well-known/openid-configuration`, `/{tenantDomain}/.well-known/jwks.json`, `/api/oauth/userinfo`
- **Token lifecycle** — issuance, rotation, revocation, introspection
- **Tenant management** — registration, credentials, member management
- **User management** — profile, email/password changes, consent
- **Authorization** — CASL ability factory reads roles from tokens to enforce access control

### Angular Frontend (`ui/`)

The frontend provides the user-facing flows that OAuth clients redirect to:

- **Login UI** — collects credentials, handles MFA, creates login sessions
- **Consent UI** — presents scope consent screen to users
- **Admin panel** — super-admin interface for managing all tenants
- **Tenant portal** — tenant-admin interface for managing members, clients, and roles

The admin section and the user/tenant section are completely isolated — no shared components, no shared API services.

### PostgreSQL Database

All persistent state lives in PostgreSQL. Key tables:

| Table | Purpose |
|-------|---------|
| `tenants` | Tenant registry with domain and legacy credentials |
| `tenant_keys` | Per-tenant RSA key pairs with versioning and rotation support |
| `users` | User accounts (shared across tenants) |
| `tenant_members` | Many-to-many join between users and tenants |
| `clients` | OAuth client registrations scoped to a tenant |
| `refresh_tokens` | Refresh token rotation chains with replay detection |
| `login_sessions` | Authenticated user sessions linked to auth codes and refresh tokens |
| `user_consents` | Stored OAuth scope consent per user per client |
| `roles` / `user_roles` | Role assignments (internal, tenant-local, and app-owned) |
| `authorization` | CASL policy rules (action, subject, conditions) per role |

See [Database Schema](database-schema.md) for the full table reference.

---

## Multi-Tenant Model

### Tenant Isolation

Every tenant is a fully isolated authorization domain. Tenants do not share users, clients, roles, or signing keys.

```
┌─────────────────────────────────────────────────────────────────┐
│  Super Tenant (auth.server.com)                                 │
│                                                                 │
│  SUPER_ADMIN users — can manage all tenants via admin panel     │
│  Issues tokens for auth server management operations            │
└─────────────────────────────────────────────────────────────────┘

┌──────────────────────────┐    ┌──────────────────────────┐
│  Tenant A                │    │  Tenant B                │
│  domain: acme.example.com│    │  domain: corp.example.com│
│                          │    │                          │
│  - Own RSA key pair      │    │  - Own RSA key pair      │
│  - Own users & members   │    │  - Own users & members   │
│  - Own OAuth clients     │    │  - Own OAuth clients     │
│  - Own roles & policies  │    │  - Own roles & policies  │
└──────────────────────────┘    └──────────────────────────┘
```

Each tenant has:

- **A unique domain** (e.g., `acme.example.com`) — used as the tenant identifier in all OAuth/OIDC endpoints
- **Its own RSA key pair** stored in `tenant_keys` — tokens are signed with the tenant's private key and verified using the tenant's public key from its JWKS endpoint
- **Its own set of users** via `tenant_members` — a user account can belong to multiple tenants
- **Its own OAuth clients** — client registrations are scoped to a single tenant
- **Its own roles and CASL policies** — role definitions and authorization rules are tenant-scoped

### Shared-Issuer Model

All tenants share a single `iss` (issuer) claim value in their tokens. Tenant isolation is enforced through:

1. **Per-tenant RSA key pairs** — each tenant's tokens are signed with a unique key identified by a `kid` in the JWT header
2. **`tenant_id` claim** — every token contains the UUID of the issuing tenant
3. **Tenant-scoped JWKS endpoint** — `/{tenantDomain}/.well-known/jwks.json` returns only that tenant's public keys

Resource servers must verify both the cryptographic signature **and** the `tenant_id` claim to prevent cross-tenant token reuse. See [Resource Server Verification](resource-server-verification.md) for the full verification checklist.

### Super Tenant

The super tenant (`auth.server.com`) is a special tenant whose `SUPER_ADMIN` users can manage all other tenants. Super-admin operations include creating tenants, managing tenant members, and accessing cross-tenant data via the admin panel.

Super-admin status is determined by checking `token.roles.includes('SUPER_ADMIN')` combined with the super tenant domain — it is never derived from OAuth scopes.

### Tenant Registration

New tenants are created via `POST /api/register-domain`. This endpoint creates the tenant record, generates an RSA key pair, creates the initial admin user, and sends a verification email. See [Getting Started](getting-started.md) for a walkthrough.

---

## Token Architecture

The Auth Server issues three types of tokens per the OAuth 2.0 and OpenID Connect specifications.

### Access Tokens

Access tokens are short-lived JWTs signed with RS256 using the issuing tenant's private key.

**Algorithm:** RS256 (RSA Signature with SHA-256)  
**Default lifetime:** 1 hour  
**Format:** JWT (JSON Web Token)

**Claims:**

| Claim | Description | Example |
|-------|-------------|---------|
| `sub` | Subject — user UUID, or `oauth` for technical tokens | `550e8400-e29b-41d4-a716-446655440000` |
| `email` | User email address (requires `email` scope) | `alice@example.com` |
| `name` | User display name (requires `profile` scope) | `Alice Admin` |
| `tenant_id` | Issuing tenant UUID | `a1b2c3d4-e5f6-7890-abcd-ef1234567890` |
| `scope` | Space-delimited granted OIDC scopes | `openid profile email` |
| `roles` | Array of role names (user tokens only — absent in technical tokens) | `["TENANT_ADMIN"]` |
| `client_id` | OAuth client that requested the token | `acme.example.com` |
| `iss` | Issuer — always the Auth Server domain | `auth.server.com` |
| `aud` | Audience — array of intended recipients | `["auth.server.com"]` |
| `exp` | Expiration time (Unix timestamp) | `1700003600` |
| `iat` | Issued at (Unix timestamp) | `1700000000` |
| `jti` | JWT ID — unique token identifier | `550e8400-...` |
| `grant_type` | OAuth grant used to obtain the token | `authorization_code` |

**Example access token payload (user token):**

```json
{
    "sub": "550e8400-e29b-41d4-a716-446655440000",
    "email": "alice@example.com",
    "name": "Alice Admin",
    "tenant_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "scope": "openid profile email",
    "roles": ["TENANT_ADMIN"],
    "client_id": "acme.example.com",
    "iss": "auth.server.com",
    "aud": ["auth.server.com"],
    "exp": 1700003600,
    "iat": 1700000000,
    "jti": "b2c3d4e5-f6a7-8901-bcde-f12345678901",
    "grant_type": "authorization_code"
}
```

**Example access token payload (technical token — `client_credentials` grant):**

```json
{
    "sub": "oauth",
    "tenant_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "scope": "openid profile email",
    "client_id": "acme.example.com",
    "iss": "auth.server.com",
    "aud": ["auth.server.com"],
    "exp": 1700003600,
    "iat": 1700000000,
    "grant_type": "client_credentials"
}
```

Technical tokens have no `roles` field — there is no user context.

### Refresh Tokens

Refresh tokens are opaque strings stored as hashed values in the database. They are not JWTs.

**Format:** Opaque string (hashed in DB)  
**Default sliding lifetime:** 7 days (resets on each rotation)  
**Default absolute lifetime:** 30 days (hard maximum from initial login)  
**Rotation:** Single-use — each use invalidates the old token and issues a new one

Key properties:

- **Token families** — all tokens from a single login event form a family linked by `family_id`
- **Replay detection** — presenting a previously consumed token revokes the entire family
- **Scope down-scoping** — clients can request a narrower scope on refresh; scope can only be narrowed, never broadened
- **Session linkage** — refresh tokens carry a `sid` linking them to the originating login session

See [Refresh Token Rotation](refresh-token-rotation.md) for the full rotation lifecycle and replay detection details.

### ID Tokens

ID tokens are JWTs issued alongside access tokens when the `openid` scope is requested. They are intended for the OAuth client (relying party), not for resource servers.

**Algorithm:** RS256  
**Audience:** Always `[clientId]` — the requesting client's ID  
**Standard:** OpenID Connect Core 1.0

**Claims:**

| Claim | Description | Example |
|-------|-------------|---------|
| `sub` | Subject — user UUID | `550e8400-e29b-41d4-a716-446655440000` |
| `email` | User email (requires `email` scope) | `alice@example.com` |
| `name` | Display name (requires `profile` scope) | `Alice Admin` |
| `nonce` | Replay protection value from the authorization request | `n-0S6_WzA2Mj` |
| `iss` | Issuer | `auth.server.com` |
| `aud` | Audience — always `[clientId]` | `["acme.example.com"]` |
| `azp` | Authorized party — always the requesting client ID | `acme.example.com` |
| `exp` | Expiration time | `1700003600` |
| `iat` | Issued at | `1700000000` |

ID tokens do not contain `roles` or `scope`. They are identity assertions, not authorization grants.

### Per-Tenant Key Pairs

Each tenant's tokens are signed with a unique RSA key pair stored in the `tenant_keys` table. The JWT header includes a `kid` (Key ID) that identifies which key was used.

```
JWT Header:
{
    "alg": "RS256",
    "kid": "a1b2c3d4e5f6g7h8"   ← identifies the tenant's signing key
}
```

Public keys are published at the tenant-scoped JWKS endpoint:

```
GET /{tenantDomain}/.well-known/jwks.json
```

Key rotation is supported — old keys remain in the JWKS until all tokens signed with them have expired. See [JWKS Endpoint](jwks-endpoint.md) for caching recommendations.

---

## Scope and Role Separation

This is one of the most important architectural decisions in the Auth Server. **OAuth scopes and internal roles are completely independent and must never be mixed.**

### The Separation

| Field | Contains | Used By | Purpose |
|-------|----------|---------|---------|
| `scope` (JWT claim) | OIDC values: `openid`, `profile`, `email` | OAuth client libraries | Client access control per RFC 6749 |
| `roles` (JWT claim) | Role enums: `SUPER_ADMIN`, `TENANT_ADMIN`, `TENANT_VIEWER`, custom roles | CASL ability factory, UI | User authorization within the auth server and applications |

### OAuth Scopes

Scopes follow RFC 6749 and the OpenID Connect specification. They control what user information an OAuth client is permitted to access:

- `openid` — required for OIDC flows; enables ID token issuance
- `profile` — grants access to `name` claim in tokens and the userinfo endpoint
- `email` — grants access to `email` claim in tokens and the userinfo endpoint

Scope resolution is a two-way intersection: `requested ∩ client.allowedScopes`. If the intersection is empty, the server returns `invalid_scope`. When `scope` is omitted from a token request, the client's full `allowedScopes` are used as the default.

**Scopes never contain role names. Role names never appear in the `scope` field.**

### Internal Roles

Roles control what a user is authorized to do within the auth server and in subscribed applications. They are fetched from the database at token issuance time and embedded in the `roles` array.

**Built-in roles:**

| Role | Scope | Description |
|------|-------|-------------|
| `SUPER_ADMIN` | Super tenant only | Full access to all tenants and admin operations |
| `TENANT_ADMIN` | Single tenant | Full access to tenant management (members, clients, roles) |
| `TENANT_VIEWER` | Single tenant | Read-only access to tenant data |

**Custom roles:**

Tenants can define additional roles for their own use or for applications they publish. Custom roles appear in the `roles` array alongside built-in roles.

- **Tenant-local roles** — scoped to a single tenant, format: `roleName` (e.g., `reviewer`)
- **App-owned roles** — defined by an app owner tenant, namespaced as `appName:roleName` (e.g., `todo-app:editor`)

See [App-Owned Roles](app-owned-roles.md) for the full role namespacing and policy resolution model.

### Why They Are Separate

OAuth scopes and roles serve different purposes and different consumers:

- **Scopes** are for OAuth clients — they tell the client what data it can request about the user. They are a protocol-level concept defined by RFC 6749 and OpenID Connect.
- **Roles** are for authorization — they tell the server (and resource servers) what the user is allowed to do. They are an application-level concept enforced by CASL.

Mixing them would create ambiguity: a scope like `admin` would be meaningless to an OAuth client library, and an OIDC scope like `openid` would be meaningless to a CASL ability factory. Keeping them separate means each system reads only what it understands.

```
Token request:
  scope=openid profile email   ← OAuth client requests OIDC scopes

Token issued:
  scope: "openid profile email"   ← OIDC scopes for the client
  roles: ["TENANT_ADMIN"]         ← Authorization roles for CASL

OAuth client reads:   token.scope  → knows it can call /userinfo
CASL reads:           token.roles  → knows the user is a TENANT_ADMIN
```

### CASL Authorization

The CASL ability factory (`CaslAbilityFactory`) reads `token.roles` to build permission rules. It never reads `token.scope`. Authorization decisions in the backend are always role-based, never scope-based.

The UI also derives authorization state from `token.roles`:
- `isSuperAdmin()` checks `roles.includes('SUPER_ADMIN')` combined with the super tenant domain
- `isTenantAdmin()` checks `roles.includes('TENANT_ADMIN')`

---

## OAuth 2.0 Grant Types

The Auth Server supports four grant types:

| Grant Type | Use Case | Issues Refresh Token |
|------------|----------|---------------------|
| `authorization_code` | Web apps, SPAs, native apps — user-interactive flows | Yes |
| `client_credentials` | Server-to-server (technical tokens, no user context) | No |
| `refresh_token` | Renewing access tokens without re-authentication | Yes (rotated) |
| `password` | Direct credential exchange (legacy/trusted clients only) | Yes |

The recommended flow for most applications is `authorization_code` with PKCE (RFC 7636). See [Getting Started](getting-started.md) for a complete walkthrough.

---

## Request Flow: Authorization Code with PKCE

The following diagram shows the complete flow from login to token issuance:

```
Client App          Browser           Auth Server (NestJS)        Database
    │                  │                      │                       │
    │── /authorize ───►│                      │                       │
    │   (redirect)     │── GET /authorize ───►│                       │
    │                  │                      │── Validate client ───►│
    │                  │                      │◄── client record ─────│
    │                  │◄── Redirect to UI ───│                       │
    │                  │                      │                       │
    │                  │── Login form ────────►│                       │
    │                  │   (email + password)  │── Verify user ───────►│
    │                  │                      │◄── user record ───────│
    │                  │                      │── Create session ─────►│
    │                  │                      │── Create auth code ───►│
    │                  │◄── Redirect + code ──│                       │
    │◄── code ─────────│                      │                       │
    │                  │                      │                       │
    │── POST /token ──────────────────────────►│                       │
    │   (code + verifier)                      │── Verify code ───────►│
    │                                          │── Fetch user/roles ──►│
    │                                          │── Issue tokens ───────│
    │◄── access_token + refresh_token + id_token ──────────────────────│
```

---

## Security Boundaries

### What the Auth Server Enforces

- Token signature validity (RS256 with per-tenant keys)
- Token expiry (`exp`, `nbf`)
- Tenant isolation (`tenant_id` claim, per-tenant JWKS)
- Scope validity (intersection with client's `allowedScopes`)
- PKCE verification (when required by the client)
- Refresh token rotation and replay detection
- User consent (stored per user per client)
- Role-based access control for auth server management endpoints (CASL)

### What Resource Servers Must Enforce

Resource servers that accept tokens from this Auth Server are responsible for:

1. Verifying the RS256 signature using the tenant's JWKS
2. Validating standard claims (`exp`, `iss`, `aud`)
3. Confirming `tenant_id` matches the expected tenant (prevents cross-tenant token reuse)
4. Applying their own authorization logic based on `roles` or `scope` as appropriate

See [Resource Server Verification](resource-server-verification.md) for the complete verification checklist and code examples.

---

## Related Documentation

- [Getting Started](getting-started.md) — register a tenant and complete your first OAuth flow
- [OAuth API](oauth.md) — full reference for `/authorize` and `/token` endpoints
- [Token API](token-api.md) — JWT claims reference including roles format
- [Resource Server Verification](resource-server-verification.md) — how to verify tokens in your API
- [Refresh Token Rotation](refresh-token-rotation.md) — refresh token lifecycle and replay detection
- [Audience Model](audience-model.md) — `aud` claim format and validation
- [App-Owned Roles](app-owned-roles.md) — cross-tenant role namespacing and policy resolution
- [Multi-Tenant Onboarding](multi-tenant-onboarding.md) — programmatic tenant provisioning
- [Database Schema](database-schema.md) — full table reference
