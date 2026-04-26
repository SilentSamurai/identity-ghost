### Resource Server Token Verification

This guide explains how resource servers should verify access tokens issued by this Auth Server in a multi-tenant
environment.

#### Overview

The Auth Server uses a **shared-issuer model** where all tenants share a single `iss` (issuer) claim value. Tenant
isolation is enforced through:

1. **Per-tenant RSA key pairs** — Each tenant has its own signing keys with unique `kid` values
2. **`tenant_id` claim** — Every token contains the UUID of the issuing tenant
3. **Tenant-scoped JWKS endpoint** — Each tenant's keys are published at a dedicated endpoint

Resource servers must verify both the cryptographic signature AND the tenant context to prevent cross-tenant token
reuse.

---

### Verification Checklist

Follow these steps in order when verifying an access token:

| Step | Action                                                  | Purpose                                                   |
|------|---------------------------------------------------------|-----------------------------------------------------------|
| 1    | Extract `kid` from JWT JOSE header                      | Identify which key was used to sign the token             |
| 2    | Fetch JWKS from `/{tenantDomain}/.well-known/jwks.json` | Get the public keys for the expected tenant               |
| 3    | Find JWK with matching `kid`                            | Locate the correct verification key                       |
| 4    | Verify RS256 signature                                  | Confirm the token was signed by the tenant's private key  |
| 5    | Validate standard claims (`exp`, `nbf`, `iss`, `aud`)   | Ensure token is not expired and intended for your service |
| 6    | Confirm `tenant_id` matches expected tenant             | Prevent cross-tenant token reuse                          |

---

### Step-by-Step Verification

#### 1. Extract the `kid` from the JWT Header

The JWT header contains the Key ID (`kid`) that identifies which key was used to sign the token.

```javascript
const header = JSON.parse(Buffer.from(token.split('.')[0], 'base64url').toString());
const kid = header.kid;
const alg = header.alg; // Must be "RS256"
```

#### 2. Fetch the JWKS for the Expected Tenant

Request the JSON Web Key Set from the tenant-specific endpoint. You must know the tenant domain in advance.

```http
GET /{tenantDomain}/.well-known/jwks.json
Accept: application/json
```

**Response:**

```json
{
  "keys": [
    {
      "kty": "RSA",
      "alg": "RS256",
      "use": "sig",
      "kid": "a1b2c3d4e5f6g7h8",
      "n": "...",
      "e": "AQAB"
    }
  ]
}
```

#### 3. Find the JWK with Matching `kid`

Locate the key in the JWKS that matches the `kid` from the JWT header.

```javascript
const jwk = jwks.keys.find(k => k.kid === kid);
if (!jwk) {
  throw new Error('Key not found for kid');
}
```

#### 4. Verify the RS256 Signature

Use the JWK to verify the token signature.

```javascript
const { createPublicKey } = require('crypto');
const jwt = require('jsonwebtoken');

const keyObject = createPublicKey({
  key: { kty: 'RSA', n: jwk.n, e: jwk.e },
  format: 'jwk',
});
const pem = keyObject.export({ type: 'spki', format: 'pem' });

const payload = jwt.verify(token, pem, { algorithms: ['RS256'] });
```

#### 5. Validate Standard Claims

Verify the standard JWT claims:

| Claim | Validation                                                  |
|-------|-------------------------------------------------------------|
| `exp` | Token must not be expired                                   |
| `nbf` | Token must be valid at current time                         |
| `iss` | Must match the Auth Server issuer (e.g., `auth.server.com`) |
| `aud` | Must include your resource server's audience                |

#### 6. Confirm `tenant_id` Matches Expected Tenant

**This is the critical step for multi-tenant isolation.**

```javascript
if (payload.tenant_id !== expectedTenantId) {
  throw new Error('Token tenant_id does not match expected tenant');
}
```

The `tenant_id` claim in the token must match the tenant whose resources are being accessed. This prevents a token
issued for Tenant A from being used to access Tenant B's resources.

---

### Complete Verification Example

