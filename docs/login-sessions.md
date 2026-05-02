# Login Sessions

## Overview

The Auth Server maintains server-side login sessions to track authenticated users across authorization requests. When a
user successfully logs in, a session record is created in the database and a session cookie is set in the browser. On
subsequent authorization requests, the server checks for an existing valid session to avoid prompting the user to log in
again.

Sessions are scoped to a **user + tenant** pair. A user who belongs to multiple tenants has independent sessions for
each one.

---

## Session Cookie Mechanism

After a successful login, the server creates a `login_sessions` record and sets an HTTP-only session cookie in the
browser. This cookie carries the session identifier (`sid`) — a randomly generated UUID.

```
Set-Cookie: sid=<uuid>; HttpOnly; Secure; SameSite=Lax; Path=/
```

The cookie is:

- **HttpOnly** — not accessible from JavaScript, preventing XSS-based theft.
- **Secure** — only sent over HTTPS connections.
- **SameSite=Lax** — sent on top-level navigations but not on cross-site sub-requests, mitigating CSRF.

On every subsequent authorization request (`/api/oauth/authorize`), the server reads the `sid` cookie and looks up the
corresponding session record. If the session is valid (not expired, not invalidated), the user is considered
authenticated and the authorization flow can proceed without re-prompting for credentials.

### Session Record

Each session is stored in the `login_sessions` table:

| Column           | Description                                                                 |
|------------------|-----------------------------------------------------------------------------|
| `sid`            | UUID primary key — the session identifier embedded in the cookie            |
| `user_id`        | The authenticated user                                                      |
| `tenant_id`      | The tenant the session belongs to                                           |
| `auth_time`      | Unix timestamp of when the user authenticated (used for `max_age` checks)  |
| `expires_at`     | Absolute expiry datetime — session is invalid after this point              |
| `invalidated_at` | Set when the session is explicitly invalidated (logout or `prompt=login`)   |
| `created_at`     | Record creation timestamp                                                   |

A session is considered **valid** only when all of the following are true:

1. A record with the given `sid` exists.
2. `invalidated_at` is `NULL`.
3. `expires_at` is in the future.

---

## Session Lifetime and Expiration

The session lifetime is controlled by the `LOGIN_SESSION_DURATION_SECONDS` environment variable. The default is
**86400 seconds (24 hours)**.

```
LOGIN_SESSION_DURATION_SECONDS=86400   # 24 hours (default)
```

The `expires_at` timestamp is set at session creation time and does not slide — it is an absolute deadline from the
moment the user authenticated. Once `expires_at` is reached, the session is treated as expired and the user must
re-authenticate.

### Session Invalidation

Sessions can be invalidated before their natural expiry in two ways:

1. **Logout** — The logout endpoint sets `invalidated_at` on the session and revokes all refresh tokens linked to that
   `sid`. See [Token Revocation](token-revocation.md) for details.

2. **`prompt=login`** — When the authorization request includes `prompt=login`, all active sessions for the user+tenant
   pair are invalidated and the user is forced to re-authenticate. A new session is created after successful login.

Invalidation is idempotent — invalidating an already-invalidated session is a no-op.

---

## Session and the `prompt` Parameter

The `prompt` parameter in the authorization request controls how the server interacts with existing sessions. It is
passed as a query parameter to `/api/oauth/authorize`.

```
GET /api/oauth/authorize?...&prompt=none
```

Multiple values can be combined as a space-delimited string (e.g., `prompt=login%20consent`), with the exception of
`none`, which must appear alone.

### `prompt` Values

#### No `prompt` parameter (default behavior)

If `prompt` is omitted, the server uses the existing session if one is valid. The user is not prompted to log in again.
If no valid session exists, the login UI is shown.

#### `prompt=none`

Silent authentication — the server must complete the authorization flow without any user interaction.

- If a valid session exists and consent has already been granted for the requested scopes, the server issues an
  authorization code immediately and redirects back to the client.
- If no valid session exists, the server redirects back to the client with `error=login_required`.
- If a valid session exists but consent has not been granted, the server redirects back with `error=consent_required`.
- If `max_age` is also present and the session is not fresh enough, the server redirects back with
  `error=login_required`.

`prompt=none` must not be combined with any other prompt value. Doing so results in an `invalid_request` error.

#### `prompt=login`

Forces re-authentication regardless of whether a valid session exists.

- All active sessions for the user+tenant pair are invalidated.
- The user is always shown the login UI.
- After successful login, a new session is created and `auth_time` is recorded in the ID token.

Use this when you need a fresh proof of authentication — for example, before a sensitive operation.

#### `prompt=consent`

Forces the consent screen to be shown, even if the user has previously granted consent for the requested scopes.

- The user is always shown the consent UI.
- Existing consent records are not automatically cleared; the user can re-confirm or modify their consent.
- `auth_time` is included in the ID token if `prompt=login` or `max_age` is also present.

See [User Consent Flow](user-consent.md) for details on how consent is stored and reused.

#### `prompt=select_account`

Prompts the user to select an account. Recognized by the server but treated as a no-op in the current implementation —
the server proceeds with the existing session if one is valid.

### Summary Table

| `prompt` value   | Existing session | No session         | Behavior                                                    |
|------------------|------------------|--------------------|-------------------------------------------------------------|
| _(omitted)_      | Use session      | Show login UI      | Normal flow                                                 |
| `none`           | Issue code       | `login_required`   | Silent auth — no UI interaction allowed                     |
| `login`          | Invalidate, re-auth | Show login UI   | Always force fresh authentication                           |
| `consent`        | Show consent UI  | Show login UI      | Always show consent screen                                  |
| `select_account` | Use session      | Show login UI      | Treated as default behavior                                 |

---

## Session and the `max_age` Parameter

The `max_age` parameter specifies the maximum elapsed time (in seconds) since the user last authenticated. It works
alongside `prompt` to enforce freshness requirements.

```
GET /api/oauth/authorize?...&max_age=3600
```

- If a valid session exists and `(now - auth_time) <= max_age`, the session is considered fresh and the flow proceeds.
- If the session is stale (`now - auth_time > max_age`), the server forces re-authentication (equivalent to
  `prompt=login`).
- `max_age=0` always forces re-authentication, regardless of session age.
- When `max_age` is present, the `auth_time` claim is always included in the ID token.

---

## Session and Refresh Tokens

When a refresh token is issued, it carries the `sid` of the session that originated the authorization code exchange.
This links the refresh token back to the login session.

When a session is invalidated (via logout), the server also revokes all refresh tokens that share the same `sid`. This
ensures that revoking a session fully terminates the user's access — they cannot continue using a refresh token from an
invalidated session.

The `sid` claim also appears in ID tokens, allowing clients to correlate tokens with the originating session for
front-channel logout scenarios.

---

## Error Reference

| Error Code          | When it occurs                                                                 |
|---------------------|--------------------------------------------------------------------------------|
| `login_required`    | `prompt=none` and no valid session exists, or session is stale for `max_age`   |
| `consent_required`  | `prompt=none` and consent has not been granted for the requested scopes        |
| `invalid_request`   | `prompt=none` combined with other prompt values                                |
| `invalid_grant`     | Session lookup fails during token exchange (session expired or invalidated)    |

---

## See Also

- [User Consent Flow](user-consent.md) — how consent interacts with sessions
- [Refresh Token Rotation](refresh-token-rotation.md) — how refresh tokens are linked to sessions via `sid`
- [Token Revocation](token-revocation.md) — how logout invalidates sessions and revokes tokens
- [OAuth API](oauth.md) — the `/api/oauth/authorize` endpoint and its parameters
