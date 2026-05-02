# User Consent Flow

## Overview

The Auth Server collects user consent during the OAuth 2.0 authorization flow. When a third-party client requests
access to a user's data, the user is shown a consent screen listing the client name and the scopes being requested.
Once granted, consent is stored and reused on subsequent authorization requests so the user is not prompted again for
the same scopes.

Consent is scoped to a **user + client + scope** combination. A user who grants consent to one client does not
implicitly grant consent to any other client.

---

## When Consent Is Required vs. Skipped

### Consent Is Required

The consent screen is shown when any of the following conditions are true:

1. **No prior consent exists** — the user has never granted consent to this client before.
2. **New scopes are requested** — the user previously granted consent, but the current request includes one or more
   scopes not covered by the stored consent record.
3. **`prompt=consent` is specified** — the authorization request explicitly forces the consent screen, even if the user
   has already granted consent for all requested scopes. See [`prompt=consent`](#promptconsent) below.

### Consent Is Skipped

The consent screen is skipped when both of the following are true:

1. **The client is first-party** — the authorization request uses the tenant's domain as the `client_id` (i.e., the
   client is identified by its alias rather than its UUID). First-party logins represent the Auth Server's own UI
   authenticating against the user's home tenant, so consent is not required.
2. **All requested scopes are already covered** — the stored consent record's `granted_scopes` is a superset of the
   scopes being requested in the current authorization request.

When consent is skipped, the authorization flow proceeds directly to issuing an authorization code without any user
interaction.

---

## How Consent Is Stored and Reused

### Storage

Consent records are stored in the `user_consents` table. Each record represents the set of scopes a user has approved
for a specific client.

| Column            | Description                                                                                  |
|-------------------|----------------------------------------------------------------------------------------------|
| `user_id`         | The user who granted consent                                                                 |
| `client_id`       | The OAuth client that received consent (stored as the client's UUID, not its alias)          |
| `granted_scopes`  | Space-delimited list of approved scopes (e.g., `email openid profile`)                       |
| `consent_version` | Incremented each time the consent record is updated                                          |
| `created_at`      | When consent was first granted                                                               |
| `updated_at`      | When the consent record was last modified                                                    |

There is at most one consent record per user+client pair (enforced by a unique constraint on `user_id` + `client_id`).

### Granting Consent

When the user approves the consent screen, the server:

1. Validates the approved scopes against the client's `allowedScopes` (intersection — the user cannot approve scopes
   the client is not permitted to request).
2. Creates or updates the `user_consents` record:
   - **New record**: `granted_scopes` is set to the approved scopes and `consent_version` is set to `1`.
   - **Existing record**: `granted_scopes` is updated to the **union** of the existing scopes and the newly approved
     scopes. `consent_version` is incremented.
3. Issues an authorization code and redirects back to the client.

The union behavior means that granting consent for additional scopes never removes previously granted scopes.

### Checking Consent

On each authorization request, the server checks whether the stored `granted_scopes` is a superset of the requested
scopes:

- If `granted_scopes ⊇ requested_scopes` → consent is not required, flow proceeds.
- If any requested scope is missing from `granted_scopes` → consent is required, the consent screen is shown.

### Denying Consent

If the user denies the consent screen, the server redirects back to the client with:

```
error=access_denied&error_description=The+resource+owner+denied+the+request
```

No consent record is created or modified when the user denies.

### Revoking Consent

Users can revoke previously granted consent. Revocation removes the `user_consents` record for the user+client pair.
On the next authorization request from that client, the consent screen will be shown again.

---

## The Consent Screen

When the consent screen is displayed, it shows:

- The **client name** (the registered `name` field of the OAuth client, falling back to the `client_id` if no name is
  set).
- The **requested scopes** and their human-readable descriptions.

The user can approve or deny the request. Approving records the consent and continues the authorization flow. Denying
returns an `access_denied` error to the client.

---

## `prompt=consent`

The `prompt=consent` parameter forces the consent screen to be shown on every authorization request, regardless of
whether the user has previously granted consent for all requested scopes.

```
GET /api/oauth/authorize?...&prompt=consent
```

### Behavior

- The consent screen is **always** shown when `prompt=consent` is present, even if a valid consent record already
  exists covering all requested scopes.
- Existing consent records are **not cleared** by `prompt=consent`. The user can re-confirm their existing consent or
  approve additional scopes.
- After the user approves, the consent record is updated using the same union logic described above.

### When to Use `prompt=consent`

Use `prompt=consent` when you need a fresh, explicit confirmation from the user — for example:

- Before a sensitive operation that requires verified user intent.
- When your application's terms of service have changed and you need the user to re-acknowledge the scopes.
- When you want to give the user an opportunity to review and modify their granted scopes.

### Combining `prompt=consent` with Other Values

`prompt=consent` can be combined with `prompt=login` as a space-delimited string:

```
GET /api/oauth/authorize?...&prompt=login%20consent
```

When both are present:
- `prompt=login` forces re-authentication first (all existing sessions are invalidated).
- `prompt=consent` forces the consent screen after the user logs in.
- `auth_time` is included in the ID token.

`prompt=consent` cannot be combined with `prompt=none`. `prompt=none` requires silent authentication with no user
interaction, which is incompatible with showing a consent screen. Combining them results in an `invalid_request` error.

---

## `prompt=none` and Consent

When `prompt=none` is used, the server must complete the authorization flow without any user interaction. If consent
has not been granted for the requested scopes, the server cannot show the consent screen and instead redirects back to
the client with an error:

```
error=consent_required&error_description=User+consent+is+required+but+prompt=none+was+requested
```

This allows clients to detect that consent is needed and initiate a new authorization request (without `prompt=none`)
to collect it.

---

## Consent and First-Party Clients

First-party clients are identified by using the tenant's domain as the `client_id` in the authorization request (the
client's alias). This is how the Auth Server's own login UI authenticates users against their home tenant.

First-party logins **always skip consent**, regardless of the requested scopes or any `prompt` parameter (except
`prompt=consent`, which still forces the consent screen for third-party flows). The rationale is that the Auth Server
UI is a trusted application operating within the same trust boundary as the tenant itself.

Third-party clients — those identified by their UUID `client_id` — always go through the standard consent flow.

---

## Error Reference

| Error Code          | When it occurs                                                                                  |
|---------------------|-------------------------------------------------------------------------------------------------|
| `consent_required`  | `prompt=none` was requested but consent has not been granted for the requested scopes           |
| `access_denied`     | The user explicitly denied the consent screen                                                   |
| `invalid_request`   | `prompt=none` was combined with `prompt=consent` or other prompt values                         |
| `invalid_scope`     | The requested scopes are not a subset of the client's `allowedScopes`                           |

---

## See Also

- [Login Sessions](login-sessions.md) — how sessions interact with the consent flow and `prompt` parameter
- [OAuth API](oauth.md) — the `/api/oauth/authorize` endpoint and its parameters
- [Client API](client-api.md) — how to register and configure OAuth clients
