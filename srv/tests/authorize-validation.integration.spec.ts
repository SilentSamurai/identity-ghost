import {SharedTestFixture} from './shared-test.fixture';
import {TokenFixture} from './token.fixture';
import {ClientEntityClient} from './api-client/client-entity-client';
import {TenantClient} from './api-client/tenant-client';

/**
 * Integration tests for AuthorizeSchema validation in GET /api/oauth/authorize.
 *
 * These tests focus exclusively on the schema validation layer (Phase 1) introduced
 * by the authorize-request-validation feature. They verify:
 *
 * - Required parameter rejection (Requirements 4.1–4.4, 7.1, 7.2)
 * - Response type error code mapping (Requirements 3.1, 3.2, 7.3)
 * - Optional parameter constraint enforcement (Requirements 1.5–1.8)
 * - Schema-before-business ordering (Requirement 2.1)
 * - New parameter passthrough: prompt, max_age, resource (Requirements 6.1–6.4)
 * - Error response format and abortEarly behaviour (Requirements 7.1–7.4)
 * - Happy path with all required params (Requirement 2.3)
 */
describe('AuthorizeSchema validation — GET /api/oauth/authorize', () => {
    let app: SharedTestFixture;
    let clientApi: ClientEntityClient;
    let testClientId: string;
    let testClientWithResourcesId: string;

    const REDIRECT_URI = 'https://authorize-validation-test.example.com/callback';
    const ALLOWED_RESOURCES = ['https://api.example.com', 'https://api.example.com/v2'];

    beforeAll(async () => {
        app = new SharedTestFixture();

        const tokenFixture = new TokenFixture(app);
        const {accessToken} = await tokenFixture.fetchAccessTokenFlow(
            'admin@auth.server.com',
            'admin9000',
            'auth.server.com',
        );

        clientApi = new ClientEntityClient(app, accessToken);

        const tenantClient = new TenantClient(app, accessToken);
        const tenant = await tenantClient.createTenant(
            'authz-val-test',
            `authz-val-${Date.now()}.com`,
        );

        // Client without allowedResources - for tests that don't use resource parameter
        const created = await clientApi.createClient(tenant.id, 'Authorize Validation Test Client', {
            redirectUris: [REDIRECT_URI],
            allowedScopes: 'openid profile email',
            isPublic: true,
        });
        testClientId = created.client.clientId;

        // Client with allowedResources - for tests that use resource parameter
        const createdWithResources = await clientApi.createClient(tenant.id, 'Authorize Validation Test Client With Resources', {
            redirectUris: [REDIRECT_URI],
            allowedScopes: 'openid profile email',
            isPublic: true,
            allowedResources: ALLOWED_RESOURCES,
        });
        testClientWithResourcesId = createdWithResources.client.clientId;
    });

    afterAll(async () => {
        await clientApi.deleteClient(testClientId).catch(() => {
        });
        await clientApi.deleteClient(testClientWithResourcesId).catch(() => {
        });
        await app.close();
    });

    /** Helper: send GET /api/oauth/authorize with the given query params, no redirect following. */
    function authorize(params: Record<string, string | number>) {
        const query = new URLSearchParams(
            Object.entries(params).map(([k, v]) => [k, String(v)]),
        ).toString();
        return app.getHttpServer()
            .get(`/api/oauth/authorize?${query}`)
            .redirects(0);
    }

    /** Minimal valid params that pass schema and business validation. */
    function validParams(overrides: Record<string, string | number> = {}): Record<string, string | number> {
        return {
            response_type: 'code',
            client_id: testClientId,
            redirect_uri: REDIRECT_URI,
            scope: 'openid',
            state: 'test-state-value',
            ...overrides,
        };
    }

    /** Valid params using the client with allowedResources - for resource parameter tests. */
    function validParamsWithResources(overrides: Record<string, string | number> = {}): Record<string, string | number> {
        return {
            response_type: 'code',
            client_id: testClientWithResourcesId,
            redirect_uri: REDIRECT_URI,
            scope: 'openid',
            state: 'test-state-value',
            ...overrides,
        };
    }

    // ─── 6.1 Required Parameter Rejection ────────────────────────────────────

    describe('required parameter rejection (Req 4.1–4.4, 7.1, 7.2)', () => {
        it('should return 400 unsupported_response_type when response_type is omitted (RFC 6749 §4.1.2.1)', async () => {
            const {response_type: _, ...params} = validParams() as any;
            const res = await authorize(params);

            expect(res.status).toEqual(400);
            expect(res.body.error).toEqual('unsupported_response_type');
            expect(res.body.error_description).toBeDefined();
        });

        it('should return 400 invalid_request when client_id is omitted (Req 4.1)', async () => {
            const {client_id: _, ...params} = validParams() as any;
            const res = await authorize(params);

            expect(res.status).toEqual(400);
            expect(res.body.error).toEqual('invalid_request');
            expect(res.body.error_description).toBeDefined();
            expect(res.body.error_description.toLowerCase()).toContain('client_id');
        });

        it('should default redirect_uri when omitted and client has one registered URI (RFC 6749 §3.1.2.3)', async () => {
            const {redirect_uri: _, ...params} = validParams() as any;
            const res = await authorize(params);

            // Client has exactly one registered redirect URI → defaults to it → 302 redirect
            expect(res.status).toEqual(302);
            const location = new URL(res.headers.location, 'http://localhost');
            expect(location.searchParams.get('redirect_uri')).toEqual(REDIRECT_URI);
        });

        it('should use default scopes when scope is omitted (RFC 6749 §3.3)', async () => {
            const {scope: _, ...params} = validParams() as any;
            const res = await authorize(params);

            // Scope omitted → defaults to client's allowedScopes → 302 redirect
            expect(res.status).toEqual(302);
            const location = new URL(res.headers.location, 'http://localhost');
            expect(location.searchParams.get('scope')).toContain('openid');
        });

        it('should redirect with error when state is omitted (RFC 6749 §4.1.2.1)', async () => {
            const {state: _, ...params} = validParams() as any;
            const res = await authorize(params);

            // Missing state is a post-redirect error — redirect with error params
            expect(res.status).toEqual(302);
            const location = new URL(res.headers.location);
            expect(location.searchParams.get('error')).toEqual('invalid_request');
            expect(location.searchParams.get('error_description')).toBeDefined();
        });
    });

    // ─── 6.2 Response Type Error Code Tests ──────────────────────────────────

    describe('response_type error code mapping (Req 3.1, 3.2, 7.3)', () => {
        it('should return 400 unsupported_response_type when response_type=token (Req 3.1)', async () => {
            const res = await authorize(validParams({response_type: 'token'}));

            expect(res.status).toEqual(400);
            expect(res.body.error).toEqual('unsupported_response_type');
            expect(res.body.error_description).toBeDefined();
        });

        it('should return 400 unsupported_response_type when response_type=id_token (Req 3.1)', async () => {
            const res = await authorize(validParams({response_type: 'id_token'}));

            expect(res.status).toEqual(400);
            expect(res.body.error).toEqual('unsupported_response_type');
            expect(res.body.error_description).toBeDefined();
        });

        it('should return 400 unsupported_response_type when response_type is omitted (RFC 6749 §4.1.2.1)', async () => {
            const {response_type: _, ...params} = validParams() as any;
            const res = await authorize(params);

            expect(res.status).toEqual(400);
            // RFC 6749 §4.1.2.1: missing response_type → unsupported_response_type
            expect(res.body.error).toEqual('unsupported_response_type');
        });
    });

    // ─── 6.3 Optional Parameter Constraint Tests ─────────────────────────────

    describe('optional parameter constraints (Req 1.5–1.8)', () => {
        it('should reject code_challenge_method=invalid (Req 1.5)', async () => {
            const res = await authorize(validParams({
                code_challenge: 'some-challenge-value',
                code_challenge_method: 'invalid',
            }));

            expect(res.status).toEqual(400);
            expect(res.body.error).toEqual('invalid_request');
            expect(res.body.error_description).toContain('code_challenge_method');
        });

        it('should reject code_challenge_method=RS256 (not in allowed set) (Req 1.5)', async () => {
            const res = await authorize(validParams({
                code_challenge: 'some-challenge-value',
                code_challenge_method: 'RS256',
            }));

            expect(res.status).toEqual(400);
            expect(res.body.error).toEqual('invalid_request');
        });

        it('should redirect with error for nonce of 513 characters (OIDC Core §3.1.2.6)', async () => {
            const res = await authorize(validParams({nonce: 'a'.repeat(513)}));

            // Nonce length is a post-redirect error — redirect with error params
            expect(res.status).toEqual(302);
            const location = new URL(res.headers.location);
            expect(location.searchParams.get('error')).toEqual('invalid_request');
            expect(location.searchParams.get('error_description')).toContain('nonce');
        });

        it('should accept nonce of exactly 512 characters (Req 1.6)', async () => {
            const res = await authorize(validParams({nonce: 'a'.repeat(512)}));

            // Schema passes; business validation proceeds → 302 redirect to /authorize
            expect(res.status).toEqual(302);
        });

        it('should ignore unrecognized prompt values per OIDC Core §3.1.2.1 (Req 5.3)', async () => {
            const res = await authorize(validParams({prompt: 'invalid'}));

            // OIDC Core §3.1.2.1: unrecognized prompt values are ignored
            // Schema passes; business validation proceeds → 302 redirect to /authorize
            expect(res.status).toEqual(302);
        });

        it('should accept prompt=login (Req 1.7)', async () => {
            const res = await authorize(validParams({prompt: 'login'}));

            expect(res.status).toEqual(302);
        });

        it('should accept prompt=none (Req 1.7)', async () => {
            const res = await authorize(validParams({prompt: 'none'}));

            expect(res.status).toEqual(302);
        });

        it('should accept prompt=consent (Req 1.7)', async () => {
            const res = await authorize(validParams({prompt: 'consent'}));

            expect(res.status).toEqual(302);
        });

        it('should accept prompt="login consent" (space-delimited, Req 5.1)', async () => {
            const res = await authorize(validParams({prompt: 'login consent'}));

            // Space-delimited prompt values are valid per OIDC Core §3.1.2.1
            expect(res.status).toEqual(302);
        });

        it('should redirect with error for prompt="none login" (none exclusivity, Req 5.2)', async () => {
            const res = await authorize(validParams({prompt: 'none login'}));

            // none exclusivity is enforced as a post-redirect error (after redirect_uri is validated)
            expect(res.status).toEqual(302);
            const location = new URL(res.headers.location);
            expect(location.searchParams.get('error')).toEqual('invalid_request');
            expect(location.searchParams.get('error_description')).toContain('none');
        });

        it('should redirect with error for prompt="none consent" (none exclusivity, Req 5.2)', async () => {
            const res = await authorize(validParams({prompt: 'none consent'}));

            // none exclusivity is enforced as a post-redirect error
            expect(res.status).toEqual(302);
            const location = new URL(res.headers.location);
            expect(location.searchParams.get('error')).toEqual('invalid_request');
        });

        it('should reject max_age=-1 (Req 1.8)', async () => {
            const res = await authorize(validParams({max_age: -1}));

            expect(res.status).toEqual(400);
            expect(res.body.error).toEqual('invalid_request');
            expect(res.body.error_description).toContain('max_age');
        });

        it('should accept max_age=0 (Req 1.8)', async () => {
            const res = await authorize(validParams({max_age: 0}));

            expect(res.status).toEqual(302);
        });

        it('should accept max_age=3600 (Req 1.8)', async () => {
            const res = await authorize(validParams({max_age: 3600}));

            expect(res.status).toEqual(302);
        });
    });

    // ─── 6.4 Schema-Before-Business Ordering ─────────────────────────────────

    describe('schema validation runs before business validation (Req 2.1)', () => {
        it('should return unsupported_response_type even when client_id is also missing', async () => {
            // Both schema error (response_type=token) and business error (unknown client_id) are present.
            // Schema runs first → unsupported_response_type must be returned, not invalid_request for client.
            const res = await authorize({
                response_type: 'token',
                client_id: 'non-existent-client-id-xyz',
                redirect_uri: REDIRECT_URI,
                scope: 'openid',
                state: 'ordering-test',
            });

            expect(res.status).toEqual(400);
            expect(res.body.error).toEqual('unsupported_response_type');
        });

        it('should return schema error for invalid code_challenge_method before checking client existence', async () => {
            // Invalid code_challenge_method (schema error) + unknown client_id (business error).
            // Schema runs first → invalid_request for code_challenge_method, not for unknown client.
            const res = await authorize({
                response_type: 'code',
                client_id: 'non-existent-client-id-xyz',
                redirect_uri: REDIRECT_URI,
                scope: 'openid',
                state: 'ordering-test-2',
                code_challenge: 'some-challenge',
                code_challenge_method: 'invalid',
            });

            expect(res.status).toEqual(400);
            expect(res.body.error).toEqual('invalid_request');
            expect(res.body.error_description).toContain('code_challenge_method');
        });
    });

    // ─── 6.5 New Parameter Passthrough ───────────────────────────────────────

    describe('new parameter passthrough: prompt, max_age, resource (Req 6.1–6.4)', () => {
        it('should forward prompt, max_age, and resource in the redirect URL', async () => {
            const res = await authorize(validParamsWithResources({
                prompt: 'login',
                max_age: 3600,
                resource: 'https://api.example.com',
            }));

            expect(res.status).toEqual(302);
            const location = new URL(res.headers.location, 'http://localhost');
            expect(location.pathname).toEqual('/authorize');
            expect(location.searchParams.get('prompt')).toEqual('login');
            expect(location.searchParams.get('max_age')).toEqual('3600');
            expect(location.searchParams.get('resource')).toEqual('https://api.example.com');
        });

        it('should forward prompt=consent in the redirect URL (Req 6.1)', async () => {
            const res = await authorize(validParams({prompt: 'consent'}));

            expect(res.status).toEqual(302);
            const location = new URL(res.headers.location, 'http://localhost');
            expect(location.searchParams.get('prompt')).toEqual('consent');
        });

        it('should forward max_age=0 in the redirect URL (Req 6.2)', async () => {
            const res = await authorize(validParams({max_age: 0}));

            expect(res.status).toEqual(302);
            const location = new URL(res.headers.location, 'http://localhost');
            expect(location.searchParams.get('max_age')).toEqual('0');
        });

        it('should forward resource in the redirect URL (Req 6.3)', async () => {
            const res = await authorize(validParamsWithResources({resource: 'https://api.example.com/v2'}));

            expect(res.status).toEqual(302);
            const location = new URL(res.headers.location, 'http://localhost');
            expect(location.searchParams.get('resource')).toEqual('https://api.example.com/v2');
        });

        it('should not include prompt in redirect URL when not provided (Req 6.4)', async () => {
            const res = await authorize(validParams());

            expect(res.status).toEqual(302);
            const location = new URL(res.headers.location, 'http://localhost');
            expect(location.searchParams.get('prompt')).toBeNull();
            expect(location.searchParams.get('max_age')).toBeNull();
            expect(location.searchParams.get('resource')).toBeNull();
        });
    });

    // ─── 6.6 Error Response Format and abortEarly ────────────────────────────

    describe('error response format and abortEarly behaviour (Req 7.1–7.4)', () => {
        it('should return error response with error and error_description fields (Req 7.1)', async () => {
            const {client_id: _, ...params} = validParams() as any;
            const res = await authorize(params);

            expect(res.status).toEqual(400);
            expect(res.body).toHaveProperty('error');
            expect(res.body).toHaveProperty('error_description');
            expect(typeof res.body.error).toEqual('string');
            expect(typeof res.body.error_description).toEqual('string');
        });

        it('should use HTTP 400 for unsupported_response_type errors (Req 7.3)', async () => {
            const res = await authorize(validParams({response_type: 'token'}));

            expect(res.status).toEqual(400);
            expect(res.body.error).toEqual('unsupported_response_type');
        });

        it('should report only one error when multiple schema fields are invalid (abortEarly, Req 7.4)', async () => {
            // Send a request with no params at all — multiple issues present.
            // abortEarly: true means only the first failure is reported.
            const res = await app.getHttpServer()
                .get('/api/oauth/authorize')
                .redirects(0);

            expect(res.status).toEqual(400);
            expect(res.body.error).toBeDefined();
            expect(res.body.error_description).toBeDefined();
            // There should be exactly one error_description string, not an array
            expect(typeof res.body.error_description).toEqual('string');
        });

        it('should report only one error when both response_type and client_id are missing (Req 7.4)', async () => {
            // Only redirect_uri, scope, state provided — response_type and client_id missing.
            const res = await authorize({
                redirect_uri: REDIRECT_URI,
                scope: 'openid',
                state: 'abort-early-test',
            });

            expect(res.status).toEqual(400);
            // Only one error_description — not a list
            expect(typeof res.body.error_description).toEqual('string');
        });
    });

    // ─── 6.7 Happy Path ──────────────────────────────────────────────────────

    describe('happy path (Req 2.3)', () => {
        it('should redirect to /authorize with all required params forwarded', async () => {
            const res = await authorize(validParams());

            expect(res.status).toEqual(302);
            const location = new URL(res.headers.location, 'http://localhost');
            expect(location.pathname).toEqual('/authorize');
            expect(location.searchParams.get('client_id')).toEqual(testClientId);
            expect(location.searchParams.get('redirect_uri')).toEqual(REDIRECT_URI);
            expect(location.searchParams.get('scope')).toEqual('openid');
            expect(location.searchParams.get('state')).toEqual('test-state-value');
        });

        it('should default scope to client allowedScopes when scope is omitted (RFC 6749 §3.3)', async () => {
            const {scope: _, ...params} = validParams() as any;
            const res = await authorize(params);

            expect(res.status).toEqual(302);
            const location = new URL(res.headers.location, 'http://localhost');
            expect(location.pathname).toEqual('/authorize');
            const scope = location.searchParams.get('scope');
            expect(scope).toContain('openid');
        });

        it('should redirect to /authorize with all optional params forwarded when provided', async () => {
            const res = await authorize(validParamsWithResources({
                code_challenge: 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
                code_challenge_method: 'S256',
                nonce: 'nonce-value-123',
                prompt: 'login',
                max_age: 900,
                resource: 'https://api.example.com',
            }));

            expect(res.status).toEqual(302);
            const location = new URL(res.headers.location, 'http://localhost');
            expect(location.pathname).toEqual('/authorize');
            expect(location.searchParams.get('client_id')).toEqual(testClientWithResourcesId);
            expect(location.searchParams.get('redirect_uri')).toEqual(REDIRECT_URI);
            expect(location.searchParams.get('scope')).toEqual('openid');
            expect(location.searchParams.get('state')).toEqual('test-state-value');
            expect(location.searchParams.get('code_challenge')).toEqual('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
            expect(location.searchParams.get('code_challenge_method')).toEqual('S256');
            expect(location.searchParams.get('nonce')).toEqual('nonce-value-123');
            expect(location.searchParams.get('prompt')).toEqual('login');
            expect(location.searchParams.get('max_age')).toEqual('900');
            expect(location.searchParams.get('resource')).toEqual('https://api.example.com');
        });
    });
});
