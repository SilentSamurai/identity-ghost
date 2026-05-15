import {SharedTestFixture} from '../shared-test.fixture';
import {TokenFixture} from '../token.fixture';

const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Integration tests for Login Session Creation (Requirement 1).
 *
 * Validates that POST /api/oauth/login creates a persistent login session
 * and that the session's auth_time and sid are propagated into ID tokens.
 *
 * Since SharedTestFixture connects over HTTP (no direct DB access), we verify
 * session creation indirectly by decoding the ID token returned after login
 * and code exchange (or password grant).
 *
 * _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_
 */
describe('Login Session Creation', () => {
    let app: SharedTestFixture;
    let tokenFixture: TokenFixture;

    // Use a dedicated tenant to avoid conflicts with other tests (per testing-strategy.md)
    const clientId = 'login-session-test.local';
    const email = 'admin@login-session-test.local';
    const password = 'admin9000';
    const redirectUri = 'http://localhost:3000/callback';

    beforeAll(() => {
        app = new SharedTestFixture();
        tokenFixture = new TokenFixture(app);
    });

    afterAll(async () => {
        await app.close();
    });

    it('login creates a session — ID token contains auth_time and sid', async () => {
        // Full cookie-based flow: login → authorize (with consent) → token exchange
        const tokenResult = await tokenFixture.fetchTokenWithAuthCodeFlowAndConsent(
            email, password,
            {
                clientId,
                redirectUri,
                scope: 'openid profile email',
                state: 'test-state',
                codeChallenge: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopq',
                codeChallengeMethod: 'plain',
            },
            'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopq',
        );
        expect(tokenResult.id_token).toBeDefined();

        // Decode the ID token to verify session claims
        const decoded = app.jwtService().decode(tokenResult.id_token, {json: true}) as any;

        expect(decoded.auth_time).toBeDefined();
        expect(Number.isInteger(decoded.auth_time)).toBe(true);
        expect(decoded.sid).toBeDefined();
        expect(typeof decoded.sid).toBe('string');
    });

    it('sid matches UUID v4 format', async () => {
        // Use password grant which also creates a session
        const response = await app.getHttpServer()
            .post('/api/oauth/token')
            .send({
                grant_type: 'password',
                username: email,
                password: password,
                client_id: clientId,
            })
            .set('Accept', 'application/json');

        expect(response.status).toEqual(200);
        expect(response.body.id_token).toBeDefined();

        const decoded = app.jwtService().decode(response.body.id_token, {json: true}) as any;

        expect(decoded.sid).toBeDefined();
        expect(decoded.sid).toMatch(UUID_V4_REGEX);
    });

    it('auth_time is close to current time', async () => {
        const beforeLogin = Math.floor(Date.now() / 1000);

        const response = await app.getHttpServer()
            .post('/api/oauth/token')
            .send({
                grant_type: 'password',
                username: email,
                password: password,
                client_id: clientId,
            })
            .set('Accept', 'application/json');

        const afterLogin = Math.floor(Date.now() / 1000);

        expect(response.status).toEqual(200);
        expect(response.body.id_token).toBeDefined();

        const decoded = app.jwtService().decode(response.body.id_token, {json: true}) as any;

        expect(decoded.auth_time).toBeDefined();
        expect(Number.isInteger(decoded.auth_time)).toBe(true);
        // auth_time should be within a reasonable window around the request
        expect(decoded.auth_time).toBeGreaterThanOrEqual(beforeLogin - 2);
        expect(decoded.auth_time).toBeLessThanOrEqual(afterLogin + 10);
    });

    it('session is persisted before login response', async () => {
        // Full cookie-based flow: login → authorize (with consent) → token exchange.
        // If the session wasn't persisted before the login response, the
        // authorize step would fail to find it and would not issue a code.
        const tokenResult = await tokenFixture.fetchTokenWithAuthCodeFlowAndConsent(
            email, password,
            {
                clientId,
                redirectUri,
                scope: 'openid profile email',
                state: 'test-state',
                codeChallenge: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopq',
                codeChallengeMethod: 'plain',
            },
            'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopq',
        );
        expect(tokenResult.id_token).toBeDefined();

        const decoded = app.jwtService().decode(tokenResult.id_token, {json: true}) as any;

        // Both claims must be present — proves the session was persisted
        // before the login response was returned
        expect(decoded.auth_time).toBeDefined();
        expect(Number.isInteger(decoded.auth_time)).toBe(true);
        expect(decoded.sid).toBeDefined();
        expect(decoded.sid).toMatch(UUID_V4_REGEX);
    });
});
