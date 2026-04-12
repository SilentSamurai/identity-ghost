import { SharedTestFixture } from '../shared-test.fixture';
import { TokenFixture } from '../token.fixture';
import { randomUUID } from 'crypto';

/**
 * Integration tests for Logout and Session Invalidation (Requirement 6).
 *
 * Validates that POST /api/oauth/logout with a `sid` invalidates the login
 * session, rejects subsequent token operations referencing that session,
 * and revokes all refresh tokens tied to the session.
 *
 * _Requirements: 6.1, 6.2, 6.3, 6.4_
 */
describe('Login Session Logout', () => {
    let app: SharedTestFixture;
    let tokenFixture: TokenFixture;

    // Tenant credentials for refresh grants
    let tenantClientId: string;
    let tenantClientSecret: string;

    beforeAll(async () => {
        app = new SharedTestFixture();
        tokenFixture = new TokenFixture(app);

        // Get a token to fetch tenant credentials
        const adminResult = await tokenFixture.fetchAccessToken(
            'admin@auth.server.com',
            'admin9000',
            'auth.server.com',
        );

        const creds = await app.getHttpServer()
            .get('/api/tenant/my/credentials')
            .set('Authorization', `Bearer ${adminResult.accessToken}`)
            .set('Accept', 'application/json');

        expect(creds.status).toEqual(200);
        tenantClientId = creds.body.clientId;
        tenantClientSecret = creds.body.clientSecret;
    });

    afterAll(async () => {
        await app.close();
    });

    // ── Helpers ──────────────────────────────────────────────────────

    /** Get tokens via password grant (creates a login session) and extract sid from ID token */
    async function getTokensWithSid(): Promise<{
        accessToken: string;
        refreshToken: string;
        sid: string;
    }> {
        const response = await app.getHttpServer()
            .post('/api/oauth/token')
            .send({
                grant_type: 'password',
                username: 'admin@auth.server.com',
                password: 'admin9000',
                client_id: 'auth.server.com',
            })
            .set('Accept', 'application/json');

        expect(response.status).toEqual(201);
        expect(response.body.id_token).toBeDefined();
        expect(response.body.access_token).toBeDefined();
        expect(response.body.refresh_token).toBeDefined();

        const decoded = app.jwtService().decode(response.body.id_token, { json: true }) as any;
        expect(decoded.sid).toBeDefined();

        return {
            accessToken: response.body.access_token,
            refreshToken: response.body.refresh_token,
            sid: decoded.sid,
        };
    }

    /** POST /api/oauth/logout with Bearer auth */
    function logout(accessToken: string, body: Record<string, string>) {
        return app.getHttpServer()
            .post('/api/oauth/logout')
            .send(body)
            .set('Authorization', `Bearer ${accessToken}`)
            .set('Accept', 'application/json');
    }

    /** Attempt a refresh grant */
    async function tryRefresh(refreshToken: string): Promise<{ status: number; body: any }> {
        const response = await app.getHttpServer()
            .post('/api/oauth/token')
            .send({
                grant_type: 'refresh_token',
                refresh_token: refreshToken,
                client_id: tenantClientId,
                client_secret: tenantClientSecret,
            })
            .set('Accept', 'application/json');

        return { status: response.status, body: response.body };
    }

    // ── Tests ────────────────────────────────────────────────────────

    it('logout with sid succeeds and invalidates the session', async () => {
        // Get tokens + sid via password grant
        const { accessToken, sid } = await getTokensWithSid();

        // Logout with the sid
        const response = await logout(accessToken, { sid });

        expect(response.status).toEqual(200);
        expect(response.body).toEqual({});
    });

    it('invalidated session rejects refresh with invalid_grant', async () => {
        // Get tokens + sid
        const { accessToken, refreshToken, sid } = await getTokensWithSid();

        // Logout to invalidate the session
        const logoutResponse = await logout(accessToken, { sid });
        expect(logoutResponse.status).toEqual(200);

        // Try to refresh — should fail because the session is invalidated
        const refreshResult = await tryRefresh(refreshToken);
        expect(refreshResult.status).toEqual(400);
        expect(refreshResult.body.error).toEqual('invalid_grant');
    });

    it('logout revokes all refresh tokens with matching sid', async () => {
        // Get tokens + sid
        const { accessToken, refreshToken, sid } = await getTokensWithSid();

        // Rotate the refresh token to create a second token in the family
        const rotateResponse = await app.getHttpServer()
            .post('/api/oauth/token')
            .send({
                grant_type: 'refresh_token',
                refresh_token: refreshToken,
                client_id: tenantClientId,
                client_secret: tenantClientSecret,
            })
            .set('Accept', 'application/json');

        expect(rotateResponse.status).toEqual(201);
        const rotatedRefreshToken = rotateResponse.body.refresh_token;
        expect(rotatedRefreshToken).toBeDefined();

        // Logout with sid — should revoke ALL refresh tokens for this session
        const logoutResponse = await logout(accessToken, { sid });
        expect(logoutResponse.status).toEqual(200);

        // Try to refresh with the rotated token — should fail
        const refreshResult = await tryRefresh(rotatedRefreshToken);
        expect(refreshResult.status).toEqual(400);
        expect(refreshResult.body.error).toEqual('invalid_grant');
    });

    it('logout with unknown sid succeeds silently (idempotent)', async () => {
        // Get a valid access token for auth
        const { accessToken } = await getTokensWithSid();

        // Logout with a random UUID that doesn't match any session
        const response = await logout(accessToken, { sid: randomUUID() });

        expect(response.status).toEqual(200);
        expect(response.body).toEqual({});
    });

    it('logout with already-invalidated session succeeds silently (idempotent)', async () => {
        // Get tokens + sid
        const { accessToken, sid } = await getTokensWithSid();

        // First logout — invalidates the session
        const first = await logout(accessToken, { sid });
        expect(first.status).toEqual(200);

        // Second logout with the same sid — should still succeed
        const second = await logout(accessToken, { sid });
        expect(second.status).toEqual(200);
        expect(second.body).toEqual({});
    });
});
