import {SharedTestFixture} from "../shared-test.fixture";
import {TokenFixture} from "../token.fixture";

/**
 * OAuth Error Detail Suppression Tests — Security & Isolation
 *
 * These integration tests verify two critical security properties:
 *
 * 1. OAuth endpoints (/api/oauth/*) must NOT leak internal error details:
 *    - No stack traces, database errors, file paths, or class names
 *    - Response body contains ONLY { error, error_description }
 *    - Full error details are logged server-side only
 *
 * 2. Non-OAuth endpoints remain unchanged:
 *    - Continue returning standard NestJS error format
 *    - { message, status, url, timestamp } for debugging
 *
 * This separation ensures:
 *   - Attackers cannot learn server internals from OAuth error responses
 *   - Developers can still debug non-OAuth errors normally
 *   - The OAuthExceptionFilter is scoped to /api/oauth/* routes only
 *
 * Forbidden fields in OAuth responses: stack, statusCode, url, timestamp, message
 */
describe('OAuth error detail suppression', () => {
    let app: SharedTestFixture;
    let tokenFixture: TokenFixture;

    beforeAll(async () => {
        app = new SharedTestFixture();
        tokenFixture = new TokenFixture(app);
    });

    afterAll(async () => {
        await app.close();
    });

    /** Fields that must NEVER appear in an OAuth error response body. */
    const FORBIDDEN_FIELDS = ['stack', 'statusCode', 'url', 'timestamp', 'message'];

    function expectNoInternalFields(body: Record<string, unknown>) {
        for (const field of FORBIDDEN_FIELDS) {
            expect(body).not.toHaveProperty(field);
        }
    }

    function expectOnlyRfcFields(body: Record<string, unknown>) {
        const keys = Object.keys(body);
        expect(keys).toEqual(expect.arrayContaining(['error', 'error_description']));
        // Ensure no extra keys beyond error and error_description
        for (const key of keys) {
            expect(['error', 'error_description']).toContain(key);
        }
    }

    // ── 1. No internal fields on OAuth error responses ──────────────────

    describe('no internal fields leak into OAuth error responses', () => {
        it('POST /api/oauth/token with wrong password — no stack/statusCode/url/timestamp/message', async () => {
            const response = await app.getHttpServer()
                .post('/api/oauth/token')
                .send({
                    grant_type: 'password',
                    username: 'admin@auth.server.com',
                    password: 'wrong-password',
                    client_id: 'auth.server.com',
                })
                .set('Accept', 'application/json');

            expect(response.status).toBeGreaterThanOrEqual(400);
            expectNoInternalFields(response.body);
            expectOnlyRfcFields(response.body);
        });

        it('POST /api/oauth/token with unsupported grant_type — no internal fields', async () => {
            const response = await app.getHttpServer()
                .post('/api/oauth/token')
                .send({
                    grant_type: 'magic_beans',
                    client_id: 'auth.server.com',
                })
                .set('Accept', 'application/json');

            expect(response.status).toEqual(400);
            expectNoInternalFields(response.body);
            expectOnlyRfcFields(response.body);
        });

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
            expectNoInternalFields(response.body);
            expectOnlyRfcFields(response.body);
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
            expectNoInternalFields(response.body);
            expectOnlyRfcFields(response.body);
        });

        it('POST /api/oauth/verify with invalid client_secret — no internal fields', async () => {
            const tokenResult = await tokenFixture.fetchAccessToken(
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
            expectNoInternalFields(response.body);
            expectOnlyRfcFields(response.body);
        });

        it('POST /api/oauth/token with validation failure (missing username) — no internal fields', async () => {
            const response = await app.getHttpServer()
                .post('/api/oauth/token')
                .send({
                    grant_type: 'password',
                    password: 'admin9000',
                    client_id: 'auth.server.com',
                })
                .set('Accept', 'application/json');

            expect(response.status).toEqual(400);
            expectNoInternalFields(response.body);
            expectOnlyRfcFields(response.body);
        });
    });

    // ── 2. Non-OAuth endpoints still return standard NestJS error format ─

    describe('non-OAuth endpoints return standard NestJS error format (unchanged)', () => {
        it('GET /api/users/me without auth returns standard error shape with message and status', async () => {
            const response = await app.getHttpServer()
                .get('/api/users/me')
                .set('Accept', 'application/json');

            expect(response.status).toEqual(401);
            // Standard NestJS HttpExceptionFilter adds these fields
            expect(response.body).toHaveProperty('message');
            expect(response.body).toHaveProperty('status');
        });

        it('GET /api/users/me without auth does NOT use RFC 6749 error shape', async () => {
            const response = await app.getHttpServer()
                .get('/api/users/me')
                .set('Accept', 'application/json');

            expect(response.status).toEqual(401);
            // The global HttpExceptionFilter produces message/status/url/timestamp,
            // NOT the OAuth error/error_description shape
            expect(response.body).toHaveProperty('message');
            expect(response.body).toHaveProperty('url');
            expect(response.body).toHaveProperty('timestamp');
        });
    });
});
