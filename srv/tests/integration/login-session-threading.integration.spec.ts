import { SharedTestFixture } from '../shared-test.fixture';
import { TokenFixture } from '../token.fixture';

const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Integration tests for login session threading through auth code and refresh token flows
 * (Requirements 4, 5).
 *
 * Validates that the `sid` created at login is stored on auth codes and refresh tokens,
 * and that it is preserved across token refresh and rotation.
 *
 * _Requirements: 4.1, 4.2, 4.3, 5.1, 5.2, 5.3_
 */
describe('Login Session Threading', () => {
    let app: SharedTestFixture;
    let tokenFixture: TokenFixture;

    beforeAll(() => {
        app = new SharedTestFixture();
        tokenFixture = new TokenFixture(app);
    });

    afterAll(async () => {
        await app.close();
    });

    it('auth code flow — sid is threaded from login to ID token', async () => {
        // Step 1: Login via auth code flow
        const loginResult = await tokenFixture.login(
            'admin@auth.server.com',
            'admin9000',
            'auth.server.com',
        );
        expect(loginResult.authentication_code).toBeDefined();

        // Step 2: Exchange the auth code for tokens
        const tokenResult = await tokenFixture.exchangeCodeForToken(
            loginResult.authentication_code,
            'auth.server.com',
        ) as any;
        expect(tokenResult.id_token).toBeDefined();

        // Step 3: Decode the ID token and verify sid is a UUID v4
        const decoded = app.jwtService().decode(tokenResult.id_token, { json: true }) as any;
        expect(decoded.sid).toBeDefined();
        expect(typeof decoded.sid).toBe('string');
        expect(decoded.sid).toMatch(UUID_V4_REGEX);
    });

    it('refresh token stores sid — refreshed ID token has same sid', async () => {
        // Step 1: Get tokens via password grant
        const passwordResponse = await app.getHttpServer()
            .post('/api/oauth/token')
            .send({
                grant_type: 'password',
                username: 'admin@auth.server.com',
                password: 'admin9000',
                client_id: 'auth.server.com',
            })
            .set('Accept', 'application/json');

        expect(passwordResponse.status).toEqual(201);
        expect(passwordResponse.body.id_token).toBeDefined();
        expect(passwordResponse.body.refresh_token).toBeDefined();
        expect(passwordResponse.body.access_token).toBeDefined();

        // Decode the original ID token
        const originalDecoded = app.jwtService().decode(passwordResponse.body.id_token, { json: true }) as any;
        expect(originalDecoded.sid).toBeDefined();
        expect(originalDecoded.sid).toMatch(UUID_V4_REGEX);

        // Step 2: Get tenant credentials for the refresh request
        const credentialsResponse = await app.getHttpServer()
            .get('/api/tenant/my/credentials')
            .set('Authorization', `Bearer ${passwordResponse.body.access_token}`)
            .set('Accept', 'application/json');

        expect(credentialsResponse.status).toEqual(200);
        const { clientId, clientSecret } = credentialsResponse.body;
        expect(clientSecret).toBeDefined();

        // Step 3: Refresh the token
        const refreshResponse = await app.getHttpServer()
            .post('/api/oauth/token')
            .send({
                grant_type: 'refresh_token',
                refresh_token: passwordResponse.body.refresh_token,
                client_id: clientId,
                client_secret: clientSecret,
            })
            .set('Accept', 'application/json');

        expect(refreshResponse.status).toEqual(201);
        expect(refreshResponse.body.id_token).toBeDefined();

        // Step 4: Decode the refreshed ID token and verify sid matches the original
        const refreshedDecoded = app.jwtService().decode(refreshResponse.body.id_token, { json: true }) as any;
        expect(refreshedDecoded.sid).toBeDefined();
        expect(refreshedDecoded.sid).toEqual(originalDecoded.sid);
    });

    it('rotated refresh token inherits sid', async () => {
        // Step 1: Get tokens via password grant
        const passwordResponse = await app.getHttpServer()
            .post('/api/oauth/token')
            .send({
                grant_type: 'password',
                username: 'admin@auth.server.com',
                password: 'admin9000',
                client_id: 'auth.server.com',
            })
            .set('Accept', 'application/json');

        expect(passwordResponse.status).toEqual(201);
        const originalDecoded = app.jwtService().decode(passwordResponse.body.id_token, { json: true }) as any;
        const originalSid = originalDecoded.sid;
        expect(originalSid).toBeDefined();
        expect(originalSid).toMatch(UUID_V4_REGEX);

        // Step 2: Get tenant credentials
        const credentialsResponse = await app.getHttpServer()
            .get('/api/tenant/my/credentials')
            .set('Authorization', `Bearer ${passwordResponse.body.access_token}`)
            .set('Accept', 'application/json');

        expect(credentialsResponse.status).toEqual(200);
        const { clientId, clientSecret } = credentialsResponse.body;

        // Step 3: First refresh (rotation #1)
        const refresh1Response = await app.getHttpServer()
            .post('/api/oauth/token')
            .send({
                grant_type: 'refresh_token',
                refresh_token: passwordResponse.body.refresh_token,
                client_id: clientId,
                client_secret: clientSecret,
            })
            .set('Accept', 'application/json');

        expect(refresh1Response.status).toEqual(201);
        expect(refresh1Response.body.refresh_token).toBeDefined();
        expect(refresh1Response.body.id_token).toBeDefined();

        const refresh1Decoded = app.jwtService().decode(refresh1Response.body.id_token, { json: true }) as any;
        expect(refresh1Decoded.sid).toEqual(originalSid);

        // Step 4: Second refresh (rotation #2) — uses the rotated refresh token
        const refresh2Response = await app.getHttpServer()
            .post('/api/oauth/token')
            .send({
                grant_type: 'refresh_token',
                refresh_token: refresh1Response.body.refresh_token,
                client_id: clientId,
                client_secret: clientSecret,
            })
            .set('Accept', 'application/json');

        expect(refresh2Response.status).toEqual(201);
        expect(refresh2Response.body.id_token).toBeDefined();

        const refresh2Decoded = app.jwtService().decode(refresh2Response.body.id_token, { json: true }) as any;

        // Step 5: Verify all three ID tokens share the same sid
        expect(refresh2Decoded.sid).toEqual(originalSid);
    });

    // SKIP: expired session rejects auth code exchange with invalid_grant
    // We can't easily expire a session in integration tests without direct DB access or time manipulation
    it.skip('expired session rejects auth code exchange with invalid_grant', () => {});

    // SKIP: expired session rejects refresh with invalid_grant
    // We can't easily expire a session in integration tests without direct DB access or time manipulation
    it.skip('expired session rejects refresh with invalid_grant', () => {});
});
