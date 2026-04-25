/**
 * OAuth 2.0 / OIDC Compatibility Tests
 *
 * Verifies the auth server against the openid-client v6 library (OpenID Certified™).
 * If openid-client can successfully discover, authenticate, validate tokens, introspect,
 * and revoke against our server, it confirms spec compliance and interoperability.
 *
 * Prerequisites:
 *   - The auth server test instance must be running on port 9001
 *     (started by `npm run start:backend`, or via `npm run e2e:test`).
 *   - The "oidc-compat-test.local" tenant must be seeded (added to startUp.service.ts).
 *
 * Usage:
 *   cd compat-tests && npm install && npm run e2e:test
 *
 * Flows tested:
 *   1. OIDC Discovery (/.well-known/openid-configuration)
 *   2. JWKS retrieval and key validation
 *   3. Client Credentials Grant
 *   4. Authorization Code Flow with PKCE (simulated via login API)
 *   5. ID Token validation (signature, claims, nonce)
 *   6. Refresh Token rotation
 *   7. Token Introspection (RFC 7662)
 *   8. Token Revocation (RFC 7009)
 *   9. UserInfo endpoint
 */

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import * as client from 'openid-client';

// ─── Configuration ───────────────────────────────────────────────────────────

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:9001';
const TENANT_DOMAIN = 'oidc-compat-test.local';
const ADMIN_EMAIL = `admin@${TENANT_DOMAIN}`;
const ADMIN_PASSWORD = 'admin9000';
const SUPER_ADMIN_EMAIL = 'admin@auth.server.com';
const SUPER_ADMIN_PASSWORD = 'admin9000';
const SUPER_TENANT_DOMAIN = 'auth.server.com';

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function fetchJson(path, options = {}) {
    const { headers: extraHeaders, ...rest } = options;
    const res = await fetch(`${BASE_URL}${path}`, {
        ...rest,
        headers: { 'Accept': 'application/json', 'Content-Type': 'application/json', ...extraHeaders },
    });
    return { status: res.status, body: await res.json() };
}

async function getPasswordToken(email, password, clientId) {
    const res = await fetchJson('/api/oauth/token', {
        method: 'POST',
        body: JSON.stringify({ grant_type: 'password', username: email, password, client_id: clientId }),
    });
    assert.ok(res.status >= 200 && res.status < 300, `Password grant failed: ${JSON.stringify(res.body)}`);
    return res.body;
}

/**
 * Simulate the Authorization Code flow login step.
 * The server uses /api/oauth/login instead of a browser form.
 * Uses the domain alias as client_id (first-party login path).
 */
async function simulateLogin(email, password, codeChallenge, codeChallengeMethod, scope, nonce) {
    const body = {
        email, password,
        client_id: TENANT_DOMAIN,
        code_challenge: codeChallenge,
        code_challenge_method: codeChallengeMethod,
    };
    if (scope) body.scope = scope;
    if (nonce) body.nonce = nonce;

    const res = await fetchJson('/api/oauth/login', { method: 'POST', body: JSON.stringify(body) });
    assert.ok(res.status >= 200 && res.status < 300, `Login failed: ${JSON.stringify(res.body)}`);
    assert.ok(res.body.authentication_code, `No auth code returned: ${JSON.stringify(res.body)}`);
    return res.body.authentication_code;
}

// ─── Test State ──────────────────────────────────────────────────────────────

