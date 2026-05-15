import {SharedTestFixture} from "../shared-test.fixture";
import {TokenFixture} from "../token.fixture";

/**
 * OAuth Error Response Compliance Tests
 *
 * Validates two critical properties:
 *
 * 1. RFC 6749 §5.2 format compliance:
 *    - Body: { error: string, error_description: string } — ONLY these fields
 *    - Headers: Content-Type: application/json, Cache-Control: no-store, Pragma: no-cache
 *
 * 2. Security — no internal detail leakage:
 *    - No stack traces, database errors, file paths, or class names
 *    - Forbidden fields: stack, statusCode, url, timestamp, message
 *
 * 3. Scope isolation:
 *    - OAuth endpoints (/api/oauth/*) use RFC 6749 error format
 *    - Non-OAuth endpoints retain standard NestJS error format
 *
 * Error codes tested: invalid_grant, invalid_client, invalid_request, unsupported_grant_type
 *
 * Requirements: RFC 6749 §5.2, OAuthExceptionFilter scoping
 */
describe('OAuth Error Response Compliance (RFC 6749 §5.2)', () => {
    let app: SharedTestFixture;
    let tokenFixture: TokenFixture;

    beforeAll(async () => {
        app = new SharedTestFixture();
        tokenFixture = new TokenFixture(app);
    });

    afterAll(async () => {
        await app.close();
    });

    // ── Assertion Helpers ────────────────────────────────────────────

    /** Fields that must NEVER appear in an OAuth error response body. */
    const FORBIDDEN_FIELDS = ['stack', 'statusCode', 'url', 'timestamp', 'message'];

    /** Asserts the response body contains ONLY `error` and `error_description`. */
    function expectRfcErrorBody(body: Record<string, unknown>) {
        expect(body.error).toBeDefined();
        expect(body.error_description).toBeDefined();
        // Must NOT contain NestJS default fields or internal details
        for (const field of FORBIDDEN_FIELDS) {
            expect(body).not.toHaveProperty(field);
        }
        // Ensure no extra keys beyond error and error_description
        const keys = Object.keys(body);
        for (const key of keys) {
            expect(['error', 'error_description']).toContain(key);
        }
    }

    /** Asserts the RFC-mandated cache and content-type headers. */
    function expectOAuthErrorHeaders(headers: Record<string, string>) {
        expect(headers['content-type']).toMatch(/application\/json/);
        expect(headers['cache-control']).toEqual('no-store');
        expect(headers['pragma']).toEqual('no-cache');
    }

    // ── Token Endpoint Error Codes ──────────────────────────────────

    describe('token endpoint error codes', () => {
        it('invalid_grant — wrong password returns 400 with RFC body and headers', async () => {
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

        it('invalid_client — wrong client_secret returns 401 with RFC body and headers', async () => {
            const tokenResult = await tokenFixture.fetchAccessTokenFlow(
                'admin@auth.server.com',
                'admin9000',
                'auth.server.com',
            );
            const creds = await app.getHttpServer()
                .get('/api/tenant/my/credentials')
                .set('Authorization', `Bearer ${tokenResult.accessToken}`);

            expect(creds.status).toEqual(200);

            const response = await app.getHttpServer()
                .post('/api/oauth/token')
                .send({
                    grant_type: 'client_credentials',
                    client_id: creds.body.clientId,
                    client_secret: 'definitely-wrong-secret',
                })
                .set('Accept', 'application/json');

            expect(response.status).toEqual(401);
            expect(response.body.error).toEqual('invalid_client');
            expect(typeof response.body.error_description).toBe('string');
            expectRfcErrorBody(response.body);
            expectOAuthErrorHeaders(response.headers);
        });

        it('unsupported_grant_type — unknown grant returns 400 with RFC body', async () => {
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

        it('invalid_request — missing username returns 400 with RFC body', async () => {
            const response = await app.getHttpServer()
                .post('/api/oauth/token')
                .send({
                    grant_type: 'password',
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

        it('invalid_request — missing client_secret for client_credentials returns 400', async () => {
            const response = await app.getHttpServer()
                .post('/api/oauth/token')
                .send({
                    grant_type: 'client_credentials',
                    client_id: 'auth.server.com',
                })
                .set('Accept', 'application/json');

            expect(response.status).toEqual(400);
            expect(response.body.error).toEqual('invalid_request');
            expect(typeof response.body.error_description).toBe('string');
            expectRfcErrorBody(response.body);
            expectOAuthErrorHeaders(response.headers);
        });
    });

    // ── Login & Verify Endpoint Suppression ─────────────────────────

    describe('login and verify endpoint error suppression', () => {
        it('POST /api/oauth/login with wrong password — no internal fields', async () => {
            const response = await app.getHttpServer()
                .post('/api/oauth/login')
                .send({
                    email: 'admin@auth.server.com',
                    password: 'wrong-password',
                    client_id: 'auth.server.com',
                    code_challenge: 'test-challenge',
                    code_challenge_method: 'plain',
                })
                .set('Accept', 'application/json');

            expect(response.status).toBeGreaterThanOrEqual(400);
            expectRfcErrorBody(response.body);
        });

        it('POST /api/oauth/login with unknown client_id — no internal fields', async () => {
            const response = await app.getHttpServer()
                .post('/api/oauth/login')
                .send({
                    email: 'admin@auth.server.com',
                    password: 'admin9000',
                    client_id: 'nonexistent.domain.xyz',
                    code_challenge: 'test-challenge',
                    code_challenge_method: 'plain',
                })
                .set('Accept', 'application/json');

            expect(response.status).toBeGreaterThanOrEqual(400);
            expectRfcErrorBody(response.body);
        });

        it('POST /api/oauth/verify with invalid client_secret — no internal fields', async () => {
            const tokenResult = await tokenFixture.fetchAccessTokenFlow(
                'admin@auth.server.com',
                'admin9000',
                'auth.server.com',
            );
            const creds = await app.getHttpServer()
                .get('/api/tenant/my/credentials')
                .set('Authorization', `Bearer ${tokenResult.accessToken}`);

            expect(creds.status).toEqual(200);

            const response = await app.getHttpServer()
                .post('/api/oauth/verify')
                .send({
                    access_token: 'some-token',
                    client_id: creds.body.clientId,
                    client_secret: 'bad-secret',
                })
                .set('Accept', 'application/json');

            expect(response.status).toBeGreaterThanOrEqual(400);
            expectRfcErrorBody(response.body);
        });
    });

    // ── Error Response Headers ───────────────────────────────────────

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

        it('includes Content-Type: application/json', async () => {
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

    // ── Non-OAuth Endpoints Unchanged ───────────────────────────────

    describe('non-OAuth endpoints return standard NestJS error format (unchanged)', () => {
        it('GET /api/users/me without auth returns standard error shape with message and status', async () => {
            const response = await app.getHttpServer()
                .get('/api/users/me')
                .set('Accept', 'application/json');

            expect(response.status).toEqual(401);
            expect(response.body).toHaveProperty('message');
            expect(response.body).toHaveProperty('status');
        });

        it('GET /api/users/me without auth does NOT use RFC 6749 error shape', async () => {
            const response = await app.getHttpServer()
                .get('/api/users/me')
                .set('Accept', 'application/json');

            expect(response.status).toEqual(401);
            expect(response.body).toHaveProperty('message');
            expect(response.body).toHaveProperty('url');
            expect(response.body).toHaveProperty('timestamp');
        });
    });
});
