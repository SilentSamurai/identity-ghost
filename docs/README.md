# Auth Server

General-purpose HTTP-based authentication and authorization server. Built with [Node.js](https://nodejs.org/)
and [Nest.js](https://nestjs.com/).

## Overview

Auth Server is a fully-featured OAuth 2.0 and OpenID Connect (OIDC) authorization server designed for multi-tenant
deployments. It handles user authentication, token issuance, and authorization for client applications and resource
servers.

## OAuth 2.0 Grant Types

Auth Server supports the following OAuth 2.0 grant types:

| Grant Type | Description |
|---|---|
| `authorization_code` | Standard authorization code flow with mandatory PKCE support (RFC 7636). Recommended for all user-facing applications. |
| `client_credentials` | Machine-to-machine authentication. Issues access tokens scoped to the client, with no user context. |
| `refresh_token` | Exchange a refresh token for a new access token. Supports refresh token rotation for enhanced security. |
| `password` | Resource Owner Password Credentials (legacy). Direct username/password exchange. Supported for backward compatibility. |

See the [OAuth API](oauth.md) and [Token API](token-api.md) for endpoint details and request examples.

## OpenID Connect Features

Auth Server implements the OpenID Connect Core 1.0 specification on top of OAuth 2.0:

| Feature | Description |
|---|---|
| **OIDC Discovery** | Auto-configuration endpoint at `/{tenantDomain}/.well-known/openid-configuration`. Clients can discover all server capabilities automatically. |
| **JWKS Endpoint** | Per-tenant JSON Web Key Set at `/{tenantDomain}/.well-known/jwks.json`. Resource servers use this to verify token signatures. |
| **ID Tokens** | Signed JWTs issued alongside access tokens when the `openid` scope is requested. Contains user identity claims. |
| **UserInfo Endpoint** | Returns user profile claims for the authenticated user based on granted scopes. |
| **Standard Scopes** | Supports `openid`, `profile`, and `email` scopes with their standard claim sets. |
| **Nonce** | Replay attack prevention via the `nonce` parameter in authorization requests. |
| **`prompt` parameter** | Controls authentication and consent behavior: `none`, `login`, `consent`, `select_account`. |
| **`max_age` parameter** | Enforces a maximum authentication age, triggering re-authentication when exceeded. |

See [OIDC Discovery](oidc-discovery.md) and [JWKS Endpoint](jwks-endpoint.md) for detailed documentation.

## Multi-Tenant Architecture

Auth Server is built for multi-tenancy from the ground up. Each tenant is a fully isolated environment:

- **Domain-based isolation**: Every tenant has its own domain (e.g., `acme.example.com`). All OAuth/OIDC endpoints are
  scoped to the tenant domain, so tokens issued for one tenant cannot be used with another.
- **Per-tenant RSA key pairs**: Each tenant has its own RSA key pair for signing JWTs. The JWKS endpoint exposes only
  that tenant's public key.
- **Independent user base**: Users, credentials, and roles are managed per tenant. A user can be a member of multiple
  tenants with different roles in each.
- **Isolated client registrations**: OAuth clients (applications) are registered per tenant and can only request tokens
  within their tenant.
- **Role management**: Each tenant defines its own roles. Roles are separate from OAuth scopes — scopes control client
  access, roles control user authorization within the application.

See the [Architecture Overview](architecture.md) for a full description of the system design.

## Feature Documentation

### Getting Started
- [Getting Started Guide](getting-started.md) — Register a tenant, configure a client, and run your first OAuth flow
- [Architecture Overview](architecture.md) — System components, token model, and multi-tenant design

### OAuth 2.0 / OpenID Connect
- [OAuth API](oauth.md) — Authorization endpoint, grant types, and PKCE
- [OIDC Discovery](oidc-discovery.md) — Auto-configuration endpoint for OAuth clients
- [JWKS Endpoint](jwks-endpoint.md) — Public key endpoint for resource servers
- [Token API](token-api.md) — Token endpoint, introspection, and UserInfo
- [Token Revocation](token-revocation.md) — Revoking access and refresh tokens
- [Refresh Token Rotation](refresh-token-rotation.md) — Automatic refresh token rotation
- [Login Sessions](login-sessions.md) — Session cookies, lifetime, and `prompt` parameter behavior
- [User Consent Flow](user-consent.md) — Consent collection, storage, and `prompt=consent`
- [OIDC Compliance Requirements](oauth-oidc-compliance-requirements.md) — Full compliance checklist

### APIs
- [Client API](client-api.md) — Managing OAuth client registrations
- [User Management API](user-management-api.md) — User profile, email, password, and tenant membership
- [Tenant Management API](tenant-management-api.md) — Creating and configuring tenants
- [Member Management API](member-management-api.md) — Managing tenant members and roles
- [Registration API](registration-api.md) — User sign-up, sign-down, and email verification

### Architecture & Advanced Topics
- [Resource Server Verification](resource-server-verification.md) — Verifying Auth Server tokens in your API
- [Audience Model](audience-model.md) — How the `aud` claim is populated and validated
- [App-Owned Roles](app-owned-roles.md) — Define roles in your app tenant and apply them across subscriber tenants
- [Multi-Tenant Onboarding](multi-tenant-onboarding.md) — App-initiated tenant provisioning via API
- [Database Schema](database-schema.md) — Entity relationships and data model

## Additional Features

- User registration and email verification
- Password reset via email
- Email address change with verification
- Automatic cleanup of unverified accounts after token expiry
- API [documentation](https://silentsamurai.github.io/auth-server) available online
