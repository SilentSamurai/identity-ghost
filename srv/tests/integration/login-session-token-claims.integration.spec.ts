import { SharedTestFixture } from '../shared-test.fixture';
import { TokenFixture } from '../token.fixture';

const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Integration tests for auth_time and sid claims in ID Tokens (Requirements 2, 3).
 *
 * Validates that ID tokens issued via authorization_code, password, and refresh_token
 * grants contain correct `auth_time` and `sid` claims sourced from the persistent
 * LoginSession record.
 *
 * _Requirements: 2.1, 2.2, 2.3, 2.4, 3.1, 3.2, 3.3, 3.4_
 */
describe('Login Session Token Claims', () => {
    let app: SharedTestFixture;
    let tokenFixture: TokenFixture;

    beforeAll(() => {
        app = new SharedTestFixture();
        tokenFixture = new TokenFixture(app);
    });

    afterAll(async () => {
        await app.close();
    });

    it('auth code grant — ID token auth_time and sid from session', async () => {
        // Login via auth code flow
        const loginResult = await tokenFixture.login(
            'admin@auth.server.com',
            'admin9000',
            'auth.server.com',
        );
        expect(loginResult.authentication_code).toBeDefined();

        // Exchange the auth code for tokens
        const tokenResult = await tokenFixture.exchangeCodeForToken(
            loginResult.authentication_code,
            'auth.server.com',
        ) as any;
        expect(tokenResult.id_token).toBeDefined();

        // Decode the ID token
        const decoded = app.jwtService().decode(tokenResult.id_token, { json: true }) as any;

        // auth_time must be an integer (Unix epoch seconds)
        expect(decoded.auth_time).toBeDefined();
        expect(Number.isInteger(decoded.auth_time)).toBe(true);

        // sid must be a UUID v4 string
        expect(decoded.sid).toBeDefined();
        expect(typeof decoded.sid).toBe('string');
        expect(decoded.sid).toMatch(UUID_V4_REGEX);
    });

    it('password grant — ID token auth_time and sid from session', async () => {
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

        const decoded = app.jwtService().decode(response.body.id_token, { json: true }) as any;

        // auth_time must be an integer (Unix epoch seconds)
        expect(decoded.auth_time).toBeDefined();
        expect(Number.isInteger(decoded.auth_time)).toBe(true);

        // sid must be a UUID v4 string
        expect(decoded.sid).toBeDefined();
        expect(typeof decoded.sid).toBe('string');
        expect(decoded.sid).toMatch(UUID_V4_REGEX);
    });

    it('refresh grant — ID token preserves original auth_time and sid', async () => {
        // Step 1: Get tokens via password grant (returns refresh_token)
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
        expect(originalDecoded.auth_time).toBeDefined();
        expect(originalDecoded.sid).toBeDefined();

        // Step 2: Get tenant credentials for the refresh request
        const credentialsResponse = await app.getHttpServer()
            .get('/api/tenant/my/credentials')
            .set('Authorization', `Bearer ${passwordResponse.body.access_token}`)
            .set('Accept', 'application/json');

        expect(credentialsResponse.status).toEqual(200);
        const clientId = credentialsResponse.body.clientId;
        const clientSecret = credentialsResponse.body.clientSecret;
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

        // Step 4: Decode the refreshed ID token
        const refreshedDecoded = app.jwtService().decode(refreshResponse.body.id_token, { json: true }) as any;

        // Step 5: Verify auth_time and sid are preserved from the original session
        expect(refreshedDecoded.auth_time).toEqual(originalDecoded.auth_time);
        expect(refreshedDecoded.sid).toEqual(originalDecoded.sid);
    });

    it('auth_time is an integer', async () => {
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

        const decoded = app.jwtService().decode(response.body.id_token, { json: true }) as any;

        expect(decoded.auth_time).toBeDefined();
        expect(Number.isInteger(decoded.auth_time)).toBe(true);
    });

    it('sid is a UUID string', async () => {
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

        const decoded = app.jwtService().decode(response.body.id_token, { json: true }) as any;

        expect(decoded.sid).toBeDefined();
        expect(typeof decoded.sid).toBe('string');
        expect(decoded.sid).toMatch(UUID_V4_REGEX);
    });
});
