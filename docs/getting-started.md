# Getting Started

## Overview

This guide walks you through integrating with the Auth Server from scratch. By the end you will have:

1. A registered tenant with an admin user
2. An OAuth client configured for the Authorization Code flow with PKCE
3. A working login flow that exchanges an authorization code for tokens
4. A resource server that verifies those tokens

The Auth Server is multi-tenant. Every tenant has its own domain (e.g., `mytenant.example.com`), its own RSA signing keys, and its own set of users and clients. All OAuth/OIDC endpoints are scoped to a tenant domain.

---

## Step 1: Register a Tenant

Before you can issue tokens you need a tenant. The registration endpoint creates a tenant, an initial admin user, and sends a verification email to that user.

```http
POST /api/register-domain
Content-Type: application/json

{
    "name": "Alice Admin",
    "email": "alice@example.com",
    "password": "Str0ng!Password",
    "orgName": "Acme Corp",
    "domain": "acme.example.com"
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | Display name for the initial admin user |
| `email` | Yes | Email address for the admin user |
| `password` | Yes | Password for the admin user |
| `orgName` | Yes | Display name for the tenant organisation |
| `domain` | Yes | Unique domain identifier for the tenant (e.g., `acme.example.com`) |

**Response** `200 OK`

```json
{
    "success": true
}
```

> **Email verification required.** The admin user receives a verification email. The account must be verified before the user can log in.

**Error responses**

| Status | Condition |
|--------|-----------|
| `400 Bad Request` | Domain already exists, or validation failed |
| `409 Conflict` | Email address is already registered |
| `503 Service Unavailable` | Mail service error — registration is rolled back |

---

## Step 2: Obtain OAuth Client Credentials

After verifying your email and logging in as the tenant admin, create an OAuth client for your application. The client credentials (`client_id` and `client_secret`) are what your application uses to identify itself to the Auth Server.

```http
POST /api/clients/create
Authorization: Bearer <admin-access-token>
Content-Type: application/json

{
    "tenantId": "<your-tenant-uuid>",
    "name": "My Web App",
    "redirectUris": ["https://myapp.example.com/callback"],
    "allowedScopes": "openid profile email",
    "grantTypes": "authorization_code refresh_token",
    "responseTypes": "code",
    "requirePkce": true,
    "allowRefreshToken": true
}
```

**Response** `201 Created`

```json
{
    "client": {
        "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
        "name": "My Web App",
        "redirectUris": ["https://myapp.example.com/callback"],
        "allowedScopes": "openid profile email",
        "grantTypes": "authorization_code refresh_token",
        "requirePkce": true
    },
    "clientSecret": "cs_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
}
```

> **Save the `clientSecret` now.** It is only shown once. If you lose it, rotate it via `POST /api/clients/{clientId}/rotate-secret`.

The `client_id` for tenant-scoped flows is the tenant domain (e.g., `acme.example.com`). The UUID returned in `client.id` is the internal identifier used for management operations.

---

## Step 3: Authorization Code Flow with PKCE

The Authorization Code flow with PKCE (RFC 7636) is the recommended flow for web and native applications. It prevents authorization code interception attacks without requiring a client secret to be embedded in the browser.

### How it works

```
Your App                    Auth Server                    User's Browser
   |                             |                               |
   |-- Generate PKCE pair ------>|                               |
   |                             |                               |
   |-- Redirect to /authorize -->|                               |
   |                             |<-- User logs in --------------|
   |                             |-- Redirect with ?code= ------>|
   |<-- Receive auth code -------|                               |
   |                             |                               |
   |-- POST /token (code + verifier) -->|                        |
   |<-- access_token + id_token --------|                        |
```

### 3.1 Generate a PKCE Code Pair

PKCE requires a random `code_verifier` and a derived `code_challenge`. Generate these on the client before redirecting the user.

```typescript
import { randomBytes, createHash } from 'crypto';

function generateCodeVerifier(): string {
    // 43–128 characters, URL-safe base64
    return randomBytes(32).toString('base64url');
}

