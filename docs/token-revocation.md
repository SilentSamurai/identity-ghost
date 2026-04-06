### Revoke Token

```http
[POST] /api/oauth/revoke
```

`public`  `application/x-www-form-urlencoded` | `application/json`

Revokes a refresh token and its entire token family per [RFC 7009](https://datatracker.ietf.org/doc/html/rfc7009). Once revoked, the token and all related tokens sharing the same `family_id` can no longer be used to obtain new access tokens.

Client authentication is required. Credentials may be supplied via HTTP Basic authentication or in the request body.

**Authentication**

| Method | Description |
|--------|-------------|
| HTTP Basic | `Authorization: Basic <base64(client_id:client_secret)>` |
| Request body | `client_id` and `client_secret` fields in the body |

When both are present, HTTP Basic takes precedence.

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

token=<refresh_token>&token_type_hint=refresh_token
```

| Field | Required | Description |
|-------|----------|-------------|
| `token` | Yes | The refresh token to revoke |
| `token_type_hint` | No | Hint for token type lookup. Accepted values: `refresh_token`, `access_token`. Unrecognized values are ignored. |
| `client_id` | Yes* | Required when not using HTTP Basic auth |
| `client_secret` | Yes* | Required when not using HTTP Basic auth |

**Response**

```json
{}
```

The endpoint always returns HTTP 200 with an empty body when client authentication succeeds, regardless of whether the token was found, already revoked, or unrecognized. This prevents token existence enumeration.

**Response Headers**

```
Cache-Control: no-store
Pragma: no-cache
```

**Error Responses**

| Scenario | HTTP Status | Error Code | Description |
|----------|-------------|------------|-------------|
| Missing or empty `token` | 400 | `invalid_request` | The `token` parameter is required |
| Missing client credentials | 401 | `invalid_client` | Client authentication is required |
| Invalid client credentials | 401 | `invalid_client` | The client_id or client_secret is incorrect |

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

> **Note:** Access tokens are short-lived JWTs validated locally and are not revocable through this endpoint. Submitting an access token string returns HTTP 200 with no action taken.

<hr>

### Logout

```http
[POST] /api/oauth/logout
```

`public`  `application/x-www-form-urlencoded` | `application/json`

Performs a full server-side logout sequence: revokes the refresh token family and instructs the client to clear session cookies via `Set-Cookie` headers. This is a superset of `/revoke` — clients should prefer this endpoint on logout rather than calling both.

Client authentication is required using the same methods as `/revoke`.

**Request**

```json
{
    "refresh_token": "string (optional)",
    "client_id": "string",
    "client_secret": "string"
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `refresh_token` | No | The refresh token to revoke. If omitted, only cookie clearing is performed. |
| `client_id` | Yes* | Required when not using HTTP Basic auth |
| `client_secret` | Yes* | Required when not using HTTP Basic auth |

**Response**

```json
{}
```

**Response Headers**

```
Cache-Control: no-store
Pragma: no-cache
Set-Cookie: <session-cookie>=; Max-Age=0; Path=/; HttpOnly
```

The `Set-Cookie` headers instruct the browser to immediately expire all session cookies. These headers are always present in a successful response, even when the token is invalid or already revoked.

**Error Responses**

| Scenario | HTTP Status | Error Code | Description |
|----------|-------------|------------|-------------|
| Missing client credentials | 401 | `invalid_client` | Client authentication is required |
| Invalid client credentials | 401 | `invalid_client` | The client_id or client_secret is incorrect |

**Example — Logout with refresh token**

```http
POST /api/oauth/logout
Content-Type: application/json

{
    "refresh_token": "opaque-refresh-token-string",
    "client_id": "my-client",
    "client_secret": "my-secret"
}
```

```json
{}
```

> **Note:** The logout endpoint is fire-and-forget safe. If the server returns an error or is unreachable, clients should still clear the local session and redirect to the login page.
