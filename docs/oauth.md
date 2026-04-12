### Authorize (Authorization Code Flow Entry Point)

```http
[GET] /api/oauth/authorize
```

`public`  `query parameters`

Initiates the OAuth 2.0 Authorization Code flow per [RFC 6749 §4.1](https://datatracker.ietf.org/doc/html/rfc6749#section-4.1). Validates the client's authorization request parameters and redirects the user-agent to the login UI. This endpoint does not authenticate users or issue authorization codes directly — after the user logs in, the login flow creates the authorization code and redirects back to the client.

**Request (query parameters)**

| Parameter | Required | Description |
|-----------|----------|-------------|
| `response_type` | Yes | Must be `code` |
| `client_id` | Yes | The registered OAuth client identifier |
| `redirect_uri` | Conditional | Must exactly match a registered redirect URI. If the client has exactly one registered URI, this may be omitted. |
| `state` | Yes | Opaque value for CSRF protection. Returned unmodified in the redirect. |
| `scope` | No | Space-delimited OIDC scope values (e.g., `openid profile email`). Defaults to the client's allowed scopes if omitted. |
| `code_challenge` | Conditional | Required if the client has PKCE enforcement enabled. Base64url-encoded challenge value. |
| `code_challenge_method` | No | `plain` or `S256`. Defaults to `plain` if `code_challenge` is present but method is omitted. Must be `S256` when the client requires PKCE. |
| `nonce` | No | Opaque value for ID token replay protection. Max 512 characters. |

**Example**

```http
GET /api/oauth/authorize?response_type=code&client_id=my-client&redirect_uri=https://app.example.com/callback&state=abc123&scope=openid%20profile&code_challenge=E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM&code_challenge_method=S256&nonce=n-0S6_WzA2Mj
```

**Success Response**

```
HTTP/1.1 302 Found
Location: /authorize?client_id=my-client&redirect_uri=https://app.example.com/callback&scope=openid+profile&state=abc123&code_challenge=E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM&code_challenge_method=S256&nonce=n-0S6_WzA2Mj
```

Redirects to the login UI with all validated parameters forwarded as query parameters.

**Error Responses**

Errors are split into two categories based on whether a trusted redirect URI has been established:

*Pre-redirect errors* — returned as JSON directly (no redirect):

| Scenario | HTTP Status | Error Code |
|----------|-------------|------------|
| `response_type` missing or not `code` | 400 | `unsupported_response_type` |
| `client_id` missing or unknown | 400 | `invalid_request` |
| `redirect_uri` does not match any registered URI | 400 | `invalid_request` |
| `redirect_uri` omitted and client has multiple registered URIs | 400 | `invalid_request` |

```json
{
    "error": "invalid_request",
    "error_description": "The redirect_uri does not match any registered redirect URI"
}
```

*Post-redirect errors* — redirected to the client's `redirect_uri` with error query parameters:

| Scenario | Error Code |
|----------|------------|
| `state` parameter missing | `invalid_request` |
| `code_challenge` missing when PKCE is required | `invalid_request` |
| `code_challenge_method` is `plain` when S256 is required | `invalid_request` |
| PKCE downgrade from S256 to plain | `invalid_request` |
| `nonce` exceeds 512 characters | `invalid_request` |

```
HTTP/1.1 302 Found
Location: https://app.example.com/callback?error=invalid_request&error_description=The+state+parameter+is+required+for+CSRF+protection&state=abc123
```

<hr>

### OAuth Token (Password Grant Type)

```http
[POST] /api/oauth/token
```

`public`  `application/json`

**Request**

```json
{
    "grant_type": "password",
    "email": "string",
    "password": "string",
    "domain": "string"
}
```

**Response**

```json
{
    "access_token": "string",
    "token_type": "string",
    "expires_in": "string",
    "refresh_token": "string"
}
```

<hr>

### OAuth Token (Client Grant Type)

```http
[POST] /api/oauth/token
```

`public`  `application/json`

**Request**

```json
{
    "grant_type": "client_credential",
    "client_id": "string",
    "client_secret": "string"
}
```

**Response**

```json
{
    "access_token": "string",
    "token_type": "string",
    "expires_in": "string"
}
```

<HR> 

### OAuth Token (Refresh Grant Type)

```http
[POST] /api/oauth/token
```

`public`  `application/json`

Refresh tokens are opaque, single-use strings that rotate on every request. Each successful refresh invalidates the old token and returns a new one. See [Refresh Token Rotation](refresh-token-rotation.md) for details.

**Request**

```json
{
    "grant_type": "refresh_token",
    "refresh_token": "string (opaque token)",
    "client_id": "string",
    "client_secret": "string",
    "scope": "string (optional, space-delimited, must be subset of original)"
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `grant_type` | Yes | Must be `refresh_token` |
| `refresh_token` | Yes | The opaque refresh token from a previous token response |
| `client_id` | Yes | The client identifier that originally obtained the token |
| `client_secret` | Yes | The client secret for authentication |
| `scope` | No | Space-delimited scope string. Must be a subset of the originally granted scope. If omitted, the original scope is preserved. |

**Response**

```json
{
    "access_token": "string",
    "token_type": "Bearer",
    "expires_in": "number",
    "refresh_token": "string (new rotated token — must replace the old one)",
    "scope": "string"
}
```

> **Important:** The response contains a new `refresh_token`. Clients must store this new token and discard the old one. Reusing a previously consumed token will revoke the entire token family.
