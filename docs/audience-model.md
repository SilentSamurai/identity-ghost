# Audience Model

## Overview

The `aud` (audience) claim in every access token identifies the intended recipient(s) of the token. Resource servers use
this claim to verify that a token was issued for them, rejecting tokens intended for other services.

This Auth Server follows [RFC 9068](https://datatracker.ietf.org/doc/html/rfc9068) for access token JWT profiles. The
`aud` claim is always present and always a JSON array.

## How `aud` Values Are Assigned

### Default Audience

Every access token issued by the Auth Server includes an `aud` claim set to the server's configured domain:

```
aud: [SUPER_TENANT_DOMAIN]
```

`SUPER_TENANT_DOMAIN` is the environment variable that defines the Auth Server's domain (e.g. `auth.example.com`). It
is the default audience value for all tokens.

> **Note:** `SUPER_TENANT_DOMAIN` and `ISSUER` are separate environment variables. The `iss` claim is set from the
> `ISSUER` variable (typically a full URL such as `https://auth.example.com`), while the default `aud` is set from
> `SUPER_TENANT_DOMAIN` (the bare domain). In production deployments these values are typically configured to match,
> but they are independent settings.

### Resource Indicator Audience (RFC 8707)

When a client includes a `resource` parameter in the token request, the `aud` array contains both the requested
resource server URI and the default `SUPER_TENANT_DOMAIN`:

```
aud: [resource_uri, SUPER_TENANT_DOMAIN]
```

This applies to all grant types: `authorization_code`, `password`, `refresh_token`, and `client_credentials`.

The `resource` parameter must be an absolute URI (per RFC 3986 §4.3) with no fragment component, and must be listed in
the client's configured `allowedResources`. Requests with an unregistered resource URI are rejected with
`invalid_target`.

## Token Types

### User Access Tokens (TenantToken)

Issued for `authorization_code`, `password`, and `refresh_token` grants. Contains both `scopes` (OIDC values) and
`roles` (role enums).

Default audience:

```json
{
    "aud": ["auth.example.com"]
}
```

With resource indicator:

```json
{
    "aud": ["https://api.example.com", "auth.example.com"]
}
```

### Technical Access Tokens (TechnicalToken)

Issued for the `client_credentials` grant (machine-to-machine). Contains `scopes` but no `roles` field — there is no
user identity. Follows the same audience model as user tokens.

Default audience:

```json
{
    "aud": ["auth.example.com"]
}
```

With resource indicator:

```json
{
    "aud": ["https://api.example.com", "auth.example.com"]
}
```

Per RFC 6749 §4.4.3, `client_credentials` tokens never include a `refresh_token`.

## Format

The `aud` claim is always a JSON array, even when it contains a single value. This simplifies validation logic on
resource servers — there is no need to handle both string and array formats.

```json
{
    "aud": [
        "auth.example.com"
    ]
}
```

A bare string `aud` (e.g. `"aud": "auth.example.com"`) is never emitted and will be rejected during token validation.

## Validating the `aud` Claim (Resource Server Guidance)

Resource servers that accept tokens from this Auth Server should validate the `aud` claim as follows:

1. **Verify `aud` is an array.** Reject the token if `aud` is a bare string or missing entirely.

2. **Check for your identifier.** The resource server's own identifier (its URI or the `SUPER_TENANT_DOMAIN` value)
   must appear in the `aud` array. If it does not, reject the token.

3. **Use exact string matching.** Compare audience values as exact strings — no pattern matching or normalization.

4. **Apply this check early.** Audience validation should happen before any authorization logic. A token not intended
   for your service should be rejected immediately.

Example validation pseudocode:

```
function validateAudience(token, myAudience):
    if not isArray(token.aud):
        reject("aud must be an array")

    if myAudience not in token.aud:
        reject("token not intended for this resource server")

    accept()
```

## Clock Skew

When validating time-based claims (`exp`, `nbf`, `iat`) alongside the audience, allow for the configured clock skew
tolerance (default ±30 seconds). See the `JWT_CLOCK_SKEW_SECONDS` environment variable.

## ID Token Audience Validation (Relying Party Guidance)

Relying parties (RPs) that consume ID tokens from this Auth Server must validate the `aud` and `azp` claims per OpenID
Connect Core 1.0 §3.1.3.7. This prevents token confusion attacks where an ID token issued for one client is accepted by
another.

### Validation Rules

1. **Verify `aud` is an array.** The `aud` claim is always a JSON array. Reject the ID token if `aud` is a bare string
   or missing entirely.

2. **Verify your `client_id` is in `aud`.** The RP's own `client_id` must appear in the `aud` array. If it does not,
   reject the token — it was not issued for your client.

3. **Verify `azp` when `aud` has multiple values.** When the `aud` array contains multiple values, the RP must also
   verify that the `azp` (authorized party) claim equals its `client_id`. This ensures the token was explicitly
   authorized for your client even though other audiences are present.

4. **Reject tokens where your `client_id` is not in `aud`.** This is the core audience check — a token not intended for
   your client must never be accepted.

### Example Validation Pseudocode

```
function validateIdTokenAudience(idToken, myClientId):
    if not isArray(idToken.aud):
        reject("aud must be an array")

    if myClientId not in idToken.aud:
        reject("ID token not issued for this client")

    if length(idToken.aud) > 1:
        if idToken.azp != myClientId:
            reject("azp must equal client_id when aud has multiple values")

    accept()
```

### Current Behavior

This Auth Server always issues ID tokens with:

- `aud: [clientId]` — a single-element array containing the requesting client's ID
- `azp: clientId` — always set to the requesting client's ID

Resource indicators (RFC 8707) affect access token audience only. ID token audience remains `[clientId]` regardless of
the `resource` parameter.

## RFC 8707 Resource Indicators

[RFC 8707](https://datatracker.ietf.org/doc/html/rfc8707) resource indicators are supported. Clients can request tokens
scoped to specific resource servers by including a `resource` parameter in the token request.

### Requirements

- The `resource` value must be an absolute URI (RFC 3986 §4.3) with no fragment component.
- The client must have the resource URI listed in its `allowedResources` configuration.
- Requests with an invalid or unregistered resource URI are rejected with `invalid_target`.

### Audience Construction

When a `resource` parameter is provided, the `aud` array is constructed as:

```json
{
    "aud": ["https://api.example.com", "auth.example.com"]
}
```

The resource URI appears first, followed by `SUPER_TENANT_DOMAIN`. When no `resource` parameter is provided, the
default single-element audience is used:

```json
{
    "aud": ["auth.example.com"]
}
```
