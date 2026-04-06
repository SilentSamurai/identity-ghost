# Refresh Token Rotation

## Overview

Refresh tokens are opaque, single-use strings backed by a server-side database record. Every time a refresh token is used, the old token is invalidated and a new one is issued. This rotation mechanism limits the exposure window if a token is compromised.

Tokens are organized into **families** — a chain of tokens originating from a single authentication event (login or authorization code exchange). If a previously used token is presented again, the server treats it as a potential theft and revokes the entire family.

## How It Works

1. **Login / Auth Code Exchange** — The server returns an opaque `refresh_token` alongside the `access_token`.
2. **Refresh** — To obtain a new access token, POST to `/api/oauth/token` with `grant_type=refresh_token`, the current refresh token, and client credentials (`client_id`, `client_secret`).
3. **Rotation** — The server invalidates the old refresh token and returns a new `access_token` and a new `refresh_token`.
4. **Replace** — The client must discard the old refresh token and store the new one. Each token can only be used once.

```
Login ──► Token A ──► Token B ──► Token C ──► ...
           (used)      (used)      (current)
```

## Token Rotation

Every successful refresh request:

- Marks the presented token as **used** (sets `used_at` timestamp).
- Issues a new token in the same family with a new `parent_id` linking back to the consumed token.
- Preserves `user_id`, `client_id`, `tenant_id`, and `absolute_expires_at` from the original family.

The new token is the only valid refresh token for that session going forward.

## Replay Detection

If a previously consumed token (one that already has `used_at` set) is presented again:

1. The server identifies this as a **replay** — a sign that the token may have been stolen.
2. All tokens in the family are **revoked** (`revoked = true`).
3. The server returns `invalid_grant`.
4. The legitimate user and the attacker both lose access and must re-authenticate.

This containment strategy ensures that a stolen token can be used at most once before the theft is detected and the entire session is invalidated.

### Grace Window

A configurable grace window (default: 0 seconds, max: 30 seconds) handles network retry scenarios. If a client's response is lost and it retries with the same token within the grace window, the server returns the same child token (idempotent response) instead of triggering replay detection.

Once the grace window elapses, any reuse triggers full family revocation.

## Scope Down-Scoping

Clients can request a narrower scope on refresh by including the `scope` parameter:

```json
{
    "grant_type": "refresh_token",
    "refresh_token": "current-token",
    "client_id": "my-client",
    "client_secret": "my-secret",
    "scope": "openid profile"
}
```

- The requested scope must be a **subset** of the originally granted scope.
- If the requested scope includes any value not in the original grant, the server returns `invalid_scope`.
- If `scope` is omitted, the original scope is preserved on the new token.

Scope can only be narrowed, never broadened. This prevents a compromised token from escalating privileges.

## Token Expiry

Refresh tokens enforce two independent expiry windows:

### Sliding Expiry

Each individual token has an `expires_at` timestamp (default: 7 days from issuance). This resets with every rotation — an active session stays alive as long as the user refreshes within the window.

### Absolute Expiry

The token family has an `absolute_expires_at` timestamp (default: 30 days from the initial login). This is the hard maximum session lifetime regardless of activity. Once reached, the user must re-authenticate.

When a new token is issued via rotation, its `expires_at` is clamped to the family's `absolute_expires_at`, ensuring the sliding window never exceeds the absolute lifetime.

## Error Responses

All errors follow RFC 6749 Section 5.2 format.

| Scenario | Error Code | Description |
|----------|-----------|-------------|
| Token not found, revoked, or expired | `invalid_grant` | The refresh token is invalid or has expired |
| Replay detected (reused token) | `invalid_grant` | The refresh token is invalid (family revoked) |
| Client ID mismatch | `invalid_grant` | The refresh token is invalid |
| Scope escalation | `invalid_scope` | The requested scope exceeds the granted scope |

Error messages are intentionally generic to prevent information leakage. The server does not reveal whether a token exists, why it was rejected, or any internal state.

## Best Practices for Clients

- **Always store the new refresh token** from each response. The old one is invalidated immediately.
- **Never reuse a refresh token.** Each token is single-use. Reuse triggers family revocation.
- **Handle `invalid_grant` by re-authenticating.** When a refresh fails, redirect the user to the login flow.
- **Retry once on network failure.** If the response to a refresh request is lost, retry with the same token. The server's grace window may return the same result idempotently.
- **Use `scope` to request only what you need.** Down-scope on refresh if your client only needs a subset of the original permissions.