function generateCodeChallenge(verifier: string): string {
    // S256: BASE64URL(SHA256(ASCII(verifier)))
    return createHash('sha256')
        .update(verifier)
        .digest('base64url');
}

const codeVerifier = generateCodeVerifier();
const codeChallenge = generateCodeChallenge(codeVerifier);

// Store codeVerifier in session — you need it in step 3.3
sessionStorage.setItem('pkce_verifier', codeVerifier);
```

For browser environments without Node.js `crypto`:

```typescript
async function generateCodeVerifier(): Promise<string> {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return btoa(String.fromCharCode(...array))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');
}

async function generateCodeChallenge(verifier: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(verifier);
    const digest = await crypto.subtle.digest('SHA-256', data);
    return btoa(String.fromCharCode(...new Uint8Array(digest)))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');
}
```

### 3.2 Redirect the User to the Authorization Endpoint

Build the authorization URL and redirect the user's browser to it. Also generate a `state` value for CSRF protection.

```typescript
function buildAuthorizationUrl(params: {
    clientId: string;
    redirectUri: string;
    codeChallenge: string;
    state: string;
    scope?: string;
    nonce?: string;
}): string {
    const baseUrl = `https://auth.server.com/api/oauth/authorize`;
    const query = new URLSearchParams({
        response_type: 'code',
        client_id: params.clientId,
        redirect_uri: params.redirectUri,
        code_challenge: params.codeChallenge,
        code_challenge_method: 'S256',
        state: params.state,
        scope: params.scope ?? 'openid profile email',
    });
    if (params.nonce) {
        query.set('nonce', params.nonce);
    }
    return `${baseUrl}?${query.toString()}`;
}

// Generate a random state value for CSRF protection
const state = randomBytes(16).toString('hex');
sessionStorage.setItem('oauth_state', state);

const authUrl = buildAuthorizationUrl({
    clientId: 'acme.example.com',
    redirectUri: 'https://myapp.example.com/callback',
    codeChallenge,
    state,
    scope: 'openid profile email',
});

window.location.href = authUrl;
```

The user is redirected to the Auth Server login page. After a successful login, the Auth Server redirects back to your `redirect_uri` with an authorization code:

```
https://myapp.example.com/callback?code=SplxlOBeZQQYbYS6WxSbIA&state=abc123
```

### 3.3 Exchange the Authorization Code for Tokens

In your callback handler, verify the `state` parameter and then exchange the code for tokens.

```typescript
async function handleCallback(callbackUrl: string): Promise<TokenResponse> {
    const params = new URLSearchParams(new URL(callbackUrl).search);
    const code = params.get('code');
    const returnedState = params.get('state');

    // Verify state to prevent CSRF attacks
    const savedState = sessionStorage.getItem('oauth_state');
    if (returnedState !== savedState) {
        throw new Error('State mismatch — possible CSRF attack');
    }
    sessionStorage.removeItem('oauth_state');

    const codeVerifier = sessionStorage.getItem('pkce_verifier');
    if (!codeVerifier) {
        throw new Error('Code verifier not found in session');
    }
    sessionStorage.removeItem('pkce_verifier');

    const response = await fetch('https://auth.server.com/api/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            grant_type: 'authorization_code',
            code,
            code_verifier: codeVerifier,
            client_id: 'acme.example.com',
        }),
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(`Token exchange failed: ${error.error_description}`);
    }

    return response.json();
}

