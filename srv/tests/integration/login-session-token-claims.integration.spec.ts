import {SharedTestFixture} from '../shared-test.fixture';
import {TokenFixture} from '../token.fixture';

const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const CLIENT_ID = 'session-claims-test.local';
const EMAIL = 'admin@session-claims-test.local';
const PASSWORD = 'admin9000';
const REDIRECT_URI = 'http://localhost:3000/callback';
const CODE_VERIFIER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopq';
const CODE_CHALLENGE = CODE_VERIFIER; // plain method

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
        // Full cookie-based flow: login → authorize → token exchange
        const tokenResult = await tokenFixture.fetchTokenWithLoginFlow(
            EMAIL, PASSWORD, CLIENT_ID, REDIRECT_URI,
        );
        expect(tokenResult.id_token).toBeDefined();

        const decoded = app.jwtService().decode(tokenResult.id_token, {json: true}) as any;

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
                username: EMAIL,
                password: PASSWORD,
                client_id: CLIENT_ID,
            })
            .set('Accept', 'application/json');

        expect(response.status).toEqual(200);
        expect(response.body.id_token).toBeDefined();

        const decoded = app.jwtService().decode(response.body.id_token, {json: true}) as any;

        expect(decoded.auth_time).toBeDefined();
        expect(Number.isInteger(decoded.auth_time)).toBe(true);
        expect(decoded.sid).toBeDefined();
        expect(typeof decoded.sid).toBe('string');
        expect(decoded.sid).toMatch(UUID_V4_REGEX);
    });

    it('refresh grant — ID token preserves original auth_time and sid', async () => {
        // Step 1: Get tokens via password grant
        const passwordResponse = await app.getHttpServer()
            .post('/api/oauth/token')
            .send({
                grant_type: 'password',
                username: EMAIL,
                password: PASSWORD,
                client_id: CLIENT_ID,
            })
            .set('Accept', 'application/json');

        expect(passwordResponse.status).toEqual(200);
        const originalDecoded = app.jwtService().decode(passwordResponse.body.id_token, {json: true}) as any;
        expect(originalDecoded.auth_time).toBeDefined();
        expect(originalDecoded.sid).toBeDefined();

        // Step 2: Get the default client's ID (public — no secret needed)
        const credentialsResponse = await app.getHttpServer()
            .get('/api/tenant/my/credentials')
            .set('Authorization', `Bearer ${passwordResponse.body.access_token}`)
            .set('Accept', 'application/json');

        expect(credentialsResponse.status).toEqual(200);
        const clientId = credentialsResponse.body.clientId;

        // Step 3: Refresh the token
        const refreshResponse = await app.getHttpServer()
            .post('/api/oauth/token')
            .send({
                grant_type: 'refresh_token',
                refresh_token: passwordResponse.body.refresh_token,
                client_id: clientId,
            })
            .set('Accept', 'application/json');

        expect(refreshResponse.status).toEqual(200);
        expect(refreshResponse.body.id_token).toBeDefined();

        const refreshedDecoded = app.jwtService().decode(refreshResponse.body.id_token, {json: true}) as any;

        // auth_time and sid must be preserved from the original session
        expect(refreshedDecoded.auth_time).toEqual(originalDecoded.auth_time);
        expect(refreshedDecoded.sid).toEqual(originalDecoded.sid);
    });

    it('auth_time is an integer', async () => {
        const response = await app.getHttpServer()
            .post('/api/oauth/token')
            .send({
                grant_type: 'password',
                username: EMAIL,
                password: PASSWORD,
                client_id: CLIENT_ID,
            })
            .set('Accept', 'application/json');

        expect(response.status).toEqual(200);
        const decoded = app.jwtService().decode(response.body.id_token, {json: true}) as any;

        expect(decoded.auth_time).toBeDefined();
        expect(Number.isInteger(decoded.auth_time)).toBe(true);
    });

    it('sid is a UUID string', async () => {
        const response = await app.getHttpServer()
            .post('/api/oauth/token')
            .send({
                grant_type: 'password',
                username: EMAIL,
                password: PASSWORD,
                client_id: CLIENT_ID,
            })
            .set('Accept', 'application/json');

        expect(response.status).toEqual(200);
        const decoded = app.jwtService().decode(response.body.id_token, {json: true}) as any;

        expect(decoded.sid).toBeDefined();
        expect(typeof decoded.sid).toBe('string');
        expect(decoded.sid).toMatch(UUID_V4_REGEX);
    });

    it('prompt=login — new session created — ID token auth_time reflects fresh session', async () => {
        const extractSidCookie = (headers: any): string => {
            const raw: string | string[] = headers['set-cookie'] ?? [];
            const list = Array.isArray(raw) ? raw : [raw];
            return list.find((c: string) => c.startsWith('sid='));
        };

        // Step 1: Login to create a session (sets sid cookie)
        const loginRes = await app.getHttpServer()
            .post('/api/oauth/login')
            .send({email: EMAIL, password: PASSWORD, client_id: CLIENT_ID})
            .set('Accept', 'application/json');

        expect(loginRes.status).toBeGreaterThanOrEqual(200);
        expect(loginRes.status).toBeLessThan(300);

        const sidCookie = extractSidCookie(loginRes.headers);
        expect(sidCookie).toBeDefined();

        const beforeLogin = Math.floor(Date.now() / 1000);

        // Step 2: GET /authorize with prompt=login — forces a new session
        const authorizeRes = await app.getHttpServer()
            .get('/api/oauth/authorize')
            .query({
                response_type: 'code',
                client_id: CLIENT_ID,
                redirect_uri: REDIRECT_URI,
                scope: 'openid profile email',
                state: 'test-state',
                code_challenge: CODE_CHALLENGE,
                code_challenge_method: 'plain',
                prompt: 'login',
            })
            .set('Cookie', sidCookie)
            .redirects(0);

        // prompt=login redirects to the login UI (not directly to redirect_uri)
        expect(authorizeRes.status).toEqual(302);
        const location: string = authorizeRes.headers['location'];
        expect(location).toBeDefined();
        // Should redirect to login page, not to the redirect_uri with a code
        expect(location).not.toContain('code=');

        // Step 3: Re-login to get a fresh session after prompt=login redirect
        const reLoginRes = await app.getHttpServer()
            .post('/api/oauth/login')
            .send({email: EMAIL, password: PASSWORD, client_id: CLIENT_ID})
            .set('Accept', 'application/json');

        expect(reLoginRes.status).toBeGreaterThanOrEqual(200);
        const freshSidCookie = extractSidCookie(reLoginRes.headers);
        expect(freshSidCookie).toBeDefined();

        // Step 4: GET /authorize again with the fresh session (no prompt=login this time)
        const authorize2Res = await app.getHttpServer()
            .get('/api/oauth/authorize')
            .query({
                response_type: 'code',
                client_id: CLIENT_ID,
                redirect_uri: REDIRECT_URI,
                scope: 'openid profile email',
                state: 'test-state-2',
                code_challenge: CODE_CHALLENGE,
                code_challenge_method: 'plain',
                session_confirmed: 'true',
            })
            .set('Cookie', freshSidCookie)
            .redirects(0);

        expect(authorize2Res.status).toEqual(302);
        const location2: string = authorize2Res.headers['location'];
        const redirectUrl = new URL(location2, 'http://localhost');
        const code = redirectUrl.searchParams.get('code');
        expect(code).toBeDefined();

        // Step 5: Exchange code for tokens
        const tokenResponse = await app.getHttpServer()
            .post('/api/oauth/token')
            .send({
                grant_type: 'authorization_code',
                code,
                code_verifier: CODE_VERIFIER,
                client_id: CLIENT_ID,
                redirect_uri: REDIRECT_URI,
            })
            .set('Accept', 'application/json');

        expect(tokenResponse.status).toEqual(200);
        const decoded = app.jwtService().decode(tokenResponse.body.id_token, {json: true}) as any;

        // auth_time should reflect the fresh session (within last 10 seconds)
        expect(decoded.auth_time).toBeDefined();
        expect(Number.isInteger(decoded.auth_time)).toBe(true);
        const now = Math.floor(Date.now() / 1000);
        expect(decoded.auth_time).toBeGreaterThan(beforeLogin - 2);
        expect(decoded.auth_time).toBeLessThanOrEqual(now + 1);
        expect(decoded.sid).toBeDefined();
        expect(decoded.sid).toMatch(UUID_V4_REGEX);
    });

    it('max_age — ID token contains auth_time', async () => {
        const extractSidCookie = (headers: any): string => {
            const raw: string | string[] = headers['set-cookie'] ?? [];
            const list = Array.isArray(raw) ? raw : [raw];
            return list.find((c: string) => c.startsWith('sid='));
        };

        // Login to create a session
        const loginRes = await app.getHttpServer()
            .post('/api/oauth/login')
            .send({email: EMAIL, password: PASSWORD, client_id: CLIENT_ID})
            .set('Accept', 'application/json');

        expect(loginRes.status).toBeGreaterThanOrEqual(200);
        const sidCookie = extractSidCookie(loginRes.headers);
        expect(sidCookie).toBeDefined();

        // GET /authorize with max_age=3600
        const authorizeRes = await app.getHttpServer()
            .get('/api/oauth/authorize')
            .query({
                response_type: 'code',
                client_id: CLIENT_ID,
                redirect_uri: REDIRECT_URI,
                scope: 'openid profile email',
                state: 'test-state',
                code_challenge: CODE_CHALLENGE,
                code_challenge_method: 'plain',
                max_age: 3600,
                session_confirmed: 'true',
            })
            .set('Cookie', sidCookie)
            .redirects(0);

        expect(authorizeRes.status).toEqual(302);
        const location: string = authorizeRes.headers['location'];
        const redirectUrl = new URL(location, 'http://localhost');
        const code = redirectUrl.searchParams.get('code');
        expect(code).toBeDefined();

        // Exchange code for tokens
        const tokenResponse = await app.getHttpServer()
            .post('/api/oauth/token')
            .send({
                grant_type: 'authorization_code',
                code,
                code_verifier: CODE_VERIFIER,
                client_id: CLIENT_ID,
                redirect_uri: REDIRECT_URI,
            })
            .set('Accept', 'application/json');

        expect(tokenResponse.status).toEqual(200);
        const decoded = app.jwtService().decode(tokenResponse.body.id_token, {json: true}) as any;

        // auth_time must be present when max_age was used
        expect(decoded.auth_time).toBeDefined();
        expect(Number.isInteger(decoded.auth_time)).toBe(true);
    });
});