```javascript
const { createPublicKey } = require('crypto');
const jwt = require('jsonwebtoken');

async function verifyToken(token, expectedTenantDomain, expectedTenantId) {
  // Step 1: Extract kid from header
  const header = JSON.parse(
    Buffer.from(token.split('.')[0], 'base64url').toString()
  );
  
  if (header.alg !== 'RS256') {
    throw new Error('Unsupported algorithm');
  }
  
  // Step 2: Fetch JWKS for the expected tenant
  const jwksRes = await fetch(
    `https://auth.server.com/${expectedTenantDomain}/.well-known/jwks.json`
  );
  if (!jwksRes.ok) {
    throw new Error('Failed to fetch JWKS');
  }
  const jwks = await jwksRes.json();
  
  // Step 3: Find matching JWK
  const jwk = jwks.keys.find(k => k.kid === header.kid);
  if (!jwk) {
    throw new Error('Key not found for kid');
  }
  
  // Step 4: Verify signature
  const keyObject = createPublicKey({
    key: { kty: 'RSA', n: jwk.n, e: jwk.e },
    format: 'jwk',
  });
  const pem = keyObject.export({ type: 'spki', format: 'pem' });
  
  const payload = jwt.verify(token, pem, {
    algorithms: ['RS256'],
    issuer: 'auth.server.com',
  });
  
  // Step 5: Standard claims validated by jwt.verify above
  
  // Step 6: Confirm tenant_id
  if (payload.tenant_id !== expectedTenantId) {
    throw new Error('Token tenant_id does not match expected tenant');
  }
  
  return payload;
}
```

---

### Common Mistakes

| Mistake                                         | Consequence                                         | Prevention                                                               |
|-------------------------------------------------|-----------------------------------------------------|--------------------------------------------------------------------------|
| Trusting signature without checking `tenant_id` | Token from Tenant A can access Tenant B's resources | Always verify `payload.tenant_id === expectedTenantId`                   |
| Fetching JWKS from wrong tenant endpoint        | Verification fails or succeeds with wrong key       | Use the tenant-specific endpoint `/{tenantDomain}/.well-known/jwks.json` |
| Caching JWKS across tenants                     | Key confusion, verification failures                | Cache keys per-tenant, keyed by tenant domain                            |
| Using global JWKS endpoint                      | May receive keys from wrong tenant                  | Always use tenant-scoped JWKS endpoint                                   |
| Ignoring `kid` mismatch                         | Verification with wrong key                         | Ensure `kid` in JWT header matches `kid` in JWK                          |

---

### Why Tenant-Scoped Verification Matters

In a shared-issuer model, the `iss` claim is identical for all tenants. Without checking `tenant_id`:

1. An attacker obtains a valid token for Tenant A
2. The attacker presents the token to a resource server for Tenant B
3. Signature verification succeeds (the key is valid)
4. The attacker gains access to Tenant B's resources

By requiring `tenant_id` to match the expected tenant, you ensure that tokens are only valid within their issuing
tenant's context.

---

### Token Claims Reference

| Claim        | Description                                              | Example                                |
|--------------|----------------------------------------------------------|----------------------------------------|
| `iss`        | Issuer — always the Auth Server domain                   | `auth.server.com`                      |
| `sub`        | Subject — user ID (UUID) or `oauth` for technical tokens | `550e8400-e29b-41d4-a716-446655440000` |
| `aud`        | Audience — array of intended recipients                  | `["my-api"]`                           |
| `exp`        | Expiration time (Unix timestamp)                         | `1700000000`                           |
| `nbf`        | Not valid before (Unix timestamp)                        | `1699999000`                           |
| `iat`        | Issued at (Unix timestamp)                               | `1699999000`                           |
| `jti`        | JWT ID — unique token identifier                         | `550e8400-e29b-41d4-a716-446655440001` |
| `tenant_id`  | Issuing tenant's UUID                                    | `550e8400-e29b-41d4-a716-446655440002` |
| `scope`      | Space-delimited OAuth scopes                             | `openid profile email`                 |
| `roles`      | Array of role names (user tokens only)                   | `["TENANT_ADMIN"]`                     |
| `client_id`  | OAuth client that requested the token                    | `my-client.local`                      |
| `grant_type` | OAuth grant used to obtain the token                     | `password`, `client_credentials`, etc. |

---

### Error Handling

When token verification fails, return HTTP 401 with:

```http
HTTP/1.1 401 Unauthorized
WWW-Authenticate: Bearer error="invalid_token"
Content-Type: application/json

{
  "error": "invalid_token",
  "error_description": "The access token is invalid or has expired"
}
```

Do not reveal whether the failure was due to:

- Expired token
- Wrong tenant
- Invalid signature
- Unknown key

This prevents information leakage that could aid attackers.
