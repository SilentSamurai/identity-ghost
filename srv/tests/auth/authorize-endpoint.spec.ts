import {SharedTestFixture} from '../shared-test.fixture';
import {TokenFixture} from '../token.fixture';
import {ClientEntityClient} from '../api-client/client-entity-client';
import {TenantClient} from '../api-client/tenant-client';

/**
 * Integration tests for GET /api/oauth/authorize endpoint.
 *
 * Validates the OAuth 2.0 Authorization Code flow entry point:
 * - Happy path: valid request → 302 redirect to login UI with all params forwarded
 * - Pre-redirect errors: unknown client_id, invalid redirect_uri, missing response_type → JSON error
 * - Post-redirect errors: missing state, PKCE violations → redirect with error params
 * - Redirect URI resolution, PKCE enforcement, scope handling, nonce passthrough, state round-trip
 *
 * Requirements: 1.1–1.4, 2.1–2.4, 3.1–3.2, 4.1–4.4, 5.1, 6.1–6.3, 7.1–7.3, 8.1–8.3
 */
describe('GET /api/oauth/authorize', () => {
    let app: SharedTestFixture;
    let clientApi: ClientEntityClient;
    let accessToken: string;
    let testTenantId: string;

    // Test client IDs — populated in beforeAll
    let singleUriClientId: string;
    let multiUriClientId: string;
    let pkceRequiredClientId: string;

    const REDIRECT_URI = 'https://authorize-test.example.com/callback';
    const REDIRECT_URI_2 = 'https://authorize-test.example.com/callback2';

    beforeAll(async () => {
        app = new SharedTestFixture();
        const tokenFixture = new TokenFixture(app);
        const response = await tokenFixture.fetchAccessToken(
            'admin@auth.server.com',
            'admin9000',
            'auth.server.com',
        );
        accessToken = response.accessToken;
        clientApi = new ClientEntityClient(app, accessToken);

        const tenantClient = new TenantClient(app, accessToken);
        const tenant = await tenantClient.createTenant('authorize-ep-test', 'authorize-ep-test.com');
        testTenantId = tenant.id;

        // Client with a single redirect URI
        const singleUri = await clientApi.createClient(testTenantId, 'Single URI Client', {
            redirectUris: [REDIRECT_URI],
            allowedScopes: 'openid profile email',
            isPublic: true,
        });
        singleUriClientId = singleUri.client.clientId;

        // Client with multiple redirect URIs
        const multiUri = await clientApi.createClient(testTenantId, 'Multi URI Client', {
            redirectUris: [REDIRECT_URI, REDIRECT_URI_2],
            allowedScopes: 'openid profile email',
            isPublic: true,
        });
        multiUriClientId = multiUri.client.clientId;

        // Client with requirePkce=true
        const pkceRequired = await clientApi.createClient(testTenantId, 'PKCE Required Client', {
            redirectUris: [REDIRECT_URI],
            allowedScopes: 'openid profile email',
            isPublic: true,
            requirePkce: true,
        });
        pkceRequiredClientId = pkceRequired.client.clientId;
    });

    afterAll(async () => {
        // Cleanup test clients
        await clientApi.deleteClient(singleUriClientId).catch(() => {});
        await clientApi.deleteClient(multiUriClientId).catch(() => {});
        await clientApi.deleteClient(pkceRequiredClientId).catch(() => {});
        await app.close();
    });

    /** Helper: make a GET /api/oauth/authorize request with given query params */
    function authorizeRequest(params: Record<string, string>) {
        const query = new URLSearchParams(params).toString();
        return app.getHttpServer()
            .get(`/api/oauth/authorize?${query}`)
            .redirects(0);
    }

    // ─── Happy Path ──────────────────────────────────────────────────

    describe('happy path', () => {
        it('should redirect to login UI with all params forwarded (Req 1.1, 1.2, 5.1)', async () => {
            const response = await authorizeRequest({
                response_type: 'code',
                client_id: singleUriClientId,
                redirect_uri: REDIRECT_URI,
                scope: 'openid profile',
                state: 'xyz123',
                code_challenge: 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
                code_challenge_method: 'S256',
                nonce: 'nonce-abc',
            });

            expect(response.status).toEqual(302);
            const location = new URL(response.headers.location, 'http://localhost');
            expect(location.pathname).toEqual('/authorize');
            expect(location.searchParams.get('client_id')).toEqual(singleUriClientId);
            expect(location.searchParams.get('redirect_uri')).toEqual(REDIRECT_URI);
            expect(location.searchParams.get('scope')).toEqual('openid profile');
            expect(location.searchParams.get('state')).toEqual('xyz123');
            expect(location.searchParams.get('code_challenge')).toEqual('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
            expect(location.searchParams.get('code_challenge_method')).toEqual('S256');
            expect(location.searchParams.get('nonce')).toEqual('nonce-abc');
        });
    });

    // ─── Pre-Redirect Errors ─────────────────────────────────────────

    describe('pre-redirect errors (JSON, no redirect)', () => {
        it('should return JSON error for unknown client_id (Req 1.4, 8.2)', async () => {
            const response = await authorizeRequest({
                response_type: 'code',
                client_id: 'totally-unknown-client-id',
                redirect_uri: REDIRECT_URI,
                state: 'abc',
            });

            expect(response.status).toEqual(400);
            expect(response.body.error).toEqual('invalid_request');
            expect(response.body.error_description).toBeDefined();
        });

        it('should return JSON error for missing client_id (Req 1.4, 8.2)', async () => {
            const response = await authorizeRequest({
                response_type: 'code',
                redirect_uri: REDIRECT_URI,
                state: 'abc',
            });

            expect(response.status).toEqual(400);
            expect(response.body.error).toEqual('invalid_request');
        });

        it('should return JSON error for invalid redirect_uri (Req 2.2, 8.2)', async () => {
            const response = await authorizeRequest({
                response_type: 'code',
                client_id: singleUriClientId,
                redirect_uri: 'https://evil.example.com/steal',
                state: 'abc',
            });

            expect(response.status).toEqual(400);
            expect(response.body.error).toEqual('invalid_request');
            expect(response.body.error_description).toBeDefined();
        });

        it('should return JSON error for missing response_type (Req 1.3)', async () => {
            const response = await authorizeRequest({
                client_id: singleUriClientId,
                redirect_uri: REDIRECT_URI,
                state: 'abc',
            });

            expect(response.status).toEqual(400);
            expect(response.body.error).toEqual('unsupported_response_type');
        });

        it('should return JSON error for invalid response_type (Req 1.3)', async () => {
            const response = await authorizeRequest({
                response_type: 'token',
                client_id: singleUriClientId,
                redirect_uri: REDIRECT_URI,
                state: 'abc',
            });

            expect(response.status).toEqual(400);
            expect(response.body.error).toEqual('unsupported_response_type');
        });
    });

    // ─── Post-Redirect Errors ────────────────────────────────────────

    describe('post-redirect errors (redirect with error params)', () => {
        it('should redirect with error when state is missing (Req 3.1, 8.1)', async () => {
            const response = await authorizeRequest({
                response_type: 'code',
                client_id: singleUriClientId,
                redirect_uri: REDIRECT_URI,
            });

            expect(response.status).toEqual(302);
            const location = new URL(response.headers.location);
            expect(location.origin + location.pathname).toEqual(REDIRECT_URI);
            expect(location.searchParams.get('error')).toEqual('invalid_request');
            expect(location.searchParams.get('error_description')).toBeDefined();
        });

        it('should redirect with error for PKCE violation: require_pkce without code_challenge (Req 4.1)', async () => {
            const response = await authorizeRequest({
                response_type: 'code',
                client_id: pkceRequiredClientId,
                redirect_uri: REDIRECT_URI,
                state: 'pkce-test',
            });

            expect(response.status).toEqual(302);
            const location = new URL(response.headers.location);
            expect(location.origin + location.pathname).toEqual(REDIRECT_URI);
            expect(location.searchParams.get('error')).toEqual('invalid_request');
            expect(location.searchParams.get('error_description')).toContain('code_challenge');
            expect(location.searchParams.get('state')).toEqual('pkce-test');
        });

        it('should redirect with error for PKCE violation: plain method when require_pkce=true (Req 4.2)', async () => {
            const response = await authorizeRequest({
                response_type: 'code',
                client_id: pkceRequiredClientId,
                redirect_uri: REDIRECT_URI,
                state: 'pkce-plain',
                code_challenge: 'some-challenge-value',
                code_challenge_method: 'plain',
            });

            expect(response.status).toEqual(302);
            const location = new URL(response.headers.location);
            expect(location.origin + location.pathname).toEqual(REDIRECT_URI);
            expect(location.searchParams.get('error')).toEqual('invalid_request');
            expect(location.searchParams.get('error_description')).toContain('S256');
            expect(location.searchParams.get('state')).toEqual('pkce-plain');
        });
    });

    // ─── Redirect URI Resolution ─────────────────────────────────────

    describe('redirect URI resolution', () => {
        it('should use single registered URI when redirect_uri is omitted (Req 2.3)', async () => {
            const response = await authorizeRequest({
                response_type: 'code',
                client_id: singleUriClientId,
                state: 'single-uri',
                code_challenge: 'test-challenge',
                code_challenge_method: 'S256',
            });

            expect(response.status).toEqual(302);
            const location = new URL(response.headers.location, 'http://localhost');
            // Should redirect to login UI, not to the client redirect URI
            expect(location.pathname).toEqual('/authorize');
            expect(location.searchParams.get('redirect_uri')).toEqual(REDIRECT_URI);
        });

        it('should return JSON error when redirect_uri omitted and client has multiple URIs (Req 2.4)', async () => {
            const response = await authorizeRequest({
                response_type: 'code',
                client_id: multiUriClientId,
                state: 'multi-uri',
            });

            expect(response.status).toEqual(400);
            expect(response.body.error).toEqual('invalid_request');
            expect(response.body.error_description).toBeDefined();
        });
    });

    // ─── PKCE Enforcement ────────────────────────────────────────────

    describe('PKCE enforcement', () => {
        it('should error when require_pkce=true and code_challenge missing (Req 4.1)', async () => {
            const response = await authorizeRequest({
                response_type: 'code',
                client_id: pkceRequiredClientId,
                redirect_uri: REDIRECT_URI,
                state: 'no-challenge',
            });

            expect(response.status).toEqual(302);
            const location = new URL(response.headers.location);
            expect(location.searchParams.get('error')).toEqual('invalid_request');
            expect(location.searchParams.get('state')).toEqual('no-challenge');
        });

        it('should error when require_pkce=true and method is plain (Req 4.2)', async () => {
            const response = await authorizeRequest({
                response_type: 'code',
                client_id: pkceRequiredClientId,
                redirect_uri: REDIRECT_URI,
                state: 'plain-method',
                code_challenge: 'some-challenge',
                code_challenge_method: 'plain',
            });

            expect(response.status).toEqual(302);
            const location = new URL(response.headers.location);
            expect(location.searchParams.get('error')).toEqual('invalid_request');
            expect(location.searchParams.get('error_description')).toContain('S256');
        });

        it('should reject plain method when client previously used S256 (downgrade prevention) (Req 4.3)', async () => {
            // Create a fresh client, do a login with S256 to set pkceMethodUsed, then test authorize
            const created = await clientApi.createClient(testTenantId, 'Downgrade Authorize Test', {
                redirectUris: [REDIRECT_URI],
                allowedScopes: 'openid profile email',
                isPublic: true,
                requirePkce: false,
            });
            const clientId = created.client.clientId;

            try {
                // First, do a login with S256 to set pkceMethodUsed on the client
                const loginResponse = await app.getHttpServer()
                    .post('/api/oauth/login')
                    .send({
                        email: 'admin@auth.server.com',
                        password: 'admin9000',
                        client_id: clientId,
                        code_challenge: 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
                        code_challenge_method: 'S256',
                    })
                    .set('Accept', 'application/json');
                expect(loginResponse.status).toEqual(201);

                // Now try authorize with plain — should be rejected
                const response = await authorizeRequest({
                    response_type: 'code',
                    client_id: clientId,
                    redirect_uri: REDIRECT_URI,
                    state: 'downgrade-test',
                    code_challenge: 'some-challenge',
                    code_challenge_method: 'plain',
                });

                expect(response.status).toEqual(302);
                const location = new URL(response.headers.location);
                expect(location.searchParams.get('error')).toEqual('invalid_request');
                expect(location.searchParams.get('error_description')).toContain('downgrade');
                expect(location.searchParams.get('state')).toEqual('downgrade-test');
            } finally {
                await clientApi.deleteClient(clientId).catch(() => {});
            }
        });

        it('should default code_challenge_method to plain when omitted (Req 4.4)', async () => {
            // Use a non-requirePkce client with no S256 history
            const created = await clientApi.createClient(testTenantId, 'Default Method Client', {
                redirectUris: [REDIRECT_URI],
                allowedScopes: 'openid profile email',
                isPublic: true,
                requirePkce: false,
            });
            const clientId = created.client.clientId;

            try {
                const response = await authorizeRequest({
                    response_type: 'code',
                    client_id: clientId,
                    redirect_uri: REDIRECT_URI,
                    state: 'default-method',
                    code_challenge: 'some-challenge-value',
                    // code_challenge_method intentionally omitted
                });

                expect(response.status).toEqual(302);
                const location = new URL(response.headers.location, 'http://localhost');
                expect(location.pathname).toEqual('/authorize');
                // Method should default to plain
                expect(location.searchParams.get('code_challenge_method')).toEqual('plain');
            } finally {
                await clientApi.deleteClient(clientId).catch(() => {});
            }
        });
    });

    // ─── Scope Handling ──────────────────────────────────────────────

    describe('scope handling', () => {
        it('should forward scope as-is when provided (Req 6.1)', async () => {
            const response = await authorizeRequest({
                response_type: 'code',
                client_id: singleUriClientId,
                redirect_uri: REDIRECT_URI,
                state: 'scope-test',
                scope: 'openid profile',
            });

            expect(response.status).toEqual(302);
            const location = new URL(response.headers.location, 'http://localhost');
            expect(location.pathname).toEqual('/authorize');
            expect(location.searchParams.get('scope')).toEqual('openid profile');
        });

        it('should use client default scopes when scope is omitted (Req 6.2)', async () => {
            const response = await authorizeRequest({
                response_type: 'code',
                client_id: singleUriClientId,
                redirect_uri: REDIRECT_URI,
                state: 'default-scope',
            });

            expect(response.status).toEqual(302);
            const location = new URL(response.headers.location, 'http://localhost');
            expect(location.pathname).toEqual('/authorize');
            // Client was created with allowedScopes: 'openid profile email'
            const scope = location.searchParams.get('scope');
            expect(scope).toBeDefined();
            expect(scope).toContain('openid');
            expect(scope).toContain('profile');
            expect(scope).toContain('email');
        });
    });

    // ─── Nonce Passthrough ───────────────────────────────────────────

    describe('nonce passthrough', () => {
        it('should forward nonce when provided (Req 7.1)', async () => {
            const response = await authorizeRequest({
                response_type: 'code',
                client_id: singleUriClientId,
                redirect_uri: REDIRECT_URI,
                state: 'nonce-test',
                nonce: 'my-nonce-value',
            });

            expect(response.status).toEqual(302);
            const location = new URL(response.headers.location, 'http://localhost');
            expect(location.searchParams.get('nonce')).toEqual('my-nonce-value');
        });

        it('should accept nonce at 512-char boundary (Req 7.3)', async () => {
            const nonce512 = 'a'.repeat(512);
            const response = await authorizeRequest({
                response_type: 'code',
                client_id: singleUriClientId,
                redirect_uri: REDIRECT_URI,
                state: 'nonce-boundary',
                nonce: nonce512,
            });

            expect(response.status).toEqual(302);
            const location = new URL(response.headers.location, 'http://localhost');
            expect(location.pathname).toEqual('/authorize');
            expect(location.searchParams.get('nonce')).toEqual(nonce512);
        });

        it('should reject nonce exceeding 512 characters (Req 7.3)', async () => {
            const nonce513 = 'a'.repeat(513);
            const response = await authorizeRequest({
                response_type: 'code',
                client_id: singleUriClientId,
                redirect_uri: REDIRECT_URI,
                state: 'nonce-too-long',
                nonce: nonce513,
            });

            expect(response.status).toEqual(302);
            const location = new URL(response.headers.location);
            expect(location.origin + location.pathname).toEqual(REDIRECT_URI);
            expect(location.searchParams.get('error')).toEqual('invalid_request');
            expect(location.searchParams.get('error_description')).toContain('nonce');
            expect(location.searchParams.get('state')).toEqual('nonce-too-long');
        });
    });

    // ─── State Round-Trip ────────────────────────────────────────────

    describe('state round-trip', () => {
        it('should preserve state exactly in success redirect (Req 3.2)', async () => {
            const stateValue = 'complex-state_with.special/chars=123&more';
            const response = await authorizeRequest({
                response_type: 'code',
                client_id: singleUriClientId,
                redirect_uri: REDIRECT_URI,
                state: stateValue,
            });

            expect(response.status).toEqual(302);
            const location = new URL(response.headers.location, 'http://localhost');
            expect(location.pathname).toEqual('/authorize');
            expect(location.searchParams.get('state')).toEqual(stateValue);
        });

        it('should preserve state exactly in error redirect (Req 3.2, 8.1)', async () => {
            const stateValue = 'error-state_value!@#';
            // Trigger a post-redirect error (PKCE required but missing)
            const response = await authorizeRequest({
                response_type: 'code',
                client_id: pkceRequiredClientId,
                redirect_uri: REDIRECT_URI,
                state: stateValue,
            });

            expect(response.status).toEqual(302);
            const location = new URL(response.headers.location);
            expect(location.searchParams.get('error')).toBeDefined();
            expect(location.searchParams.get('state')).toEqual(stateValue);
        });
    });
});
