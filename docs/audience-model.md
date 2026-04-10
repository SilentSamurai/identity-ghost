# Audience Model

## Overview

The `aud` (audience) claim in every access token identifies the intended recipient(s) of the token. Resource servers use this claim to verify that a token was issued for them, rejecting tokens intended for other services.

This Auth Server follows [RFC 9068](https://datatracker.ietf.org/doc/html/rfc9068) for access token JWT profiles. The `aud` claim is always present and always a JSON array.

## How `aud` Values Are Assigned

Every access token issued by the Auth Server includes an `aud` claim set to the server's configured domain:

```
aud: [SUPER_TENANT_DOMAIN]
```

`SUPER_TENANT_DOMAIN` is the environment variable that defines the issuer URL. It serves double duty as both the `iss` and the default audience value. This means the Auth Server itself is the default intended audience for all tokens it issues.

## Format

The `aud` claim is always a JSON array, even when it contains a single value. This simplifies validation logic on resource servers — there is no need to handle both string and array formats.

```json
{
  "aud": ["https://auth.example.com"]
}
```

A bare string `aud` (e.g. `"aud": "https://auth.example.com"`) is never emitted and will be rejected during token validation.

## Examples of Valid `aud` Arrays

**Single audience (default)**

The standard case for all tokens issued today:

```json
{
  "aud": ["https://auth.example.com"]
}
```

**Multiple audiences (future)**

When RFC 8707 resource indicators are supported, a client may request access to specific resource servers. The `aud` array will then contain those resource server URIs:

```json
{
  "aud": ["https://auth.example.com", "https://api.example.com"]
}
```

## Validating the `aud` Claim (Resource Server Guidance)

Resource servers that accept tokens from this Auth Server should validate the `aud` claim as follows:

1. **Verify `aud` is an array.** Reject the token if `aud` is a bare string or missing entirely.

2. **Check for your identifier.** The resource server's own identifier (its URI or the `SUPER_TENANT_DOMAIN` value) must appear in the `aud` array. If it does not, reject the token.

3. **Use exact string matching.** Compare audience values as exact strings — no pattern matching or normalization.

4. **Apply this check early.** Audience validation should happen before any authorization logic. A token not intended for your service should be rejected immediately.

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

When validating time-based claims (`exp`, `nbf`, `iat`) alongside the audience, allow for the configured clock skew tolerance (default ±30 seconds). See the `JWT_CLOCK_SKEW_SECONDS` environment variable.

## Future: RFC 8707 Resource Indicators

The current audience model uses a single default value. When [RFC 8707](https://datatracker.ietf.org/doc/html/rfc8707) resource indicators are implemented, clients will be able to request tokens scoped to specific resource servers by including `resource` parameters in the token request. The `aud` array will then contain the requested resource server URIs instead of (or in addition to) the default value.

Until then, all tokens carry `aud: [SUPER_TENANT_DOMAIN]`.
