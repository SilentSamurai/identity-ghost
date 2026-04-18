import { SharedTestFixture } from '../shared-test.fixture';
import { TokenFixture } from '../token.fixture';

/**
 * Integration tests for login session expiry behavior.
 *
 * Validates that expired sessions reject auth code exchange and refresh token grants
 * with invalid_grant error.
 *
 * Uses the test-only endpoints:
 *   POST /api/test-utils/sessions/:sid/expire  — force-expire a session
 *   GET  /api/test-utils/auth-codes/:code/sid   — look up the sid of an auth code
 *
 * _Requirements: 4.4, 5.4_
 */
describe('Login Session Expiry', () => {
    let app: SharedTestFixture;
    let tokenFixture: TokenFixture;
    let tenantClientId: string;
    let tenantClientSecret: string;

    beforeAll(async () => {
        app = new SharedTestFixture();
        tokenFixture = new TokenFixture(app);

        // Get tenant credentials for refresh grants
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

    /** Force-expire a session via the test-utils endpoint */
    async function expireSession(sid: string): Promise<void> {
        const response = await app.getHttpServer()
            .post(`/api/test-utils/sessions/${sid}/expire`);
        expect(response.status).toEqual(204);
    }

    /** Look up the sid of an auth code via the test-utils endpoint */
    async function getAuthCodeSid(code: string): Promise<string> {
        const response = await app.getHttpServer()
            .get(`/api/test-utils/auth-codes/${code}/sid`);
        expect(response.status).toEqual(200);
        expect(response.body.sid).toBeDefined();
        return response.body.sid;
    }

    // ── Tests ────────────────────────────────────────────────────────

    it('expired session rejects auth code exchange with invalid_grant', async () => {
        // Step 1: Login to get an auth code
        const loginResult = await tokenFixture.login(
            'admin@auth.server.com',
            'admin9000',
            'auth.server.com',
        );
        expect(loginResult.authentication_code).toBeDefined();

        // Step 2: Look up the sid attached to this auth code
        const sid = await getAuthCodeSid(loginResult.authentication_code);

        // Step 3: Expire the session
        await expireSession(sid);

        // Step 4: Try to exchange the auth code — should fail because the session is expired
        const tokenResponse = await app.getHttpServer()
            .post('/api/oauth/token')
            .send({
                grant_type: 'authorization_code',
                code: loginResult.authentication_code,
                code_verifier: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopq',
                client_id: 'auth.server.com',
            })
            .set('Accept', 'application/json');

        expect(tokenResponse.status).toEqual(400);
        expect(tokenResponse.body.error).toEqual('invalid_grant');
    });

    it('expired session rejects refresh with invalid_grant', async () => {
        // Step 1: Get tokens via password grant (creates a session)
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
        const decoded = app.jwtService().decode(response.body.id_token, { json: true }) as any;
        const sid = decoded.sid;
        expect(sid).toBeDefined();

        // Step 2: Expire the session
        await expireSession(sid);

        // Step 3: Try to refresh — should fail with invalid_grant
        const refreshResponse = await app.getHttpServer()
            .post('/api/oauth/token')
            .send({
                grant_type: 'refresh_token',
                refresh_token: response.body.refresh_token,
                client_id: tenantClientId,
                client_secret: tenantClientSecret,
            })
            .set('Accept', 'application/json');

        expect(refreshResponse.status).toEqual(400);
        expect(refreshResponse.body.error).toEqual('invalid_grant');
    });
});