let tenantClientId;   // confidential client ID (for client_credentials, introspection, revocation)
let tenantClientSecret;
let superAdminToken;
let tenantId;
/** @type {client.Configuration} Confidential client config */
let config;
/** @type {client.Configuration} Public client config (domain alias, for auth code flow) */
let publicConfig;

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('OIDC Compatibility Tests (openid-client v6)', () => {

    before(async () => {
        // Get super admin token to find the tenant
        const superToken = await getPasswordToken(SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD, SUPER_TENANT_DOMAIN);
        superAdminToken = superToken.access_token;

        // Find the oidc-compat-test.local tenant
        const tenantsRes = await fetchJson('/api/admin/tenant', {
            headers: { 'Authorization': `Bearer ${superAdminToken}` },
        });
        const tenant = tenantsRes.body.find(t => t.domain === TENANT_DOMAIN);
        assert.ok(tenant, `Tenant ${TENANT_DOMAIN} not found. Ensure the server is running with seed data.`);
        tenantId = tenant.id;

        // Get a tenant-scoped token to create a confidential client
        const tenantToken = await getPasswordToken(ADMIN_EMAIL, ADMIN_PASSWORD, TENANT_DOMAIN);

        // Create a confidential client — the only way to get a plaintext secret
        // (the /credentials endpoint returns hashed secrets)
        const createRes = await fetchJson('/api/clients/create', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${tenantToken.access_token}` },
            body: JSON.stringify({
                tenantId,
                name: 'oidc-compat-confidential',
                grantTypes: 'client_credentials',
                allowedScopes: 'openid profile email',
                isPublic: false,
            }),
        });
        assert.ok(createRes.status < 300, `Failed to create confidential client: ${JSON.stringify(createRes.body)}`);
        tenantClientId = createRes.body.client.clientId;
        tenantClientSecret = createRes.body.clientSecret;

        // Discover OIDC configuration using openid-client v6.
        const discoveryUrl = new URL(`${BASE_URL}/${TENANT_DOMAIN}/.well-known/openid-configuration`);
        config = await client.discovery(discoveryUrl, tenantClientId, tenantClientSecret, undefined, {
            execute: [client.allowInsecureRequests],
        });

        // Public client config (domain alias) for auth code flow with PKCE
        publicConfig = await client.discovery(discoveryUrl, TENANT_DOMAIN, undefined, client.None(), {
            execute: [client.allowInsecureRequests],
        });

        console.log(`  Tenant: ${TENANT_DOMAIN} (id: ${tenantId})`);
        console.log(`  Client ID: ${tenantClientId}`);
    });

    // ── 1. OIDC Discovery ────────────────────────────────────────────────

    describe('OIDC Discovery', () => {
        it('should discover server metadata with all required fields', () => {
            const meta = config.serverMetadata();
            assert.ok(meta.issuer, 'issuer missing');
            assert.ok(meta.token_endpoint, 'token_endpoint missing');
            assert.ok(meta.jwks_uri, 'jwks_uri missing');
            assert.ok(meta.authorization_endpoint, 'authorization_endpoint missing');
            assert.ok(meta.introspection_endpoint, 'introspection_endpoint missing');
            assert.ok(meta.revocation_endpoint, 'revocation_endpoint missing');
            assert.ok(meta.userinfo_endpoint, 'userinfo_endpoint missing');
        });

        it('should report supported scopes, grant types, and response types', () => {
            const meta = config.serverMetadata();
            assert.ok(meta.scopes_supported.includes('openid'));
            assert.ok(meta.grant_types_supported.includes('authorization_code'));
            assert.ok(meta.grant_types_supported.includes('client_credentials'));
            assert.ok(meta.grant_types_supported.includes('refresh_token'));
            assert.ok(meta.response_types_supported.includes('code'));
        });

        it('should report RS256 as supported signing algorithm', () => {
            const meta = config.serverMetadata();
            assert.ok(meta.id_token_signing_alg_values_supported.includes('RS256'));
        });
    });

    // ── 2. JWKS ──────────────────────────────────────────────────────────

    describe('JWKS', () => {
        it('should fetch JWKS with at least one RSA key', async () => {
            const meta = config.serverMetadata();
            const res = await fetch(meta.jwks_uri);
            assert.equal(res.status, 200);
            const jwks = await res.json();
            assert.ok(jwks.keys.length > 0, 'No keys in JWKS');
            const rsaKey = jwks.keys.find(k => k.kty === 'RSA');
            assert.ok(rsaKey, 'No RSA key found');
            assert.ok(rsaKey.kid, 'Key missing kid');
            assert.ok(rsaKey.n && rsaKey.e, 'Key missing RSA components');
        });
    });

    // ── 3. Client Credentials Grant ──────────────────────────────────────

    describe('Client Credentials Grant', () => {
        it('should obtain an access token via client_credentials', async () => {
            const tokens = await client.clientCredentialsGrant(config);
            assert.ok(tokens.access_token, 'No access_token');
            assert.equal(tokens.token_type.toLowerCase(), 'bearer');
            assert.ok(tokens.expires_in > 0, 'expires_in should be positive');
        });
    });

    // ── 4. Authorization Code Flow with PKCE ─────────────────────────────

    describe('Authorization Code Flow with PKCE', () => {
        let authCodeTokens;

        it('should complete auth code flow and return tokens', async () => {
            const codeVerifier = client.randomPKCECodeVerifier();
            const codeChallenge = await client.calculatePKCECodeChallenge(codeVerifier);
            const nonce = client.randomNonce();

            // Simulate login to get auth code (uses domain alias as client_id)
            const code = await simulateLogin(
                ADMIN_EMAIL, ADMIN_PASSWORD,
                codeChallenge, 'S256', 'openid profile email', nonce,
            );

            // Build a fake callback URL with the code
            // openid-client extracts the code from the URL query params
            const callbackUrl = new URL(`${BASE_URL}/callback`);
            callbackUrl.searchParams.set('code', code);

            // Exchange code for tokens using openid-client.
            // The token endpoint receives the domain alias as client_id
            // (from the config), which matches the auth code's stored client_id.
            authCodeTokens = await client.authorizationCodeGrant(publicConfig, callbackUrl, {
                pkceCodeVerifier: codeVerifier,
                expectedNonce: nonce,
            });

            assert.ok(authCodeTokens.access_token, 'No access_token');
            assert.equal(authCodeTokens.token_type.toLowerCase(), 'bearer');
            assert.ok(authCodeTokens.refresh_token, 'No refresh_token');
        });

        // ── 5. ID Token Validation ───────────────────────────────────────

        it('should return a valid ID token with correct claims', () => {
            assert.ok(authCodeTokens.id_token, 'No id_token returned');

            const claims = authCodeTokens.claims();
            assert.ok(claims, 'Failed to parse ID token claims');
            assert.ok(claims.sub, 'ID token missing sub');
            assert.ok(claims.iss, 'ID token missing iss');
            assert.ok(claims.iat, 'ID token missing iat');
            assert.ok(claims.exp, 'ID token missing exp');
        });

        // ── 6. Refresh Token Rotation ────────────────────────────────────

        it('should refresh tokens and get a new access token', async () => {
            assert.ok(authCodeTokens.refresh_token, 'No refresh_token to test rotation');

            const refreshed = await client.refreshTokenGrant(publicConfig, authCodeTokens.refresh_token);
            assert.ok(refreshed.access_token, 'No access_token after refresh');
            assert.equal(refreshed.token_type.toLowerCase(), 'bearer');
            assert.ok(refreshed.refresh_token, 'No rotated refresh_token');
        });

        // ── 9. UserInfo Endpoint ─────────────────────────────────────────

        it('should fetch user info with the access token', async () => {
            const claims = authCodeTokens.claims();
            const userInfo = await client.fetchUserInfo(publicConfig, authCodeTokens.access_token, claims.sub);
            assert.ok(userInfo.sub, 'UserInfo missing sub');
            assert.equal(userInfo.sub, claims.sub, 'UserInfo sub does not match ID token sub');
        });
    });

    // ── 7. Token Introspection ───────────────────────────────────────────

    describe('Token Introspection', () => {
        it('should introspect an active access token', async () => {
            const tokens = await client.clientCredentialsGrant(config);
            const introspection = await client.tokenIntrospection(config, tokens.access_token);
            assert.equal(introspection.active, true, 'Token should be active');
            assert.ok(introspection.scope, 'Introspection missing scope');
            assert.equal(introspection.token_type.toLowerCase(), 'bearer');
        });

        it('should return active=false for a garbage token', async () => {
            const introspection = await client.tokenIntrospection(config, 'invalid.garbage.token');
            assert.equal(introspection.active, false, 'Garbage token should be inactive');
        });
    });

    // ── 8. Token Revocation ──────────────────────────────────────────────

    describe('Token Revocation', () => {
        it('should revoke a refresh token successfully', async () => {
            // Get tokens via auth code flow
            const codeVerifier = client.randomPKCECodeVerifier();
            const codeChallenge = await client.calculatePKCECodeChallenge(codeVerifier);
            const code = await simulateLogin(
                ADMIN_EMAIL, ADMIN_PASSWORD,
                codeChallenge, 'S256', 'openid profile email',
            );
            const callbackUrl = new URL(`${BASE_URL}/callback`);
            callbackUrl.searchParams.set('code', code);
            const tokens = await client.authorizationCodeGrant(publicConfig, callbackUrl, {
                pkceCodeVerifier: codeVerifier,
            });

            // Revoke the refresh token — should not throw
            await client.tokenRevocation(config, tokens.refresh_token);

            // Verify the refresh token is now unusable
            await assert.rejects(
                () => client.refreshTokenGrant(publicConfig, tokens.refresh_token),
                'Revoked refresh token should be rejected',
            );
        });
    });
});
