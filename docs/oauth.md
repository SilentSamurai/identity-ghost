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
