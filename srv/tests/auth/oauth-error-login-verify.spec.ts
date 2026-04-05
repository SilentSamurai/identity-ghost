import {SharedTestFixture} from "../shared-test.fixture";
import {TokenFixture} from "../token.fixture";

/**
 * OAuth Login, Verify, and Exchange Endpoint Error Tests — RFC 6749 §5.2
 *
 * These integration tests verify that the /api/oauth/login, /api/oauth/verify,
 * and /api/oauth/exchange endpoints return RFC 6749 §5.2 compliant error
 * responses, consistent with the token endpoint.
 *
 * Endpoints tested:
 *   - POST /api/oauth/login — initiates auth code flow
 *   - POST /api/oauth/verify — validates access tokens
 *   - POST /api/oauth/exchange — exchanges tokens between clients
 *
 * Error codes tested:
 *   - invalid_grant (400): wrong password, locked account, disallowed grant type
 *   - invalid_client (401): unknown client_id, wrong client_secret
 *   - invalid_token (401): invalid or expired access token
 *
 * Security: Same as token endpoint — no internal fields leaked in responses.
 */
describe('OAuth login, verify, and exchange endpoint error response format (RFC 6749 §5.2)', () => {
    let app: SharedTestFixture;
    let tokenFixture: TokenFixture;

    beforeAll(async () => {
        app = new SharedTestFixture();
        tokenFixture = new TokenFixture(app);
    });

    afterAll(async () => {
        await app.close();
    });

    /**
     * Helper: asserts the response body contains ONLY `error` and `error_description`,
     * with no NestJS-default fields leaking through.
     */
    function expectRfcErrorBody(body: Record<string, unknown>) {
        expect(body.error).toBeDefined();
        expect(body.error_description).toBeDefined();
        expect(body).not.toHaveProperty('message');
        expect(body).not.toHaveProperty('statusCode');
        expect(body).not.toHaveProperty('url');
        expect(body).not.toHaveProperty('timestamp');
        expect(body).not.toHaveProperty('stack');
    }

    /**
     * Helper: asserts the RFC-mandated cache and content-type headers.
     */
    function expectOAuthErrorHeaders(headers: Record<string, string>) {
        expect(headers['content-type']).toMatch(/application\/json/);
        expect(headers['cache-control']).toEqual('no-store');
        expect(headers['pragma']).toEqual('no-cache');
    }

    // ── POST /api/oauth/login ───────────────────────────────────────────

    describe('POST /api/oauth/login — invalid credentials (wrong password)', () => {
        it('returns 400 with error=invalid_grant and RFC body shape', async () => {
            const response = await app.getHttpServer()
                .post('/api/oauth/login')
                .send({
                    email: 'admin@auth.server.com',
                    password: 'wrongPass1',
                    client_id: 'auth.server.com',
                    code_challenge: 'test-challenge',
                    code_challenge_method: 'plain',
                })
                .set('Accept', 'application/json');

            expect(response.status).toEqual(400);
            expect(response.body.error).toEqual('invalid_grant');
            expect(response.body.error_description).toEqual('Invalid email or password');
            expectRfcErrorBody(response.body);
            expectOAuthErrorHeaders(response.headers);
        });
    });

    describe('POST /api/oauth/login — unknown client_id', () => {
        it('returns 401 with error=invalid_client and RFC body shape', async () => {
            const response = await app.getHttpServer()
                .post('/api/oauth/login')
                .send({
                    email: 'admin@auth.server.com',
                    password: 'admin9000',
                    client_id: 'nonexistent.domain.com',
                    code_challenge: 'test-challenge',
                    code_challenge_method: 'plain',
                })
                .set('Accept', 'application/json');

            expect(response.status).toEqual(401);
            expect(response.body.error).toEqual('invalid_client');
            expect(response.body.error_description).toEqual('Unknown client_id');
            expectRfcErrorBody(response.body);
            expectOAuthErrorHeaders(response.headers);
        });
    });

    // ── POST /api/oauth/verify ──────────────────────────────────────────

    describe('POST /api/oauth/verify — invalid client credentials', () => {
        let clientId: string;

        beforeAll(async () => {
            const tokenResult = await tokenFixture.fetchAccessToken(
                'admin@auth.server.com',
                'admin9000',
                'auth.server.com',
            );
            const creds = await app.getHttpServer()
                .get('/api/tenant/my/credentials')
                .set('Authorization', `Bearer ${tokenResult.accessToken}`);

            expect(creds.status).toEqual(200);
            clientId = creds.body.clientId;
        });

        it('returns 401 with error=invalid_client and RFC body shape', async () => {
            const response = await app.getHttpServer()
                .post('/api/oauth/verify')
                .send({
                    access_token: 'some-token',
                    client_id: clientId,
                    client_secret: 'definitely-wrong-secret',
                })
                .set('Accept', 'application/json');

            expect(response.status).toEqual(401);
            expect(response.body.error).toEqual('invalid_client');
            expect(typeof response.body.error_description).toBe('string');
            expectRfcErrorBody(response.body);
            expectOAuthErrorHeaders(response.headers);
        });
    });

    describe('POST /api/oauth/verify — invalid access token', () => {
        let clientId: string;
        let clientSecret: string;

        beforeAll(async () => {
            const tokenResult = await tokenFixture.fetchAccessToken(
                'admin@auth.server.com',
                'admin9000',
                'auth.server.com',
            );
            const creds = await app.getHttpServer()
                .get('/api/tenant/my/credentials')
                .set('Authorization', `Bearer ${tokenResult.accessToken}`);

            expect(creds.status).toEqual(200);
            clientId = creds.body.clientId;
            clientSecret = creds.body.clientSecret;
        });

        it('returns 401 with error=invalid_token and RFC body shape', async () => {
            const response = await app.getHttpServer()
                .post('/api/oauth/verify')
                .send({
                    access_token: 'invalid-access-token-value',
                    client_id: clientId,
                    client_secret: clientSecret,
                })
                .set('Accept', 'application/json');

            expect(response.status).toEqual(401);
            expect(response.body.error).toEqual('invalid_token');
            expect(response.body.error_description).toEqual('The access token is invalid or has expired');
            expectRfcErrorBody(response.body);
            expectOAuthErrorHeaders(response.headers);
        });
    });

    // ── POST /api/oauth/exchange ────────────────────────────────────────

    describe('POST /api/oauth/exchange — disallowed grant type (client_credentials token)', () => {
        let clientId: string;
        let clientSecret: string;
        let clientCredentialsAccessToken: string;

        beforeAll(async () => {
            // First get a password-grant token to fetch tenant credentials
            const tokenResult = await tokenFixture.fetchAccessToken(
                'admin@auth.server.com',
                'admin9000',
                'auth.server.com',
            );
            const creds = await app.getHttpServer()
                .get('/api/tenant/my/credentials')
                .set('Authorization', `Bearer ${tokenResult.accessToken}`);

            expect(creds.status).toEqual(200);
            clientId = creds.body.clientId;
            clientSecret = creds.body.clientSecret;

            // Now get a client_credentials token (grant_type=client_credentials, not password)
            const ccToken = await tokenFixture.fetchClientCredentialsToken(clientId, clientSecret);
            clientCredentialsAccessToken = ccToken.accessToken;
        });

        it('returns 400 with error=invalid_grant and RFC body shape', async () => {
            const response = await app.getHttpServer()
                .post('/api/oauth/exchange')
                .send({
                    access_token: clientCredentialsAccessToken,
                    client_id: clientId,
                    client_secret: clientSecret,
                })
                .set('Accept', 'application/json');

            expect(response.status).toEqual(400);
            expect(response.body.error).toEqual('invalid_grant');
            expect(response.body.error_description).toEqual('The grant type of the source token is not permitted for exchange');
            expectRfcErrorBody(response.body);
            expectOAuthErrorHeaders(response.headers);
        });
    });
});
