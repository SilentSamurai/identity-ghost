import {SharedTestFixture} from "../shared-test.fixture";
import {TokenFixture} from "../token.fixture";
import {expect2xx} from "../api-client/client";

/**
 * Integration tests for RFC 6749 §5.1 token response compliance.
 *
 * Validates that all grant types produce correctly shaped responses:
 * - Required fields: access_token, token_type, expires_in, scope
 * - expires_in is always a JSON number (not a string)
 * - refresh_token present for user grants, absent for client_credentials
 * - id_token present when openid scope granted, absent otherwise
 */
describe('Token Response RFC 6749 Compliance', () => {
    let app: SharedTestFixture;
    let tokenFixture: TokenFixture;

    // Shared state across sequential tests
    let refreshToken: string;
    let clientId: string;
    let clientSecret: string;

    beforeAll(async () => {
        app = new SharedTestFixture();
        tokenFixture = new TokenFixture(app);
    });

    afterAll(async () => {
        await app.close();
    });

    // ── Password Grant ──────────────────────────────────────────────

    describe('password grant', () => {
        let response: any;

        beforeAll(async () => {
            response = await app.getHttpServer()
                .post('/api/oauth/token')
                .send({
                    grant_type: "password",
                    username: "admin@auth.server.com",
                    password: "admin9000",
                    client_id: "auth.server.com",
                })
                .set('Accept', 'application/json');

            expect2xx(response);
            refreshToken = response.body.refresh_token;
        });

        it('should include access_token as a string', () => {
            expect(response.body.access_token).toBeDefined();
            expect(typeof response.body.access_token).toBe('string');
        });

        it('should include token_type as "Bearer"', () => {
            expect(response.body.token_type).toEqual('Bearer');
        });

        it('should include expires_in as a numeric positive integer', () => {
            expect(response.body.expires_in).toBeDefined();
            expect(typeof response.body.expires_in).toBe('number');
            expect(Number.isInteger(response.body.expires_in)).toBe(true);
            expect(response.body.expires_in).toBeGreaterThan(0);
        });

        it('should include refresh_token as a string', () => {
            expect(response.body.refresh_token).toBeDefined();
            expect(typeof response.body.refresh_token).toBe('string');
        });

        it('should include scope as a non-empty string', () => {
            expect(response.body.scope).toBeDefined();
            expect(typeof response.body.scope).toBe('string');
            expect(response.body.scope.length).toBeGreaterThan(0);
        });

        it('should include id_token when openid scope is granted', () => {
            // Default scopes include openid, so id_token should be present
            const scopes = response.body.scope.split(' ');
            if (scopes.includes('openid')) {
                expect(response.body.id_token).toBeDefined();
                expect(typeof response.body.id_token).toBe('string');
            }
        });

        it('scope should contain only OIDC values', () => {
            const validOidcScopes = ['openid', 'profile', 'email'];
            const scopes = response.body.scope.split(' ');
            for (const scope of scopes) {
                expect(validOidcScopes).toContain(scope);
            }
        });
    });

    // ── Fetch client credentials for subsequent tests ───────────────

    describe('setup: fetch client credentials', () => {
        it('should retrieve tenant credentials', async () => {
            // Get an access token first
            const tokenResult = await tokenFixture.fetchAccessToken(
                "admin@auth.server.com",
                "admin9000",
                "auth.server.com",
            );

            const creds = await app.getHttpServer()
                .get("/api/tenant/my/credentials")
                .set('Authorization', `Bearer ${tokenResult.accessToken}`);

            expect(creds.status).toEqual(200);
            clientId = creds.body.clientId;
            clientSecret = creds.body.clientSecret;
        });
    });

    // ── Client Credentials Grant ────────────────────────────────────

    describe('client_credentials grant', () => {
        let response: any;

        beforeAll(async () => {
            response = await app.getHttpServer()
                .post('/api/oauth/token')
                .send({
                    grant_type: "client_credentials",
                    client_id: clientId,
                    client_secret: clientSecret,
                })
                .set('Accept', 'application/json');

            expect2xx(response);
        });

        it('should include access_token as a string', () => {
            expect(response.body.access_token).toBeDefined();
            expect(typeof response.body.access_token).toBe('string');
        });

        it('should include token_type as "Bearer"', () => {
            expect(response.body.token_type).toEqual('Bearer');
        });

        it('should include expires_in as a numeric positive integer', () => {
            expect(response.body.expires_in).toBeDefined();
            expect(typeof response.body.expires_in).toBe('number');
            expect(Number.isInteger(response.body.expires_in)).toBe(true);
            expect(response.body.expires_in).toBeGreaterThan(0);
        });

        it('should include scope as a non-empty string', () => {
            expect(response.body.scope).toBeDefined();
            expect(typeof response.body.scope).toBe('string');
            expect(response.body.scope.length).toBeGreaterThan(0);
        });

        it('should NOT include refresh_token', () => {
            expect(response.body.refresh_token).toBeUndefined();
        });

        it('should NOT include id_token', () => {
            expect(response.body.id_token).toBeUndefined();
        });
    });

    // ── Refresh Token Grant ─────────────────────────────────────────

    describe('refresh_token grant', () => {
        let response: any;

        beforeAll(async () => {
            response = await app.getHttpServer()
                .post('/api/oauth/token')
                .send({
                    grant_type: "refresh_token",
                    refresh_token: refreshToken,
                })
                .set('Accept', 'application/json');

            expect2xx(response);
        });

        it('should include access_token as a string', () => {
            expect(response.body.access_token).toBeDefined();
            expect(typeof response.body.access_token).toBe('string');
        });

        it('should include token_type as "Bearer"', () => {
            expect(response.body.token_type).toEqual('Bearer');
        });

        it('should include expires_in as a numeric positive integer', () => {
            expect(response.body.expires_in).toBeDefined();
            expect(typeof response.body.expires_in).toBe('number');
            expect(Number.isInteger(response.body.expires_in)).toBe(true);
            expect(response.body.expires_in).toBeGreaterThan(0);
        });

        it('should include refresh_token as a string', () => {
            expect(response.body.refresh_token).toBeDefined();
            expect(typeof response.body.refresh_token).toBe('string');
        });

        it('should include scope as a non-empty string', () => {
            expect(response.body.scope).toBeDefined();
            expect(typeof response.body.scope).toBe('string');
            expect(response.body.scope.length).toBeGreaterThan(0);
        });

        it('should include id_token when openid scope is granted', () => {
            const scopes = response.body.scope.split(' ');
            if (scopes.includes('openid')) {
                expect(response.body.id_token).toBeDefined();
                expect(typeof response.body.id_token).toBe('string');
            }
        });
    });

    // ── Authorization Code Grant ────────────────────────────────────

    describe('authorization_code grant', () => {
        let response: any;

        beforeAll(async () => {
            const verifier = "compliance-test-verifier";

            // Step 1: Login to get an auth code
            const loginResponse = await app.getHttpServer()
                .post('/api/oauth/login')
                .send({
                    email: "admin@auth.server.com",
                    password: "admin9000",
                    client_id: "auth.server.com",
                    code_challenge: verifier,
                    code_challenge_method: "plain",
                })
                .set('Accept', 'application/json');

            expect2xx(loginResponse);
            const authCode = loginResponse.body.authentication_code;

            // Step 2: Exchange code for token
            response = await app.getHttpServer()
                .post('/api/oauth/token')
                .send({
                    grant_type: "authorization_code",
                    code: authCode,
                    code_verifier: verifier,
                    client_id: "auth.server.com",
                })
                .set('Accept', 'application/json');

            expect2xx(response);
        });

        it('should include access_token as a string', () => {
            expect(response.body.access_token).toBeDefined();
            expect(typeof response.body.access_token).toBe('string');
        });

        it('should include token_type as "Bearer"', () => {
            expect(response.body.token_type).toEqual('Bearer');
        });

        it('should include expires_in as a numeric positive integer', () => {
            expect(response.body.expires_in).toBeDefined();
            expect(typeof response.body.expires_in).toBe('number');
            expect(Number.isInteger(response.body.expires_in)).toBe(true);
            expect(response.body.expires_in).toBeGreaterThan(0);
        });

        it('should include refresh_token as a string', () => {
            expect(response.body.refresh_token).toBeDefined();
            expect(typeof response.body.refresh_token).toBe('string');
        });

        it('should include scope as a non-empty string', () => {
            expect(response.body.scope).toBeDefined();
            expect(typeof response.body.scope).toBe('string');
            expect(response.body.scope.length).toBeGreaterThan(0);
        });

        it('should include id_token when openid scope is granted', () => {
            const scopes = response.body.scope.split(' ');
            if (scopes.includes('openid')) {
                expect(response.body.id_token).toBeDefined();
                expect(typeof response.body.id_token).toBe('string');
            }
        });
    });

    // ── Cross-Grant Consistency ─────────────────────────────────────

    describe('expires_in JSON serialization', () => {
        it('should serialize expires_in as a JSON number, not a string', async () => {
            const response = await app.getHttpServer()
                .post('/api/oauth/token')
                .send({
                    grant_type: "password",
                    username: "admin@auth.server.com",
                    password: "admin9000",
                    client_id: "auth.server.com",
                })
                .set('Accept', 'application/json')
                .buffer(true)
                .parse((res, callback) => {
                    let data = '';
                    res.on('data', (chunk: any) => { data += chunk; });
                    res.on('end', () => { callback(null, data); });
                });

            expect2xx(response);

            // Parse the raw response text to verify numeric serialization
            const rawBody = response.body as unknown as string;
            // expires_in should appear as a number, e.g. "expires_in":3600
            // and NOT as a string, e.g. "expires_in":"3600"
            expect(rawBody).toMatch(/"expires_in"\s*:\s*\d+/);
            expect(rawBody).not.toMatch(/"expires_in"\s*:\s*"\d+"/);
        });
    });

    // ── id_token absence when openid not requested ──────────────────

    describe('id_token conditional presence', () => {
        it('should NOT include id_token for client_credentials (no user identity)', async () => {
            const response = await app.getHttpServer()
                .post('/api/oauth/token')
                .send({
                    grant_type: "client_credentials",
                    client_id: clientId,
                    client_secret: clientSecret,
                    scope: "email profile",
                })
                .set('Accept', 'application/json');

            expect2xx(response);
            expect(response.body.id_token).toBeUndefined();
        });
    });
});
