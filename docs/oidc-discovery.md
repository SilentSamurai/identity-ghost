# OIDC Discovery

The Auth Server implements [OpenID Connect Discovery 1.0](https://openid.net/specs/openid-connect-discovery-1_0.html), which allows OAuth clients to auto-configure themselves by fetching a well-known metadata document. This eliminates the need to hardcode endpoint URLs and supported capabilities.

## Overview

The discovery document is a JSON object that describes the authorization server's capabilities: its endpoints, supported grant types, signing algorithms, scopes, and more. Any standards-compliant OAuth 2.0 / OIDC client library can use this document to configure itself automatically.

The endpoint is **public** — no authentication or authorization is required to access it.

---

## Endpoint

```http
GET /{tenantDomain}/.well-known/openid-configuration
```

`public`  `no authentication required`

Returns the OpenID Connect Discovery document for the specified tenant. The `tenantDomain` is the registered domain of the tenant (e.g., `acme.example.com`).

**Example request**

```http
GET /acme.example.com/.well-known/openid-configuration
```

---

## Response Fields

The discovery document contains the following fields:

| Field | Type | Description |
|-------|------|-------------|
| `issuer` | `string` | The issuer identifier for this authorization server. All tokens issued by this server will have this value as the `iss` claim. |
| `authorization_endpoint` | `string` | URL of the OAuth 2.0 authorization endpoint. Clients redirect users here to begin the Authorization Code flow. |
| `token_endpoint` | `string` | URL of the OAuth 2.0 token endpoint. Clients exchange authorization codes and refresh tokens here. |
| `userinfo_endpoint` | `string` | URL of the OIDC UserInfo endpoint. Returns claims about the authenticated user when called with a valid access token. |
| `jwks_uri` | `string` | URL of the JSON Web Key Set (JWKS) endpoint. Resource servers use this to fetch the public keys needed to verify token signatures. See [JWKS Endpoint](jwks-endpoint.md). |
| `registration_endpoint` | `string` | URL of the client registration endpoint (if dynamic client registration is supported). |
| `scopes_supported` | `string[]` | List of OAuth 2.0 scope values supported by this server. |
| `response_types_supported` | `string[]` | List of `response_type` values supported at the authorization endpoint. |
| `grant_types_supported` | `string[]` | List of OAuth 2.0 grant type values supported at the token endpoint. |
| `subject_types_supported` | `string[]` | List of Subject Identifier types supported. `public` means the `sub` claim is the same for all clients. |
| `id_token_signing_alg_values_supported` | `string[]` | List of JWS signing algorithms supported for ID tokens. |
| `token_endpoint_auth_methods_supported` | `string[]` | List of client authentication methods supported at the token endpoint. |
| `claims_supported` | `string[]` | List of claim names that may appear in ID tokens or UserInfo responses. |
| `code_challenge_methods_supported` | `string[]` | List of PKCE code challenge methods supported. |

---

## Example Response

```json
{
    "issuer": "https://auth.server.com",
    "authorization_endpoint": "https://auth.server.com/api/oauth/authorize",
    "token_endpoint": "https://auth.server.com/api/oauth/token",
    "userinfo_endpoint": "https://auth.server.com/api/oauth/userinfo",
    "jwks_uri": "https://auth.server.com/acme.example.com/.well-known/jwks.json",
    "registration_endpoint": "https://auth.server.com/api/register-domain",
    "scopes_supported": [
        "openid",
        "profile",
        "email"
    ],
    "response_types_supported": [
        "code"
    ],
    "grant_types_supported": [
        "authorization_code",
        "client_credentials",
        "refresh_token",
        "password"
    ],
    "subject_types_supported": [
        "public"
    ],
    "id_token_signing_alg_values_supported": [
        "RS256"
    ],
    "token_endpoint_auth_methods_supported": [
        "client_secret_basic",
        "client_secret_post"
    ],
    "claims_supported": [
        "sub",
        "iss",
        "aud",
        "exp",
        "iat",
        "auth_time",
        "nonce",
        "at_hash",
        "email",
        "email_verified",
        "name",
        "sid"
    ],
    "code_challenge_methods_supported": [
        "S256",
        "plain"
    ]
}
```

---

## Notes

### Public Access

The discovery endpoint requires no authentication. It is intentionally public so that any client — including those that have not yet obtained credentials — can discover the server's capabilities. CORS is open (`*`) for all `/.well-known/*` endpoints.

### Tenant-Scoped URL

The URL is prefixed with the tenant domain. Each tenant shares the same authorization server configuration, but the `jwks_uri` in the response points to the tenant-specific JWKS endpoint so that resource servers can fetch the correct public key for that tenant's tokens.

### Using the Discovery Document

Most OAuth 2.0 / OIDC client libraries support auto-configuration from a discovery URL. Pass the discovery URL to your library's initialization method:

```javascript
// Example using a generic OIDC client library
const client = await OidcClient.discover(
    'https://auth.server.com/acme.example.com/.well-known/openid-configuration'
);
```

The library will fetch the document, extract the endpoint URLs and supported capabilities, and configure itself automatically. You will not need to hardcode `authorization_endpoint`, `token_endpoint`, or `jwks_uri` values.

### PKCE

The server supports `S256` (recommended) and `plain` PKCE methods. Clients should always prefer `S256`. Some clients may be configured to require `S256` exclusively — see [OAuth API](oauth.md) for details on the `code_challenge_method` parameter.

### Signing Algorithm

All tokens are signed with `RS256` (RSA Signature with SHA-256). The corresponding public key is available at the `jwks_uri`. See [JWKS Endpoint](jwks-endpoint.md) for details on key rotation and caching.

---

## See Also

- [JWKS Endpoint](jwks-endpoint.md) — fetch the public keys used to verify token signatures
- [OAuth API](oauth.md) — authorization and token endpoint reference
- [Resource Server Verification](resource-server-verification.md) — how to verify tokens in your API
- [Architecture Overview](architecture.md) — multi-tenant model and token architecture
