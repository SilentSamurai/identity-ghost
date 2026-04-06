import {SharedTestFixture} from '../shared-test.fixture';
import {TokenFixture} from '../token.fixture';
import {TenantClient} from '../api-client/tenant-client';
import {AdminTenantClient} from '../api-client/admin-tenant-client';

/**
 * Integration tests for RFC 7009 Token Revocation and Logout endpoints.
 *
 * POST /api/oauth/revoke
 * POST /api/oauth/logout
 *
 * Both endpoints are protected by JwtAuthGuard — callers must present a valid
 * Bearer token (or Basic client credentials). Tenant is derived from the
 * security context, not from body parameters.
 *
 * Validates:
 *   - Revocation endpoint exposure (Req 1.1, 1.2, 1.3)
 *   - Authentication via JwtAuthGuard (Req 2.1–2.7)
 *   - Token type hint handling (Req 3.1–3.4)
 *   - Refresh token family revocation (Req 4.1–4.3)
 *   - Response behavior per RFC 7009 §2.1 (Req 5.1–5.4)
 *   - Logout sequence (Req 6.1–6.4)
 *   - Security constraints (Req 9.1–9.4)
 */
describe('Token Revocation & Logout Endpoints (RFC 7009)', () => {
    let app: SharedTestFixture;
    let tokenFixture: TokenFixture;

    // Access token for authenticated requests
    let adminAccessToken: string;
    let tenantId: string;

    // Tenant-level client credentials (for refresh grants only)
    let tenantClientId: string;
    let tenantClientSecret: string;

    // Cross-tenant access token
    let crossTenantAccessToken: string;

    beforeAll(async () => {
        app = new SharedTestFixture();
        tokenFixture = new TokenFixture(app);

        // 1. Get a super-admin access token on the default tenant
        const adminResult = await tokenFixture.fetchAccessToken(
            'admin@auth.server.com',
            'admin9000',
            'auth.server.com',
        );
        adminAccessToken = adminResult.accessToken;
        tenantId = adminResult.jwt.tenant.id;

        // 2. Get tenant credentials for refresh grants
        const creds = await app.getHttpServer()
            .get('/api/tenant/my/credentials')
            .set('Authorization', `Bearer ${adminAccessToken}`);
        tenantClientId = creds.body.clientId;
        tenantClientSecret = creds.body.clientSecret;

        // 3. Create a second tenant for cross-tenant isolation tests
        const tenantClient = new TenantClient(app, adminAccessToken);
        const suffix = Date.now().toString().slice(-6);
        const crossTenant = await tenantClient.createTenant(
            `ct-${suffix}`,
            `ct-${suffix}.com`,
        );

        // 4. Get the cross-tenant's tenant-level credentials and obtain a Bearer token
        const adminTenantClient = new AdminTenantClient(app, adminAccessToken);
        const crossCreds = await adminTenantClient.getTenantCredentials(crossTenant.id);
        const crossTokenResult = await tokenFixture.fetchClientCredentialsToken(
            crossCreds.clientId,
            crossCreds.clientSecret,
        );
        crossTenantAccessToken = crossTokenResult.accessToken;
    });

    afterAll(async () => {
        await app.close();
    });

    // ── Helpers ──────────────────────────────────────────────────────

    /** Get a fresh access token and refresh token for the default tenant */
    async function getFreshTokens(): Promise<{ accessToken: string; refreshToken: string }> {
        const result = await tokenFixture.fetchAccessToken(
            'admin@auth.server.com',
            'admin9000',
            'auth.server.com',
        );
        return { accessToken: result.accessToken, refreshToken: result.refreshToken };
    }

    /** Build a token family of the given size by rotating the refresh token */
    async function buildTokenFamily(size: number): Promise<{ accessToken: string; tokens: string[]; latestToken: string }> {
        const result = await tokenFixture.fetchAccessToken(
            'admin@auth.server.com',
            'admin9000',
            'auth.server.com',
        );

        const tokens = [result.refreshToken];
        let currentToken = result.refreshToken;

        for (let i = 1; i < size; i++) {
            const rotation = await app.getHttpServer()
                .post('/api/oauth/token')
                .send({
                    grant_type: 'refresh_token',
                    refresh_token: currentToken,
                    client_id: tenantClientId,
                    client_secret: tenantClientSecret,
                })
                .set('Accept', 'application/json');

            expect(rotation.status).toEqual(201);
            currentToken = rotation.body.refresh_token;
            tokens.push(currentToken);
        }

        return { accessToken: result.accessToken, tokens, latestToken: currentToken };
    }

    /** POST /api/oauth/revoke with Bearer auth */
    function revoke(accessToken: string, body: Record<string, string>) {
        return app.getHttpServer()
            .post('/api/oauth/revoke')
            .send(body)
            .set('Authorization', `Bearer ${accessToken}`)
            .set('Accept', 'application/json');
    }

    /** POST /api/oauth/logout with Bearer auth */
    function logout(accessToken: string, body: Record<string, string>) {
        return app.getHttpServer()
            .post('/api/oauth/logout')
            .send(body)
            .set('Authorization', `Bearer ${accessToken}`)
            .set('Accept', 'application/json');
    }

    /** Attempt a refresh grant — used to verify tokens are revoked */
    async function tryRefreshGrant(refreshToken: string): Promise<number> {
        const response = await app.getHttpServer()
            .post('/api/oauth/token')
            .send({
                grant_type: 'refresh_token',
                refresh_token: refreshToken,
                client_id: tenantClientId,
                client_secret: tenantClientSecret,
            })
            .set('Accept', 'application/json');

        return response.status;
    }

    // ── Revoke: valid refresh token (Req 4.1, 5.1, 5.2) ────────────

    describe('revoke valid refresh token', () => {
        it('returns HTTP 200 with empty body and revokes the entire family', async () => {
            const { accessToken, latestToken } = await buildTokenFamily(2);

            const response = await revoke(accessToken, { token: latestToken });

            expect(response.status).toEqual(200);
            expect(response.body).toEqual({});

            // Verify the entire family is revoked
            const refreshStatus = await tryRefreshGrant(latestToken);
            expect(refreshStatus).toEqual(400); // invalid_grant — revoked
        });
    });

    // ── Revoke: missing token parameter (Req 1.2) ───────────────────

    describe('missing token parameter', () => {
        it('returns 400 with invalid_request when token is missing', async () => {
            const response = await revoke(adminAccessToken, {});

            expect(response.status).toEqual(400);
            expect(response.body.error).toEqual('invalid_request');
            expect(typeof response.body.error_description).toBe('string');
        });

        it('returns 400 with invalid_request when token is empty string', async () => {
            const response = await revoke(adminAccessToken, { token: '' });

            expect(response.status).toEqual(400);
            expect(response.body.error).toEqual('invalid_request');
        });
    });

    // ── Revoke: whitespace-only token (Req 1.2) ─────────────────────

    describe('whitespace-only token', () => {
        it('returns 400 with invalid_request', async () => {
            const response = await revoke(adminAccessToken, { token: '   \t\n  ' });

            expect(response.status).toEqual(400);
            expect(response.body.error).toEqual('invalid_request');
        });
    });

    // ── Revoke: no authentication (Req 2.6) ─────────────────────────

    describe('no authentication', () => {
        it('returns 401 when no Authorization header is provided', async () => {
            const { refreshToken } = await getFreshTokens();
            const response = await app.getHttpServer()
                .post('/api/oauth/revoke')
                .send({ token: refreshToken })
                .set('Accept', 'application/json');

            expect(response.status).toEqual(401);
        });
    });

    // ── Revoke: invalid Bearer token (Req 2.5) ─────────────────────

    describe('invalid Bearer token', () => {
        it('returns 401 for an invalid JWT', async () => {
            const response = await revoke('invalid-jwt-token', { token: 'some-token' });

            expect(response.status).toEqual(401);
        });
    });

    // ── Revoke: unrecognized token string (Req 5.1, 9.1) ───────────

    describe('unrecognized token string', () => {
        it('returns HTTP 200 with empty body', async () => {
            const response = await revoke(adminAccessToken, {
                token: 'completely-random-nonexistent-token-string',
            });

            expect(response.status).toEqual(200);
            expect(response.body).toEqual({});
        });
    });

    // ── Revoke: already-revoked token (Req 4.2) ─────────────────────

    describe('already-revoked token', () => {
        it('returns HTTP 200 without error on second revocation', async () => {
            const { accessToken, refreshToken } = await getFreshTokens();

            // First revocation
            const first = await revoke(accessToken, { token: refreshToken });
            expect(first.status).toEqual(200);

            // Second revocation — idempotent
            const second = await revoke(accessToken, { token: refreshToken });
            expect(second.status).toEqual(200);
            expect(second.body).toEqual({});
        });
    });

    // ── Revoke: expired token (Req 4.3) ─────────────────────────────

    describe('expired token', () => {
        it('returns HTTP 200 and revokes the family', async () => {
            const { accessToken, tokens } = await buildTokenFamily(2);
            const consumedToken = tokens[0]; // first token was consumed during rotation

            const response = await revoke(accessToken, { token: consumedToken });

            expect(response.status).toEqual(200);
            expect(response.body).toEqual({});

            // The latest token in the family should now be revoked
            const refreshStatus = await tryRefreshGrant(tokens[1]);
            expect(refreshStatus).toEqual(400);
        });
    });

    // ── Revoke: cross-tenant token (Req 9.3) ────────────────────────

    describe('cross-tenant token', () => {
        it('returns HTTP 200 but does NOT revoke the token', async () => {
            // Get a refresh token from the default tenant
            const { refreshToken } = await getFreshTokens();

            // Try to revoke it using a cross-tenant Bearer token
            const response = await revoke(crossTenantAccessToken, { token: refreshToken });

            // Should return 200 (no information leakage)
            expect(response.status).toEqual(200);
            expect(response.body).toEqual({});

            // But the token should still be valid — not revoked
            const refreshStatus = await tryRefreshGrant(refreshToken);
            expect(refreshStatus).toEqual(201); // still works
        });
    });

    // ── Revoke: token_type_hint values (Req 3.1–3.4) ───────────────

    describe('token_type_hint handling', () => {
        it('succeeds with token_type_hint=refresh_token', async () => {
            const { accessToken, refreshToken } = await getFreshTokens();
            const response = await revoke(accessToken, {
                token: refreshToken,
                token_type_hint: 'refresh_token',
            });

            expect(response.status).toEqual(200);
            expect(response.body).toEqual({});
        });

        it('succeeds with token_type_hint=access_token', async () => {
            const { accessToken, refreshToken } = await getFreshTokens();
            const response = await revoke(accessToken, {
                token: refreshToken,
                token_type_hint: 'access_token',
            });

            expect(response.status).toEqual(200);
            expect(response.body).toEqual({});
        });

        it('succeeds with unrecognized token_type_hint', async () => {
            const { accessToken, refreshToken } = await getFreshTokens();
            const response = await revoke(accessToken, {
                token: refreshToken,
                token_type_hint: 'some_random_hint',
            });

            expect(response.status).toEqual(200);
            expect(response.body).toEqual({});
        });

        it('succeeds without token_type_hint', async () => {
            const { accessToken, refreshToken } = await getFreshTokens();
            const response = await revoke(accessToken, { token: refreshToken });

            expect(response.status).toEqual(200);
            expect(response.body).toEqual({});
        });
    });

    // ── Response headers (Req 5.3) ──────────────────────────────────

    describe('response headers', () => {
        it('includes Cache-Control: no-store and Pragma: no-cache on revoke success', async () => {
            const { accessToken, refreshToken } = await getFreshTokens();
            const response = await revoke(accessToken, { token: refreshToken });

            expect(response.status).toEqual(200);
            expect(response.headers['cache-control']).toEqual('no-store');
            expect(response.headers['pragma']).toEqual('no-cache');
        });

        it('includes Cache-Control: no-store and Pragma: no-cache on revoke error', async () => {
            const response = await revoke(adminAccessToken, {});

            // Even error responses should have these headers
            expect(response.headers['cache-control']).toEqual('no-store');
            expect(response.headers['pragma']).toEqual('no-cache');
        });

        it('includes Cache-Control: no-store and Pragma: no-cache on logout', async () => {
            const { accessToken, refreshToken } = await getFreshTokens();
            const response = await logout(accessToken, { refresh_token: refreshToken });

            expect(response.status).toEqual(200);
            expect(response.headers['cache-control']).toEqual('no-store');
            expect(response.headers['pragma']).toEqual('no-cache');
        });
    });

    // ── Revoke: form-urlencoded content type (Req 1.3) ──────────────

    describe('form-urlencoded content type', () => {
        it('accepts application/x-www-form-urlencoded', async () => {
            const { accessToken, refreshToken } = await getFreshTokens();
            const response = await app.getHttpServer()
                .post('/api/oauth/revoke')
                .type('form')
                .send({ token: refreshToken })
                .set('Authorization', `Bearer ${accessToken}`)
                .set('Accept', 'application/json');

            expect(response.status).toEqual(200);
            expect(response.body).toEqual({});
        });
    });

    // ── Logout: valid token (Req 6.1, 6.2) ──────────────────────────

    describe('logout with valid token', () => {
        it('returns HTTP 200, revokes family, and includes Set-Cookie headers', async () => {
            const { accessToken, refreshToken } = await getFreshTokens();

            const response = await logout(accessToken, { refresh_token: refreshToken });

            expect(response.status).toEqual(200);
            expect(response.body).toEqual({});

            // Verify Set-Cookie headers with Max-Age=0
            const setCookieHeaders: string[] = [].concat(response.headers['set-cookie']);
            expect(setCookieHeaders).toBeDefined();
            expect(setCookieHeaders.length).toBeGreaterThan(0);

            const cookieString = setCookieHeaders.join('; ');
            expect(cookieString).toContain('Max-Age=0');

            // Verify the token family is revoked
            const refreshStatus = await tryRefreshGrant(refreshToken);
            expect(refreshStatus).toEqual(400);
        });
    });

    // ── Logout: invalid/unrecognized token (Req 6.4) ────────────────

    describe('logout with invalid token', () => {
        it('returns HTTP 200 with Set-Cookie headers', async () => {
            const response = await logout(adminAccessToken, {
                refresh_token: 'completely-invalid-token',
            });

            expect(response.status).toEqual(200);
            expect(response.body).toEqual({});

            const setCookieHeaders: string[] = [].concat(response.headers['set-cookie']);
            expect(setCookieHeaders).toBeDefined();
            expect(setCookieHeaders.length).toBeGreaterThan(0);

            const cookieString = setCookieHeaders.join('; ');
            expect(cookieString).toContain('Max-Age=0');
        });
    });

    // ── Logout: no authentication (Req 2.6) ─────────────────────────

    describe('logout without authentication', () => {
        it('returns 401 when no Authorization header is provided', async () => {
            const { refreshToken } = await getFreshTokens();
            const response = await app.getHttpServer()
                .post('/api/oauth/logout')
                .send({ refresh_token: refreshToken })
                .set('Accept', 'application/json');

            expect(response.status).toEqual(401);
        });
    });

    // ── Logout: without refresh token (Req 6.3) ─────────────────────

    describe('logout without refresh token', () => {
        it('returns HTTP 200 with Set-Cookie headers even without a refresh token', async () => {
            const response = await logout(adminAccessToken, {});

            expect(response.status).toEqual(200);
            expect(response.body).toEqual({});

            const setCookieHeaders: string[] = [].concat(response.headers['set-cookie']);
            expect(setCookieHeaders).toBeDefined();
            const cookieString = setCookieHeaders.join('; ');
            expect(cookieString).toContain('Max-Age=0');
        });
    });
});
