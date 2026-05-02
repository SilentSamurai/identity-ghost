# Token Revocation

This page documents the token revocation and logout endpoints. Both endpoints implement [RFC 7009](https://datatracker.ietf.org/doc/html/rfc7009) semantics and require client authentication.

---

## Client Authentication

Both endpoints require the caller to authenticate as a client application. Three methods are supported:

| Method              | Description                                                                                  |
|---------------------|----------------------------------------------------------------------------------------------|
| HTTP Basic          | `Authorization: Basic <base64(client_id:client_secret)>`                                     |
| Request body        | `client_id` and `client_secret` fields in the request body                                   |
| Bearer access token | `Authorization: Bearer <access_token>` — uses the token's embedded tenant and client context |

When both HTTP Basic and body credentials are present, HTTP Basic takes precedence.

---

## Revoke Token

```http
POST /api/oauth/revoke
```

`public`  `application/x-www-form-urlencoded` | `application/json`

Revokes a refresh token and its entire token family per [RFC 7009](https://datatracker.ietf.org/doc/html/rfc7009). Once
revoked, the token and all related tokens sharing the same `family_id` can no longer be used to obtain new access
tokens.

**Request (body credentials)**

```json
{
    "token": "string (the refresh token to revoke)",
    "token_type_hint": "string (optional: refresh_token | access_token)",
    "client_id": "string",
    "client_secret": "string"
}
```

**Request (Basic auth)**

```http
Authorization: Basic <base64(client_id:client_secret)>
Content-Type: application/x-www-form-urlencoded

token=<refresh_token>&token_type_hint=refresh_token
```

| Field             | Required | Description                                                                                                    |
|-------------------|----------|----------------------------------------------------------------------------------------------------------------|
| `token`           | Yes      | The token string to revoke                                                                                     |
| `token_type_hint` | No       | Hint for token type lookup. Accepted values: `refresh_token`, `access_token`. Unrecognized values are ignored. |
| `client_id`       | Yes*     | Required when not using HTTP Basic auth or Bearer token                                                        |
| `client_secret`   | Yes*     | Required when not using HTTP Basic auth or Bearer token                                                        |

**Response**

```json
{}
```

The endpoint always returns HTTP 200 with an empty body when client authentication succeeds, regardless of whether the
token was found, already revoked, or unrecognized. This prevents token existence enumeration.

**Response Headers**

```
Cache-Control: no-store
Pragma: no-cache
```

**Error Responses**

| Scenario                   | HTTP Status | Error Code        | Description                                 |
|----------------------------|-------------|-------------------|---------------------------------------------|
| Missing or empty `token`   | 400         | `invalid_request` | The `token` parameter is required           |
| Missing client credentials | 401         | `invalid_client`  | Client authentication is required           |
| Invalid client credentials | 401         | `invalid_client`  | The client_id or client_secret is incorrect |

**Example — Revoke a refresh token**

```http
POST /api/oauth/revoke
Content-Type: application/json

{
    "token": "opaque-refresh-token-string",
    "token_type_hint": "refresh_token",
    "client_id": "my-client",
    "client_secret": "my-secret"
}
```

```json
{}
```

> **Note:** Access tokens are short-lived JWTs validated locally and are not revocable through this endpoint. Submitting
> an access token string returns HTTP 200 with no action taken.

---

## Logout

```http
POST /api/oauth/logout
```

`public`  `application/x-www-form-urlencoded` | `application/json`

Performs a full server-side logout sequence. This is a superset of `/revoke` — clients should prefer this endpoint on
logout rather than calling both separately.

When called, the logout endpoint:

1. **Invalidates the login session** (if `sid` is provided) — marks the session record as invalidated server-side and revokes all refresh tokens tied to that session.
2. **Revokes the refresh token family** (if `refresh_token` is provided) — revokes the token and all tokens sharing the same `family_id`.
3. **Clears session cookies** — always returns `Set-Cookie` headers that immediately expire the browser session cookies.

Client authentication is required using the same methods as `/revoke`.

**Request**

```json
{
    "refresh_token": "string (optional)",
    "sid": "string (optional)",
    "client_id": "string",
    "client_secret": "string"
}
```

| Field           | Required | Description                                                                                                                                 |
|-----------------|----------|---------------------------------------------------------------------------------------------------------------------------------------------|
| `refresh_token` | No       | The refresh token to revoke. If omitted, token revocation is skipped.                                                                       |
| `sid`           | No       | The login session ID. If provided, the session is invalidated server-side and all refresh tokens associated with that session are revoked.   |
| `client_id`     | Yes*     | Required when not using HTTP Basic auth or Bearer token                                                                                     |
| `client_secret` | Yes*     | Required when not using HTTP Basic auth or Bearer token                                                                                     |

**Response**

```json
{}
```

**Response Headers**

```
Cache-Control: no-store
Pragma: no-cache
Set-Cookie: session=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict
Set-Cookie: session.sig=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict
```

The `Set-Cookie` headers instruct the browser to immediately expire the `session` and `session.sig` cookies. These
headers are always present in a successful response, even when no token or session ID was provided.

**Error Responses**

| Scenario                   | HTTP Status | Error Code       | Description                                 |
|----------------------------|-------------|------------------|---------------------------------------------|
| Missing client credentials | 401         | `invalid_client` | Client authentication is required           |
| Invalid client credentials | 401         | `invalid_client` | The client_id or client_secret is incorrect |

**Example — Full logout with session and refresh token**

```http
POST /api/oauth/logout
Content-Type: application/json

{
    "refresh_token": "opaque-refresh-token-string",
    "sid": "550e8400-e29b-41d4-a716-446655440000",
    "client_id": "my-client",
    "client_secret": "my-secret"
}
```

```json
{}
```

**Example — Cookie-only logout (no token)**

```http
POST /api/oauth/logout
Content-Type: application/json

{
    "client_id": "my-client",
    "client_secret": "my-secret"
}
```

```json
{}
```

> **Note:** The logout endpoint is fire-and-forget safe. If the server returns an error or is unreachable, clients
> should still clear the local session and redirect to the login page.
