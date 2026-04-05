import {SharedTestFixture} from "../shared-test.fixture";
import {TokenFixture} from "../token.fixture";

/**
 * WWW-Authenticate Header Tests — RFC 6750 §3 Compliance
 *
 * These integration tests verify that protected resource endpoints (those
 * guarded by JwtAuthGuard) return the proper WWW-Authenticate header per
 * RFC 6750 §3 when authentication fails.
 *
 * RFC 6750 specifies the WWW-Authenticate header format for Bearer token
 * authentication errors on protected resources:
 *   - No token provided: 401 + WWW-Authenticate: Bearer realm="auth-server"
 *   - Invalid/expired token: 401 + WWW-Authenticate: Bearer ..., error="invalid_token"
 *   - Insufficient scope: 403 + WWW-Authenticate: Bearer ..., error="insufficient_scope"
 *
 * The header helps HTTP clients detect and handle authentication errors
 * programmatically without parsing the response body.
 */
describe('WWW-Authenticate headers on protected endpoints (RFC 6750 §3)', () => {
    let app: SharedTestFixture;
    let tokenFixture: TokenFixture;

    beforeAll(async () => {
        app = new SharedTestFixture();
        tokenFixture = new TokenFixture(app);
    });

    afterAll(async () => {
        await app.close();
    });

    // ── No Bearer token → 401 + WWW-Authenticate: Bearer realm="auth-server" ──

    describe('no token provided', () => {
        it('returns 401 with WWW-Authenticate: Bearer realm="auth-server"', async () => {
            const response = await app.getHttpServer()
                .get('/api/users/me')
                .set('Accept', 'application/json');

            expect(response.status).toEqual(401);
            expect(response.headers['www-authenticate']).toBeDefined();
            expect(response.headers['www-authenticate']).toContain('Bearer');
            expect(response.headers['www-authenticate']).toContain('realm="auth-server"');
        });
    });

    // ── Invalid/expired token → 401 + WWW-Authenticate with error="invalid_token" ──

    describe('invalid token provided', () => {
        it('returns 401 with WWW-Authenticate containing error="invalid_token"', async () => {
            const response = await app.getHttpServer()
                .get('/api/users/me')
                .set('Authorization', 'Bearer invalid-jwt-token-here')
                .set('Accept', 'application/json');

            expect(response.status).toEqual(401);
            expect(response.headers['www-authenticate']).toBeDefined();
            expect(response.headers['www-authenticate']).toContain('error="invalid_token"');
        });
    });

    // ── Insufficient scope/role → 403 + WWW-Authenticate with error="insufficient_scope" ──

    describe('insufficient scope (client_credentials token on admin endpoint)', () => {
        let clientCredentialsAccessToken: string;

        beforeAll(async () => {
            // 1. Get an admin access token to fetch tenant credentials
            const adminToken = await tokenFixture.fetchAccessToken(
                'admin@auth.server.com',
                'admin9000',
                'auth.server.com',
            );

            // 2. Fetch the tenant's client credentials
            const credsResponse = await app.getHttpServer()
                .get('/api/tenant/my/credentials')
                .set('Authorization', `Bearer ${adminToken.accessToken}`)
                .set('Accept', 'application/json');

            expect(credsResponse.status).toEqual(200);
            const {clientId, clientSecret} = credsResponse.body;

            // 3. Get a client_credentials token (TechnicalToken — no roles, not a super admin)
            const ccToken = await tokenFixture.fetchClientCredentialsToken(clientId, clientSecret);
            clientCredentialsAccessToken = ccToken.accessToken;
        });

        it('returns 403 with WWW-Authenticate containing error="insufficient_scope"', async () => {
            const response = await app.getHttpServer()
                .get('/api/admin/tenant')
                .set('Authorization', `Bearer ${clientCredentialsAccessToken}`)
                .set('Accept', 'application/json');

            expect(response.status).toEqual(403);
            expect(response.headers['www-authenticate']).toBeDefined();
            expect(response.headers['www-authenticate']).toContain('error="insufficient_scope"');
        });
    });
});
