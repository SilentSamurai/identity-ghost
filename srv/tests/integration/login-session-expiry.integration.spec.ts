import {SharedTestFixture} from '../shared-test.fixture';
import {TokenFixture} from '../token.fixture';

/**
 * Integration tests for login session invalidation behavior.
 *
 * Validates that invalidated sessions (via logout) reject refresh token grants
 * with invalid_grant error.
 *
 * Uses the production logout endpoint:
 *   POST /api/oauth/logout  — invalidate a session by sid
 *
 * _Requirements: 4.4, 5.4_
 */
describe('Login Session Invalidation', () => {
    let app: SharedTestFixture;
    let tokenFixture: TokenFixture;
    let tenantClientId: string;
    let tenantClientSecret: string;

    beforeAll(async () => {
        app = new SharedTestFixture();
        tokenFixture = new TokenFixture(app);

        // Get tenant credentials for refresh grants
        const adminResult = await tokenFixture.fetchPasswordGrantAccessToken(
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

    it('invalidated session rejects refresh with invalid_grant', async () => {
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

        expect(response.status).toEqual(200);
        const decoded = app.jwtService().decode(response.body.id_token, {json: true}) as any;
        const sid = decoded.sid;
        expect(sid).toBeDefined();

        // Step 2: Invalidate the session via logout endpoint (using Bearer token auth)
        const logoutResponse = await app.getHttpServer()
            .post('/api/oauth/logout')
            .send({
                sid: sid,
            })
            .set('Authorization', `Bearer ${response.body.access_token}`)
            .set('Accept', 'application/json');

        expect(logoutResponse.status).toEqual(200);

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
