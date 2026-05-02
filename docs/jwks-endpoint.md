# JWKS Endpoint

The Auth Server publishes a JSON Web Key Set (JWKS) for each tenant. Resource servers use this endpoint to fetch the RSA public keys needed to verify the signatures of access tokens and ID tokens issued by that tenant.

## Overview

Every token issued by the Auth Server is signed with an RSA private key. The corresponding public key is published at a well-known URL so that any resource server can independently verify token signatures without contacting the Auth Server on every request.

The endpoint is **public** — no authentication or authorization is required to access it.

---

## Endpoint

```http
GET /{tenantDomain}/.well-known/jwks.json
```

`public`  `no authentication required`

Returns the JSON Web Key Set for the specified tenant. The `tenantDomain` is the registered domain of the tenant (e.g., `acme.example.com`).

**Example request**

```http
GET /acme.example.com/.well-known/jwks.json
```

---

## Per-Tenant Key Model

Each tenant has its own RSA key pair, stored in the `tenant_keys` table. This means:

- Tokens issued for `acme.example.com` are signed with `acme.example.com`'s private key
- Tokens issued for `other.example.com` are signed with `other.example.com`'s private key
- A token from one tenant **cannot** be verified using another tenant's public key

When verifying a token, you must always fetch the JWKS from the endpoint that corresponds to the **expected tenant** — the tenant whose resources are being accessed. Never use a JWKS from a different tenant to verify a token.

The JWT header includes a `kid` (Key ID) claim that identifies which specific key was used to sign the token. Match the `kid` in the JWT header against the `kid` fields in the JWKS to find the correct verification key.

---

## Key Rotation

The Auth Server supports key rotation. When a tenant's signing key is rotated:

1. A new key pair is generated and the new key becomes the active signing key
2. The old public key **remains in the JWKS** until all tokens signed with it have expired
3. Resource servers that cache the JWKS will continue to find the old key and can verify existing tokens without interruption

This means the `keys` array in the JWKS response may contain more than one key at any given time. Always select the key whose `kid` matches the JWT header — do not assume the first key in the array is the correct one.

---

## Example Response

```json
{
    "keys": [
        {
            "kty": "RSA",
            "use": "sig",
            "alg": "RS256",
            "kid": "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4",
            "n": "0vx7agoebGcQSuuPiLJXZptN9nndrQmbXEps2aiAFbWhM78LhWx4cbbfAAt
                  VT86zwu1RK7aPFFxuhDR1L6tSoc_BJECPebWKRXjBZCiFV4n3oknjhMstn6
                  4tZ_2W-5JsGY4Hc5n9yBXArwl93lqt7_RN5w6Cf0h4QyQ5v-65YGjQR0_F
                  DW2QvzqY368QQMicAtaSqzs8KJZgnYb9c7d0zgdAZHzu6qMQvRL5hajrn1n
                  91CbOpbISD08qNLyrdkt-bFTWhAI4vMQFh6WeZu0fM4lFd2NcRwr3XPksIN
                  HaQ-G_xBniIqbw0Ls1jF44-csFCur-kEgU8awapJzKnqDKgw",
            "e": "AQAB"
        }
    ]
}
```

### JWK Fields

| Field | Type | Description |
|-------|------|-------------|
| `kty` | `string` | Key type. Always `"RSA"` for this server. |
| `use` | `string` | Intended use. Always `"sig"` (signature verification). |
| `alg` | `string` | Algorithm. Always `"RS256"` (RSA Signature with SHA-256). |
| `kid` | `string` | Key ID. Matches the `kid` claim in the JWT header. Use this to select the correct key when multiple keys are present. |
| `n` | `string` | RSA modulus, Base64url-encoded. |
| `e` | `string` | RSA public exponent, Base64url-encoded. Typically `"AQAB"` (65537). |

---

## Caching

The JWKS endpoint supports HTTP caching to reduce load on the Auth Server and improve resource server performance.

### Cache-Control

Responses include a `Cache-Control` header that permits caching:

```http
Cache-Control: public, max-age=3600
```

Resource servers may cache the JWKS for the duration indicated by `max-age`. Do not fetch the JWKS on every token verification request — this is unnecessary and adds latency.

### ETag and Conditional GET

The endpoint supports ETag-based conditional requests. The response includes an `ETag` header:

```http
ETag: "a1b2c3d4e5f6..."
```

On subsequent requests, include the `If-None-Match` header with the previously received ETag value:

```http
GET /acme.example.com/.well-known/jwks.json
If-None-Match: "a1b2c3d4e5f6..."
```

If the key set has not changed, the server responds with `304 Not Modified` and no body, saving bandwidth. If the keys have changed (e.g., after a rotation), the server responds with `200 OK` and the updated JWKS.

### Recommended Caching Strategy

Cache the JWKS in memory, keyed by tenant domain. Use the following approach:

1. **On startup or first request**: fetch the JWKS and cache it along with the ETag
2. **On subsequent verifications**: use the cached JWKS — do not re-fetch on every request
3. **On unknown `kid`**: if the JWT header contains a `kid` that is not in the cached JWKS, the key may have been rotated — re-fetch the JWKS using a conditional GET with `If-None-Match`
4. **On cache expiry**: re-fetch using a conditional GET; use `304 Not Modified` to avoid unnecessary processing

This strategy handles key rotation gracefully without polling the JWKS endpoint continuously.

```javascript
const jwksCache = new Map(); // Map<tenantDomain, { keys, etag }>

async function getJwks(tenantDomain) {
    const cached = jwksCache.get(tenantDomain);
    const headers = {};

    if (cached?.etag) {
        headers['If-None-Match'] = cached.etag;
    }

    const res = await fetch(
        `https://auth.server.com/${tenantDomain}/.well-known/jwks.json`,
        { headers }
    );

    if (res.status === 304) {
        // Keys unchanged — return cached value
        return cached.keys;
    }

    const jwks = await res.json();
    jwksCache.set(tenantDomain, {
        keys: jwks.keys,
        etag: res.headers.get('etag'),
    });

    return jwks.keys;
}

async function getVerificationKey(tenantDomain, kid) {
    let keys = await getJwks(tenantDomain);
    let key = keys.find(k => k.kid === kid);

    if (!key) {
        // Unknown kid — force a re-fetch in case of key rotation
        jwksCache.delete(tenantDomain);
        keys = await getJwks(tenantDomain);
        key = keys.find(k => k.kid === kid);
    }

    if (!key) {
        throw new Error(`No key found for kid: ${kid}`);
    }

    return key;
}
```

---

## Notes

### Tenant Isolation

Because each tenant has its own key pair, a token from one tenant cannot be verified using another tenant's JWKS. Always use the JWKS endpoint for the **expected** tenant — the one whose resources are being accessed — not the tenant identified in the token's `iss` claim (which is the same for all tenants in the shared-issuer model).

See [Resource Server Verification](resource-server-verification.md) for the complete token verification flow, including how to check the `tenant_id` claim to prevent cross-tenant token reuse.

### Algorithm

All tokens are signed with `RS256`. The `alg` field in each JWK will always be `"RS256"`. Reject tokens with any other algorithm.

### Multiple Keys

During key rotation, the JWKS may contain more than one key. Always select the key by matching `kid` — never assume the first key in the array is the active one.

---

## See Also

- [OIDC Discovery](oidc-discovery.md) — the `jwks_uri` field in the discovery document points to this endpoint
- [Resource Server Verification](resource-server-verification.md) — complete guide to verifying tokens in your API
- [Architecture Overview](architecture.md) — multi-tenant model and token architecture
