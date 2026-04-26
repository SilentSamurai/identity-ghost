# Audience Model

## Overview

The `aud` (audience) claim in every access token identifies the intended recipient(s) of the token. Resource servers use
this claim to verify that a token was issued for them, rejecting tokens intended for other services.

This Auth Server follows [RFC 9068](https://datatracker.ietf.org/doc/html/rfc9068) for access token JWT profiles. The
`aud` claim is always present and always a JSON array.

## How `aud` Values Are Assigned

Every access token issued by the Auth Server includes an `aud` claim set to the server's configured domain:

```
aud: [SUPER_TENANT_DOMAIN]
```

`SUPER_TENANT_DOMAIN` is the environment variable that defines the issuer URL. It serves double duty as both the `iss`
and the default audience value. This means the Auth Server itself is the default intended audience for all tokens it
issues.

## Format

The `aud` claim is always a JSON array, even when it contains a single value. This simplifies validation logic on
resource servers — there is no need to handle both string and array formats.

```json
{
  "aud": ["https://auth.example.com"]
}
```

A bare string `aud` (e.g. `"aud": "https://auth.example.com"`) is never emitted and will be rejected during token
validation.

## Examples of Valid `aud` Arrays

**Single audience (default)**

The standard case for all tokens issued today:

```json
{
  "aud": ["https://auth.example.com"]
}
```

**Multiple audiences (future)**

When RFC 8707 resource indicators are supported, a client may request access to specific resource servers. The `aud`
array will then contain those resource server URIs:

```json
{
  "aud": ["https://auth.example.com", "https://api.example.com"]
}
```

## Validating the `aud` Claim (Resource Server Guidance)

Resource servers that accept tokens from this Auth Server should validate the `aud` claim as follows:

1. **Verify `aud` is an array.** Reject the token if `aud` is a bare string or missing entirely.

2. **Check for your identifier.** The resource server's own identifier (its URI or the `SUPER_TENANT_DOMAIN` value) must
   appear in the `aud` array. If it does not, reject the token.

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

## Future: RFC 8707 Resource Indicators

The current audience model uses a single default value. When [RFC 8707](https://datatracker.ietf.org/doc/html/rfc8707)
resource indicators are implemented, clients will be able to request tokens scoped to specific resource servers by
including `resource` parameters in the token request. The `aud` array will then contain the requested resource server
URIs instead of (or in addition to) the default value.

Until then, all tokens carry `aud: [SUPER_TENANT_DOMAIN]`.