interface TokenResponse {
    access_token: string;
    token_type: 'Bearer';
    expires_in: number;
    refresh_token: string;
    id_token: string;
    scope: string;
}
```

**Token endpoint request parameters**

| Parameter | Required | Description |
|-----------|----------|-------------|
| `grant_type` | Yes | Must be `authorization_code` |
| `code` | Yes | The authorization code from the callback |
| `code_verifier` | Yes | The original PKCE verifier (not the challenge) |
| `client_id` | Yes | Your tenant domain (e.g., `acme.example.com`) |
| `redirect_uri` | Conditional | Required if included in the authorization request |

**Token endpoint response**

```json
{
    "access_token": "eyJhbGciOiJSUzI1NiIsImtpZCI6ImExYjJjM2Q0In0...",
    "token_type": "Bearer",
    "expires_in": 3600,
    "refresh_token": "8xLOxBtZp8",
    "id_token": "eyJhbGciOiJSUzI1NiIsImtpZCI6ImExYjJjM2Q0In0...",
    "scope": "openid profile email"
}
```

### 3.4 Decode the ID Token

The `id_token` is a JWT containing claims about the authenticated user. Decode it to get the user's identity.

```typescript
function decodeJwtPayload(token: string): Record<string, unknown> {
    const [, payloadB64] = token.split('.');
    return JSON.parse(atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/')));
}

const idTokenPayload = decodeJwtPayload(idToken);
console.log(idTokenPayload);
// {
//   "sub": "550e8400-e29b-41d4-a716-446655440000",
//   "email": "alice@example.com",
//   "name": "Alice Admin",
//   "iss": "auth.server.com",
//   "aud": "acme.example.com",
//   "exp": 1700003600,
//   "iat": 1700000000,
//   "nonce": "n-0S6_WzA2Mj"
// }
```

> **Do not trust the ID token payload without verifying the signature** in security-sensitive contexts. Use the access token for API calls and verify it on the resource server as described in Step 4.

### 3.5 Refresh the Access Token

Access tokens expire (default: 1 hour). Use the refresh token to obtain a new access token without requiring the user to log in again.

```typescript
async function refreshTokens(
    refreshToken: string,
    clientId: string,
): Promise<TokenResponse> {
    const response = await fetch('https://auth.server.com/api/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
            client_id: clientId,
        }),
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(`Token refresh failed: ${error.error_description}`);
    }

    return response.json();
}
```

> **Important:** The response contains a new `refresh_token`. Always replace the stored refresh token with the new one. Reusing a consumed refresh token revokes the entire token family. See [Refresh Token Rotation](refresh-token-rotation.md) for details.

---

## Step 4: Verify Tokens in a Resource Server

Your API (resource server) must verify every incoming access token before trusting it. The Auth Server uses per-tenant RSA key pairs, so verification requires fetching the correct public key for the token's tenant.

### 4.1 Install dependencies

```bash
npm install jsonwebtoken jwks-rsa
```

### 4.2 Complete verification example

```typescript
import { createPublicKey } from 'crypto';
import * as jwt from 'jsonwebtoken';

interface VerifiedToken {
    sub: string;
    email?: string;
    name?: string;
    tenant_id: string;
    scope: string;
    roles?: string[];
    client_id: string;
    iss: string;
    aud: string | string[];
    exp: number;
    iat: number;
}

async function verifyAccessToken(
    token: string,
    expectedTenantDomain: string,
    expectedTenantId: string,
    expectedAudience?: string,
): Promise<VerifiedToken> {
    // Step 1: Extract kid from JWT header
    const [headerB64] = token.split('.');
    const header = JSON.parse(
        Buffer.from(headerB64, 'base64url').toString(),
    );

    if (header.alg !== 'RS256') {
        throw new Error(`Unsupported algorithm: ${header.alg}`);
    }

    // Step 2: Fetch the tenant's JWKS
    const jwksUrl =
        `https://auth.server.com/${expectedTenantDomain}/.well-known/jwks.json`;
    const jwksRes = await fetch(jwksUrl);
    if (!jwksRes.ok) {
        throw new Error('Failed to fetch JWKS');
    }
    const { keys } = await jwksRes.json() as { keys: JsonWebKey[] };

    // Step 3: Find the key matching the token's kid
    const jwk = keys.find((k: any) => k.kid === header.kid);
    if (!jwk) {
        throw new Error(`No key found for kid: ${header.kid}`);
    }

    // Step 4: Verify the RS256 signature
    const keyObject = createPublicKey({ key: jwk, format: 'jwk' });
    const pem = keyObject.export({ type: 'spki', format: 'pem' }) as string;

    const verifyOptions: jwt.VerifyOptions = {
        algorithms: ['RS256'],
        issuer: 'auth.server.com',
    };
    if (expectedAudience) {
        verifyOptions.audience = expectedAudience;
    }

    const payload = jwt.verify(token, pem, verifyOptions) as VerifiedToken;

    // Step 5: Confirm tenant_id to prevent cross-tenant token reuse
    if (payload.tenant_id !== expectedTenantId) {
        throw new Error(
            `tenant_id mismatch: expected ${expectedTenantId}, got ${payload.tenant_id}`,
        );
    }

    return payload;
}
```

### 4.3 Use it in an Express middleware

```typescript
import express, { Request, Response, NextFunction } from 'express';

