/**
 * Integration tests for AuthCodeService.
 *
 * Tests the authorization code lifecycle through the real HTTP endpoints:
 * - Creating authorization codes (via login)
 * - Validating authorization codes with PKCE (via token exchange)
 * - Single-use enforcement
 * - requireAuthTime flag propagation
 *
 * Uses SharedTestFixture to hit the running NestJS app with real database operations.
 */
import {SharedTestFixture} from '../shared-test.fixture';
import {TokenFixture} from '../token.fixture';

describe('AuthCodeService', () => {
    let app: SharedTestFixture;
    let tokenFixture: TokenFixture;

    const CLIENT_ID = 'auth.server.com';
    const EMAIL = 'admin@auth.server.com';
    const PASSWORD = 'admin9000';
    const CODE_CHALLENGE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopq';
    const CODE_VERIFIER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopq';

    beforeAll(() => {
        app = new SharedTestFixture();
        tokenFixture = new TokenFixture(app);
    });

    afterAll(async () => {
        await app.close();
    });

    describe('auth code creation via login', () => {
        it('should create an auth code on successful login', async () => {
            const response = await app.getHttpServer()
                .post('/api/oauth/login')
                .send({
                    email: EMAIL,
                    password: PASSWORD,
                    client_id: CLIENT_ID,
                    code_challenge: CODE_CHALLENGE,
                    code_challenge_method: 'plain',
                })
                .set('Accept', 'application/json');

            expect(response.status).toEqual(201);
            expect(response.body.authentication_code).toBeDefined();
            expect(typeof response.body.authentication_code).toBe('string');
            expect(response.body.authentication_code.length).toBeGreaterThan(0);
        });
    });

    describe('PKCE validation via token exchange', () => {
        it('should reject token exchange with invalid code verifier', async () => {
            const loginResponse = await app.getHttpServer()
                .post('/api/oauth/login')
                .send({
                    email: EMAIL,
                    password: PASSWORD,
                    client_id: CLIENT_ID,
                    code_challenge: CODE_CHALLENGE,
                    code_challenge_method: 'plain',
                })
                .set('Accept', 'application/json');

            expect(loginResponse.status).toEqual(201);

            const tokenResponse = await app.getHttpServer()
                .post('/api/oauth/token')
                .send({
                    grant_type: 'authorization_code',
                    code: loginResponse.body.authentication_code,
                    code_verifier: 'WRONG_VERIFIER_that_does_not_match_the_challenge_at_all',
                    client_id: CLIENT_ID,
                })
                .set('Accept', 'application/json');

            expect(tokenResponse.status).toEqual(400);
            expect(tokenResponse.body.error).toEqual('invalid_grant');
        });

        it('should succeed with valid code verifier', async () => {
            const loginResponse = await app.getHttpServer()
                .post('/api/oauth/login')
                .send({
                    email: EMAIL,
                    password: PASSWORD,
                    client_id: CLIENT_ID,
                    code_challenge: CODE_CHALLENGE,
                    code_challenge_method: 'plain',
                })
                .set('Accept', 'application/json');

            expect(loginResponse.status).toEqual(201);

            const tokenResponse = await app.getHttpServer()
                .post('/api/oauth/token')
                .send({
                    grant_type: 'authorization_code',
                    code: loginResponse.body.authentication_code,
                    code_verifier: CODE_VERIFIER,
                    client_id: CLIENT_ID,
                })
                .set('Accept', 'application/json');

            expect(tokenResponse.status).toEqual(200);
            expect(tokenResponse.body.access_token).toBeDefined();
            expect(tokenResponse.body.refresh_token).toBeDefined();
            expect(tokenResponse.body.token_type).toEqual('Bearer');
        });
    });

    describe('auth code single-use enforcement', () => {
        it('should reject a second token exchange with the same auth code', async () => {
            const loginResponse = await app.getHttpServer()
                .post('/api/oauth/login')
                .send({
                    email: EMAIL,
                    password: PASSWORD,
                    client_id: CLIENT_ID,
                    code_challenge: CODE_CHALLENGE,
                    code_challenge_method: 'plain',
                })
                .set('Accept', 'application/json');

            expect(loginResponse.status).toEqual(201);
            const code = loginResponse.body.authentication_code;

            // First exchange — should succeed
            const firstExchange = await app.getHttpServer()
                .post('/api/oauth/token')
                .send({
                    grant_type: 'authorization_code',
                    code,
                    code_verifier: CODE_VERIFIER,
                    client_id: CLIENT_ID,
                })
                .set('Accept', 'application/json');

            expect(firstExchange.status).toEqual(200);

            // Second exchange — should fail
            const secondExchange = await app.getHttpServer()
                .post('/api/oauth/token')
                .send({
                    grant_type: 'authorization_code',
                    code,
                    code_verifier: CODE_VERIFIER,
                    client_id: CLIENT_ID,
                })
                .set('Accept', 'application/json');

            expect(secondExchange.status).toEqual(400);
            expect(secondExchange.body.error).toEqual('invalid_grant');
        });
    });

    describe('invalid auth code', () => {
        it('should reject token exchange with a non-existent auth code', async () => {
            const tokenResponse = await app.getHttpServer()
                .post('/api/oauth/token')
                .send({
                    grant_type: 'authorization_code',
                    code: 'NONEXISTENT999',
                    code_verifier: CODE_VERIFIER,
                    client_id: CLIENT_ID,
                })
                .set('Accept', 'application/json');

            expect(tokenResponse.status).toEqual(400);
            expect(tokenResponse.body.error).toEqual('invalid_grant');
        });
    });

    describe('subscriber tenant hint on auth code', () => {
        it('should store subscriber_tenant_hint on the auth code when provided', async () => {
            const loginResponse = await app.getHttpServer()
                .post('/api/oauth/login')
                .send({
                    email: EMAIL,
                    password: PASSWORD,
                    client_id: CLIENT_ID,
                    code_challenge: CODE_CHALLENGE,
                    code_challenge_method: 'plain',
                    subscriber_tenant_hint: 'some-tenant-hint',
                })
                .set('Accept', 'application/json');

            expect(loginResponse.status).toEqual(201);
            expect(loginResponse.body.authentication_code).toBeDefined();
        });
    });

    describe('requireAuthTime flag propagation', () => {
        // Use isolated tenant to avoid session interference with other tests
        const PROMPT_CLIENT_ID = 'prompt-test.local';
        const PROMPT_EMAIL = 'admin@prompt-test.local';

        it('should set requireAuthTime=true when prompt=login is used', async () => {
            const loginResponse = await app.getHttpServer()
                .post('/api/oauth/login')
                .send({
                    email: PROMPT_EMAIL,
                    password: PASSWORD,
                    client_id: PROMPT_CLIENT_ID,
                    code_challenge: CODE_CHALLENGE,
                    code_challenge_method: 'plain',
                    prompt: 'login',
                })
                .set('Accept', 'application/json');

            expect(loginResponse.status).toEqual(201);
            const code = loginResponse.body.authentication_code;

            // Look up the auth code's sid via test-utils
            const sidResponse = await app.getHttpServer()
                .get(`/api/test-utils/auth-codes/${code}/sid`);

            expect(sidResponse.status).toEqual(200);
            expect(sidResponse.body.sid).toBeDefined();
            expect(sidResponse.body.sid).not.toBeNull();

            // Exchange the code — the resulting ID token should contain auth_time
            const tokenResponse = await app.getHttpServer()
                .post('/api/oauth/token')
                .send({
                    grant_type: 'authorization_code',
                    code,
                    code_verifier: CODE_VERIFIER,
                    client_id: PROMPT_CLIENT_ID,
                })
                .set('Accept', 'application/json');

            expect(tokenResponse.status).toEqual(200);
            expect(tokenResponse.body.id_token).toBeDefined();

            const idTokenPayload = JSON.parse(
                Buffer.from(tokenResponse.body.id_token.split('.')[1], 'base64').toString(),
            );

            expect(idTokenPayload.auth_time).toBeDefined();
            expect(Number.isInteger(idTokenPayload.auth_time)).toBe(true);
        });

        it('should default requireAuthTime to false when no prompt or max_age is provided', async () => {
            const loginResponse = await app.getHttpServer()
                .post('/api/oauth/login')
                .send({
                    email: EMAIL,
                    password: PASSWORD,
                    client_id: CLIENT_ID,
                    code_challenge: CODE_CHALLENGE,
                    code_challenge_method: 'plain',
                })
                .set('Accept', 'application/json');

            expect(loginResponse.status).toEqual(201);
            const code = loginResponse.body.authentication_code;

            // Exchange the code — should still succeed
            const tokenResponse = await app.getHttpServer()
                .post('/api/oauth/token')
                .send({
                    grant_type: 'authorization_code',
                    code,
                    code_verifier: CODE_VERIFIER,
                    client_id: CLIENT_ID,
                })
                .set('Accept', 'application/json');

            expect(tokenResponse.status).toEqual(200);
            expect(tokenResponse.body.access_token).toBeDefined();
        });
    });
});
