import {SharedTestFixture} from "../shared-test.fixture";
import {TokenFixture} from "../token.fixture";
import {ClientEntityClient} from "../api-client/client-entity-client";

/**
 * Integration tests for RFC 7662 Token Introspection endpoint.
 *
 * POST /api/oauth/introspect
 *
 * The introspection endpoint authenticates the requesting client using the
 * Client entity (not legacy Tenant credentials). Tests create a Client entity
 * under the same tenant as the tokens being introspected.
 *
 * Validates:
 *   - Active response shape and field types (Req 3.1–3.6, 7.1, 7.2)
 *   - Client authentication via Basic header and body params (Req 2.1–2.5)
 *   - Inactive responses for expired/malformed tokens (Req 4.1, 4.2)
 *   - Cache and content-type headers (Req 5.2, 5.3)
 *   - token_type_hint handling (Req 6.1–6.3)
 *   - HTTP status code conventions (Req 7.3)
 */
describe('Token Introspection Endpoint (RFC 7662)', () => {
    let app: SharedTestFixture;
    let tokenFixture: TokenFixture;

    // Client entity credentials (used for introspection requests)
    let clientId: string;
    let clientSecret: string;

    // Tokens to introspect
    let userAccessToken: string;
    let technicalAccessToken: string;

    beforeAll(async () => {
        app = new SharedTestFixture();
        tokenFixture = new TokenFixture(app);

        // 1. Get a user access token (password grant)
        const tokenResult = await tokenFixture.fetchAccessToken(
            'admin@auth.server.com',
            'admin9000',
            'auth.server.com',
        );
        userAccessToken = tokenResult.accessToken;
        const tenantId = tokenResult.jwt.tenant.id;

        // 2. Create a Client entity under the same tenant
        //    (introspection uses ClientService, not legacy Tenant credentials)
        const clientApi = new ClientEntityClient(app, userAccessToken);
        const created = await clientApi.createClient(tenantId, 'Introspection Test Client', {
            allowedScopes: 'openid profile email',
            grantTypes: 'client_credentials',
        });
        clientId = created.client.clientId;
        clientSecret = created.clientSecret;

        // 3. Get a technical access token using legacy tenant credentials
        //    (the token endpoint uses Tenant.clientId, not Client entity)
        const tenantCreds = await app.getHttpServer()
            .get('/api/tenant/my/credentials')
            .set('Authorization', `Bearer ${userAccessToken}`);
        const techResult = await tokenFixture.fetchClientCredentialsToken(
            tenantCreds.body.clientId,
            tenantCreds.body.clientSecret,
        );
        technicalAccessToken = techResult.accessToken;
    });

    afterAll(async () => {
        await app.close();
    });

    /** Helper: POST /api/oauth/introspect with body credentials */
    function introspect(body: Record<string, string>) {
        return app.getHttpServer()
            .post('/api/oauth/introspect')
            .send(body)
            .set('Accept', 'application/json');
    }

    /** Helper: POST /api/oauth/introspect with Basic auth header */
    function introspectWithBasic(token: string, id: string, secret: string, extraBody?: Record<string, string>) {
        const basic = Buffer.from(`${id}:${secret}`).toString('base64');
        return app.getHttpServer()
            .post('/api/oauth/introspect')
            .send({ token, ...extraBody })
            .set('Authorization', `Basic ${basic}`)
            .set('Accept', 'application/json');
    }

    // ── Active response: user token (Req 3.1, 3.2, 3.4, 10.1, 10.2, 10.3) ───

    describe('valid user token introspection', () => {
        let response: any;
        let decodedToken: any;

        beforeAll(async () => {
            response = await introspect({
                token: userAccessToken,
                client_id: clientId,
                client_secret: clientSecret,
            });
            decodedToken = app.jwtService().decode(userAccessToken, { json: true }) as any;
        });

        it('returns 200 with active: true', () => {
            expect(response.status).toEqual(200);
            expect(response.body.active).toBe(true);
        });

        it('includes sub as a UUID (not email) matching the token sub claim (Req 10.1)', () => {
            expect(typeof response.body.sub).toBe('string');
            expect(response.body.sub.length).toBeGreaterThan(0);
            // sub must be a UUID, not an email address
            const uuidV4Regex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
            expect(response.body.sub).toMatch(uuidV4Regex);
            expect(response.body.sub).not.toContain('@');
            // Must match the token's sub claim
            expect(response.body.sub).toEqual(decodedToken.sub);
        });

        it('includes scope as a string', () => {
            expect(typeof response.body.scope).toBe('string');
            expect(response.body.scope.length).toBeGreaterThan(0);
        });

        it('includes client_id from the token client_id claim (Req 10.2)', () => {
            expect(typeof response.body.client_id).toBe('string');
            // client_id in introspection response comes from the token's client_id claim,
            // not the requesting client's ID
            expect(response.body.client_id).toEqual(decodedToken.client_id);
        });

        it('includes aud as a JSON array matching the token aud claim (Req 10.3)', () => {
            expect(Array.isArray(response.body.aud)).toBe(true);
            expect(response.body.aud.length).toBeGreaterThan(0);
            // Must match the token's aud claim
            expect(response.body.aud).toEqual(decodedToken.aud);
        });

        it('includes token_type as "Bearer"', () => {
            expect(response.body.token_type).toEqual('Bearer');
        });

        it('includes exp as an integer Unix timestamp', () => {
            expect(typeof response.body.exp).toBe('number');
            expect(Number.isInteger(response.body.exp)).toBe(true);
            expect(response.body.exp).toBeGreaterThan(0);
        });

        it('includes iat as an integer Unix timestamp', () => {
            expect(typeof response.body.iat).toBe('number');
            expect(Number.isInteger(response.body.iat)).toBe(true);
            expect(response.body.iat).toBeGreaterThan(0);
        });
    });

    // ── Active response: technical token (Req 3.5, 10.1, 10.2, 10.3) ─

    describe('valid technical token introspection', () => {
        let response: any;
        let decodedToken: any;

        beforeAll(async () => {
            response = await introspect({
                token: technicalAccessToken,
                client_id: clientId,
                client_secret: clientSecret,
            });
            decodedToken = app.jwtService().decode(technicalAccessToken, { json: true }) as any;
        });

        it('returns 200 with active: true and all required fields', () => {
            expect(response.status).toEqual(200);
            expect(response.body.active).toBe(true);
            expect(typeof response.body.sub).toBe('string');
            expect(typeof response.body.scope).toBe('string');
            expect(typeof response.body.client_id).toBe('string');
            expect(response.body.token_type).toEqual('Bearer');
            expect(Number.isInteger(response.body.exp)).toBe(true);
            expect(Number.isInteger(response.body.iat)).toBe(true);
        });

        it('returns sub as "oauth" for technical tokens (Req 10.1)', () => {
            expect(response.body.sub).toEqual('oauth');
        });

        it('returns aud as a JSON array matching the token aud claim (Req 10.3)', () => {
            expect(Array.isArray(response.body.aud)).toBe(true);
            expect(response.body.aud.length).toBeGreaterThan(0);
            expect(response.body.aud).toEqual(decodedToken.aud);
        });

        it('returns client_id from the token client_id claim (Req 10.2)', () => {
            expect(typeof response.body.client_id).toBe('string');
            expect(response.body.client_id).toEqual(decodedToken.client_id);
        });
    });

    // ── Scope contains only OIDC values, no roles (Req 3.3, 3.6) ───

    describe('scope field contains only OIDC values', () => {
        const ROLE_VALUES = ['SUPER_ADMIN', 'TENANT_ADMIN', 'TENANT_VIEWER'];
        const VALID_OIDC_SCOPES = ['openid', 'profile', 'email'];

        it('user token scope contains only OIDC values and no role values', async () => {
            const response = await introspect({
                token: userAccessToken,
                client_id: clientId,
                client_secret: clientSecret,
            });

            expect(response.status).toEqual(200);
            const scopes = response.body.scope.split(' ');
            for (const scope of scopes) {
                expect(VALID_OIDC_SCOPES).toContain(scope);
            }
            for (const role of ROLE_VALUES) {
                expect(scopes).not.toContain(role);
            }
        });

        it('technical token scope contains only OIDC values and no role values', async () => {
            const response = await introspect({
                token: technicalAccessToken,
                client_id: clientId,
                client_secret: clientSecret,
            });

            expect(response.status).toEqual(200);
            const scopes = response.body.scope.split(' ');
            for (const scope of scopes) {
                expect(VALID_OIDC_SCOPES).toContain(scope);
            }
            for (const role of ROLE_VALUES) {
                expect(scopes).not.toContain(role);
            }
        });
    });

    // ── Missing token parameter (Req 1.3) ───────────────────────────

    describe('missing token parameter', () => {
        it('returns 400 with error=invalid_request when token is missing', async () => {
            const response = await introspect({
                client_id: clientId,
                client_secret: clientSecret,
            });

            expect(response.status).toEqual(400);
            expect(response.body.error).toEqual('invalid_request');
            expect(typeof response.body.error_description).toBe('string');
        });

        it('returns 400 with error=invalid_request when token is empty string', async () => {
            const response = await introspect({
                token: '',
                client_id: clientId,
                client_secret: clientSecret,
            });

            expect(response.status).toEqual(400);
            expect(response.body.error).toEqual('invalid_request');
        });
    });

    // ── No client credentials (Req 2.5) ─────────────────────────────

    describe('no client credentials', () => {
        it('returns 401 with error=invalid_client', async () => {
            const response = await app.getHttpServer()
                .post('/api/oauth/introspect')
                .send({ token: userAccessToken })
                .set('Accept', 'application/json');

            expect(response.status).toEqual(401);
            expect(response.body.error).toEqual('invalid_client');
        });
    });

    // ── Wrong client_secret (Req 2.4) ───────────────────────────────

    describe('wrong client_secret', () => {
        it('returns 401 with error=invalid_client', async () => {
            const response = await introspect({
                token: userAccessToken,
                client_id: clientId,
                client_secret: 'definitely-wrong-secret',
            });

            expect(response.status).toEqual(401);
            expect(response.body.error).toEqual('invalid_client');
        });
    });

    // ── Basic auth header credentials (Req 2.1) ────────────────────

    describe('Basic auth header credentials', () => {
        it('accepts client credentials via Basic auth header', async () => {
            const response = await introspectWithBasic(userAccessToken, clientId, clientSecret);

            expect(response.status).toEqual(200);
            expect(response.body.active).toBe(true);
        });
    });

    // ── Body credentials (Req 2.2) ──────────────────────────────────

    describe('body credentials', () => {
        it('accepts client_id and client_secret in the request body', async () => {
            const response = await introspect({
                token: userAccessToken,
                client_id: clientId,
                client_secret: clientSecret,
            });

            expect(response.status).toEqual(200);
            expect(response.body.active).toBe(true);
        });
    });

    // ── Basic auth takes precedence over body credentials (Req 2.3) ─

    describe('Basic auth precedence', () => {
        it('uses Basic header credentials when both Basic and body credentials are present', async () => {
            // Provide correct credentials in Basic header, wrong in body
            const response = await introspectWithBasic(
                userAccessToken,
                clientId,
                clientSecret,
                { client_id: 'wrong-client-id', client_secret: 'wrong-secret' },
            );

            expect(response.status).toEqual(200);
            expect(response.body.active).toBe(true);
        });

        it('fails when Basic header has wrong credentials even if body has correct ones', async () => {
            const basic = Buffer.from('wrong-id:wrong-secret').toString('base64');
            const response = await app.getHttpServer()
                .post('/api/oauth/introspect')
                .send({
                    token: userAccessToken,
                    client_id: clientId,
                    client_secret: clientSecret,
                })
                .set('Authorization', `Basic ${basic}`)
                .set('Accept', 'application/json');

            expect(response.status).toEqual(401);
            expect(response.body.error).toEqual('invalid_client');
        });
    });

    // ── Expired token (Req 4.1) ─────────────────────────────────────

    describe('expired token', () => {
        it('returns 200 with { active: false }', async () => {
            // Create a JWT that expired in the past
            const expiredJwt = app.jwtService().sign(
                {
                    sub: 'admin@auth.server.com',
                    tenant: { id: 'fake', name: 'fake', domain: 'auth.server.com' },
                    scopes: ['openid', 'profile', 'email'],
                    roles: [],
                    grant_type: 'password',
                    exp: Math.floor(Date.now() / 1000) - 3600,
                    iat: Math.floor(Date.now() / 1000) - 7200,
                },
                { secret: 'test-secret-that-wont-match' },
            );

            const response = await introspect({
                token: expiredJwt,
                client_id: clientId,
                client_secret: clientSecret,
            });

            expect(response.status).toEqual(200);
            expect(response.body).toEqual({ active: false });
        });
    });

    // ── Malformed token (Req 4.2) ───────────────────────────────────

    describe('malformed token', () => {
        it('returns 200 with { active: false } for garbage string', async () => {
            const response = await introspect({
                token: 'this-is-not-a-valid-jwt-token',
                client_id: clientId,
                client_secret: clientSecret,
            });

            expect(response.status).toEqual(200);
            expect(response.body).toEqual({ active: false });
        });

        it('returns 200 with { active: false } for empty-ish token', async () => {
            const response = await introspect({
                token: '...',
                client_id: clientId,
                client_secret: clientSecret,
            });

            expect(response.status).toEqual(200);
            expect(response.body).toEqual({ active: false });
        });
    });

    // ── Cache and content-type headers (Req 5.2, 5.3) ──────────────

    describe('response headers', () => {
        it('includes Cache-Control: no-store and Pragma: no-cache on active response', async () => {
            const response = await introspect({
                token: userAccessToken,
                client_id: clientId,
                client_secret: clientSecret,
            });

            expect(response.status).toEqual(200);
            expect(response.headers['cache-control']).toEqual('no-store');
            expect(response.headers['pragma']).toEqual('no-cache');
        });

        it('includes Cache-Control: no-store and Pragma: no-cache on inactive response', async () => {
            const response = await introspect({
                token: 'invalid-token',
                client_id: clientId,
                client_secret: clientSecret,
            });

            expect(response.status).toEqual(200);
            expect(response.headers['cache-control']).toEqual('no-store');
            expect(response.headers['pragma']).toEqual('no-cache');
        });

        it('returns Content-Type: application/json', async () => {
            const response = await introspect({
                token: userAccessToken,
                client_id: clientId,
                client_secret: clientSecret,
            });

            expect(response.status).toEqual(200);
            expect(response.headers['content-type']).toMatch(/application\/json/);
        });
    });

    // ── token_type_hint parameter (Req 6.1, 6.2, 6.3) ──────────────

    describe('token_type_hint parameter', () => {
        it('accepts token_type_hint=access_token and returns same result', async () => {
            const response = await introspect({
                token: userAccessToken,
                client_id: clientId,
                client_secret: clientSecret,
                token_type_hint: 'access_token',
            });

            expect(response.status).toEqual(200);
            expect(response.body.active).toBe(true);
        });

        it('accepts unrecognized token_type_hint and returns same result', async () => {
            const response = await introspect({
                token: userAccessToken,
                client_id: clientId,
                client_secret: clientSecret,
                token_type_hint: 'refresh_token',
            });

            expect(response.status).toEqual(200);
            expect(response.body.active).toBe(true);
        });

        it('works without token_type_hint', async () => {
            const response = await introspect({
                token: userAccessToken,
                client_id: clientId,
                client_secret: clientSecret,
            });

            expect(response.status).toEqual(200);
            expect(response.body.active).toBe(true);
        });
    });

    // ── HTTP status codes (Req 7.3) ─────────────────────────────────

    describe('HTTP status code conventions', () => {
        it('returns 200 for active token', async () => {
            const response = await introspect({
                token: userAccessToken,
                client_id: clientId,
                client_secret: clientSecret,
            });

            expect(response.status).toEqual(200);
        });

        it('returns 200 for inactive token (not 4xx)', async () => {
            const response = await introspect({
                token: 'invalid-token',
                client_id: clientId,
                client_secret: clientSecret,
            });

            expect(response.status).toEqual(200);
            expect(response.body.active).toBe(false);
        });

        it('returns 401 for client auth failure (not 200)', async () => {
            const response = await introspect({
                token: userAccessToken,
                client_id: clientId,
                client_secret: 'wrong-secret',
            });

            expect(response.status).toEqual(401);
        });
    });

    // ── active is boolean, exp/iat are integer timestamps (Req 7.1, 7.2) ─

    describe('response field types', () => {
        it('active is a JSON boolean true for valid token', async () => {
            const response = await introspect({
                token: userAccessToken,
                client_id: clientId,
                client_secret: clientSecret,
            });

            expect(response.status).toEqual(200);
            expect(response.body.active).toBe(true);
            expect(typeof response.body.active).toBe('boolean');
        });

        it('active is a JSON boolean false for invalid token', async () => {
            const response = await introspect({
                token: 'invalid-token',
                client_id: clientId,
                client_secret: clientSecret,
            });

            expect(response.status).toEqual(200);
            expect(response.body.active).toBe(false);
            expect(typeof response.body.active).toBe('boolean');
        });

        it('exp and iat are integer Unix timestamps (not floats, not strings)', async () => {
            const response = await introspect({
                token: userAccessToken,
                client_id: clientId,
                client_secret: clientSecret,
            });

            expect(response.status).toEqual(200);
            expect(typeof response.body.exp).toBe('number');
            expect(typeof response.body.iat).toBe('number');
            expect(Number.isInteger(response.body.exp)).toBe(true);
            expect(Number.isInteger(response.body.iat)).toBe(true);
            // Sanity: timestamps should be reasonable (after year 2020)
            expect(response.body.exp).toBeGreaterThan(1577836800);
            expect(response.body.iat).toBeGreaterThan(1577836800);
        });
    });
});