const TENANT_DOMAIN = 'acme.example.com';
const TENANT_ID = '550e8400-e29b-41d4-a716-446655440000'; // your tenant UUID

async function authMiddleware(
    req: Request,
    res: Response,
    next: NextFunction,
): Promise<void> {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
        res.status(401).json({
            error: 'invalid_token',
            error_description: 'Missing or malformed Authorization header',
        });
        return;
    }

    const token = authHeader.slice(7);

    try {
        const payload = await verifyAccessToken(token, TENANT_DOMAIN, TENANT_ID);
        (req as any).user = payload;
        next();
    } catch {
        res.status(401).json({
            error: 'invalid_token',
            error_description: 'The access token is invalid or has expired',
        });
    }
}

const app = express();
app.use('/api', authMiddleware);

app.get('/api/profile', (req: Request, res: Response) => {
    const user = (req as any).user;
    res.json({ sub: user.sub, email: user.email, name: user.name });
});
```

> **Do not reveal the reason for rejection** (expired, wrong tenant, bad signature) in the error response. Return a generic `invalid_token` message to prevent information leakage.

### 4.4 Cache the JWKS

Fetching the JWKS on every request adds latency. Cache the keys per tenant and refresh only when a token presents an unknown `kid`.

```typescript
const jwksCache = new Map<string, { keys: any[]; fetchedAt: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

async function getJwks(tenantDomain: string): Promise<any[]> {
    const cached = jwksCache.get(tenantDomain);
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
        return cached.keys;
    }

    const res = await fetch(
        `https://auth.server.com/${tenantDomain}/.well-known/jwks.json`,
    );
    if (!res.ok) throw new Error('Failed to fetch JWKS');

    const { keys } = await res.json();
    jwksCache.set(tenantDomain, { keys, fetchedAt: Date.now() });
    return keys;
}
```

### 4.5 Access token claims reference

| Claim | Description | Example |
|-------|-------------|---------|
| `sub` | User ID (UUID) | `550e8400-e29b-41d4-a716-446655440000` |
| `email` | User email (requires `email` scope) | `alice@example.com` |
| `name` | Display name (requires `profile` scope) | `Alice Admin` |
| `tenant_id` | Issuing tenant UUID | `a1b2c3d4-e5f6-7890-abcd-ef1234567890` |
| `scope` | Space-delimited granted scopes | `openid profile email` |
| `roles` | Array of role names (user tokens only) | `["TENANT_ADMIN"]` |
| `client_id` | OAuth client that requested the token | `acme.example.com` |
| `iss` | Issuer — always the Auth Server domain | `auth.server.com` |
| `aud` | Audience — intended recipients | `["my-api"]` |
| `exp` | Expiration time (Unix timestamp) | `1700003600` |
| `iat` | Issued at (Unix timestamp) | `1700000000` |
| `grant_type` | OAuth grant used | `authorization_code` |

> **Scopes vs roles:** `scope` contains OIDC values (`openid`, `profile`, `email`). `roles` contains authorization roles (`TENANT_ADMIN`, `TENANT_VIEWER`, or custom roles). These are independent — never use scope values for authorization decisions in your resource server. See [Token API](token-api.md) for the full roles format including app-owned roles.

---

## Complete End-to-End Example

The following TypeScript snippet ties all the steps together for a Node.js/Express application.

```typescript
import express from 'express';
import { randomBytes, createHash, createPublicKey } from 'crypto';
import * as jwt from 'jsonwebtoken';
import session from 'express-session';

const app = express();
app.use(session({ secret: 'change-me', resave: false, saveUninitialized: false }));

