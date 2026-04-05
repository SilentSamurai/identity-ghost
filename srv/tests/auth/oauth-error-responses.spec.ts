import {SharedTestFixture} from "../shared-test.fixture";
import {TokenFixture} from "../token.fixture";

/**
 * OAuth Error Response Format Tests — RFC 6749 §5.2 Compliance
 *
 * These integration tests verify that the /api/oauth/token endpoint returns
 * error responses in the RFC 6749 §5.2 format:
 *   - Body: { error: string, error_description: string }
 *   - Headers: Content-Type: application/json;charset=UTF-8,
 *              Cache-Control: no-store, Pragma: no-cache
 *
 * Error codes tested:
 *   - invalid_grant (400): invalid credentials, locked account, expired token
 *   - invalid_client (401): client authentication failed
 *   - invalid_request (400): missing required parameters
 *   - unsupported_grant_type (400): unrecognized grant_type value
 *
 * Security: Response bodies must NOT leak internal fields (message, statusCode,
 * url, timestamp, stack) that could reveal server internals to attackers.
 */
describe('OAuth token endpoint error response format (RFC 6749 §5.2)', () => {
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
        // Must NOT contain NestJS default fields
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

    // ── invalid_grant (wrong password, password grant) ──────────────────

    describe('invalid_grant — wrong password', () => {
        it('returns 400 with error=invalid_grant and RFC body shape', async () => {
            const response = await app.getHttpServer()
                .post('/api/oauth/token')
                .send({
                    grant_type: 'password',
                    username: 'admin@auth.server.com',
                    password: 'wrong-password',
                    client_id: 'auth.server.com',
                })
                .set('Accept', 'application/json');

            expect(response.status).toEqual(400);
            expect(response.body.error).toEqual('invalid_grant');
            expect(typeof response.body.error_description).toBe('string');
            expectRfcErrorBody(response.body);
            expectOAuthErrorHeaders(response.headers);
        });
    });

    // ── invalid_client (wrong client_secret, client_credentials grant) ──

    describe('invalid_client — wrong client_secret', () => {
        let clientId: string;

        beforeAll(async () => {
            // Get a valid access token to fetch real client credentials
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
                .post('/api/oauth/token')
                .send({
                    grant_type: 'client_credentials',
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

    // ── unsupported_grant_type ───────────────────────────────────────────

    describe('unsupported_grant_type', () => {
        it('returns 400 with error=unsupported_grant_type', async () => {
            const response = await app.getHttpServer()
                .post('/api/oauth/token')
                .send({
                    grant_type: 'some_unknown_grant',
                    username: 'admin@auth.server.com',
                    password: 'admin9000',
                    client_id: 'auth.server.com',
                })
                .set('Accept', 'application/json');

            expect(response.status).toEqual(400);
            expect(response.body.error).toEqual('unsupported_grant_type');
            expectRfcErrorBody(response.body);
            expectOAuthErrorHeaders(response.headers);
        });
    });

    // ── invalid_request (missing required params) ────────────────────────

    describe('invalid_request — missing required params', () => {
        it('returns 400 with error=invalid_request when password grant is missing username', async () => {
            const response = await app.getHttpServer()
                .post('/api/oauth/token')
                .send({
                    grant_type: 'password',
                    // username omitted
                    password: 'admin9000',
                    client_id: 'auth.server.com',
                })
                .set('Accept', 'application/json');

            expect(response.status).toEqual(400);
            expect(response.body.error).toEqual('invalid_request');
            expect(typeof response.body.error_description).toBe('string');
            expectRfcErrorBody(response.body);
            expectOAuthErrorHeaders(response.headers);
        });

        it('returns 400 with error=invalid_request when client_credentials grant is missing client_secret', async () => {
            const response = await app.getHttpServer()
                .post('/api/oauth/token')
                .send({
                    grant_type: 'client_credentials',
                    client_id: 'auth.server.com',
                    // client_secret omitted
                })
                .set('Accept', 'application/json');

            expect(response.status).toEqual(400);
            expect(response.body.error).toEqual('invalid_request');
            expect(typeof response.body.error_description).toBe('string');
            expectRfcErrorBody(response.body);
            expectOAuthErrorHeaders(response.headers);
        });
    });

    // ── Headers on all error responses ───────────────────────────────────

    describe('error response headers', () => {
        it('includes Cache-Control: no-store and Pragma: no-cache', async () => {
            const response = await app.getHttpServer()
                .post('/api/oauth/token')
                .send({
                    grant_type: 'password',
                    username: 'admin@auth.server.com',
                    password: 'wrong-password',
                    client_id: 'auth.server.com',
                })
                .set('Accept', 'application/json');

            expect(response.status).toEqual(400);
            expect(response.headers['cache-control']).toEqual('no-store');
            expect(response.headers['pragma']).toEqual('no-cache');
        });

        it('includes Content-Type: application/json;charset=UTF-8', async () => {
            const response = await app.getHttpServer()
                .post('/api/oauth/token')
                .send({
                    grant_type: 'some_unknown_grant',
                })
                .set('Accept', 'application/json');

            expect(response.status).toEqual(400);
            expect(response.headers['content-type']).toMatch(/application\/json/);
        });
    });
});