const AUTH_SERVER = 'https://auth.server.com';
const TENANT_DOMAIN = 'acme.example.com';
const CLIENT_ID = 'acme.example.com';
const REDIRECT_URI = 'https://myapp.example.com/callback';
const TENANT_ID = '550e8400-e29b-41d4-a716-446655440000';

// ── 1. Start login ────────────────────────────────────────────────────────────

app.get('/login', async (req, res) => {
    const verifier = randomBytes(32).toString('base64url');
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    const state = randomBytes(16).toString('hex');

    (req.session as any).pkceVerifier = verifier;
    (req.session as any).oauthState = state;

    const params = new URLSearchParams({
        response_type: 'code',
        client_id: CLIENT_ID,
        redirect_uri: REDIRECT_URI,
        code_challenge: challenge,
        code_challenge_method: 'S256',
        state,
        scope: 'openid profile email',
    });

    res.redirect(`${AUTH_SERVER}/api/oauth/authorize?${params}`);
});

// ── 2. Handle callback ────────────────────────────────────────────────────────

app.get('/callback', async (req, res) => {
    const { code, state, error } = req.query as Record<string, string>;

    if (error) {
        return res.status(400).send(`Auth error: ${error}`);
    }

    if (state !== (req.session as any).oauthState) {
        return res.status(400).send('State mismatch');
    }

    const verifier = (req.session as any).pkceVerifier;
    delete (req.session as any).pkceVerifier;
    delete (req.session as any).oauthState;

    const tokenRes = await fetch(`${AUTH_SERVER}/api/oauth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            grant_type: 'authorization_code',
            code,
            code_verifier: verifier,
            client_id: CLIENT_ID,
        }),
    });

    if (!tokenRes.ok) {
        const err = await tokenRes.json();
        return res.status(400).send(`Token error: ${err.error_description}`);
    }

    const tokens = await tokenRes.json();
    (req.session as any).accessToken = tokens.access_token;
    (req.session as any).refreshToken = tokens.refresh_token;

    res.redirect('/profile');
});

// ── 3. Protected route ────────────────────────────────────────────────────────

app.get('/profile', async (req, res) => {
    const token = (req.session as any).accessToken;
    if (!token) return res.redirect('/login');

    try {
        const payload = await verifyAccessToken(token, TENANT_DOMAIN, TENANT_ID);
        res.json({ sub: payload.sub, email: payload.email });
    } catch {
        res.redirect('/login');
    }
});

// ── Token verification (reuse from Step 4) ────────────────────────────────────

async function verifyAccessToken(token: string, tenantDomain: string, tenantId: string) {
    const [headerB64] = token.split('.');
    const header = JSON.parse(Buffer.from(headerB64, 'base64url').toString());

    const jwksRes = await fetch(`${AUTH_SERVER}/${tenantDomain}/.well-known/jwks.json`);
    const { keys } = await jwksRes.json() as { keys: any[] };
    const jwk = keys.find((k: any) => k.kid === header.kid);
    if (!jwk) throw new Error('Unknown kid');

    const pem = createPublicKey({ key: jwk, format: 'jwk' })
        .export({ type: 'spki', format: 'pem' }) as string;

    const payload = jwt.verify(token, pem, {
        algorithms: ['RS256'],
        issuer: AUTH_SERVER.replace('https://', ''),
    }) as any;

    if (payload.tenant_id !== tenantId) throw new Error('Tenant mismatch');
    return payload;
}

app.listen(3000);
```

---

## Next Steps

- [OAuth API](oauth.md) — full reference for the `/authorize` and `/token` endpoints
- [Token API](token-api.md) — JWT claims reference including roles and scopes
- [Resource Server Verification](resource-server-verification.md) — detailed verification guide with security checklist
- [JWKS Endpoint](jwks-endpoint.md) — JWKS format, caching, and ETag support
- [Refresh Token Rotation](refresh-token-rotation.md) — refresh token lifecycle and rotation policy
- [Client API](client-api.md) — managing OAuth clients programmatically
- [Architecture Overview](architecture.md) — multi-tenant model and token architecture
