import {SharedTestFixture} from '../shared-test.fixture';
import {TokenFixture} from '../token.fixture';
import {ClientEntityClient} from '../api-client/client-entity-client';
import {TenantClient} from '../api-client/tenant-client';

/**
 * Integration tests for Resource Indicator Validation (RFC 8707).
 *
 * Validates resource indicator validation on authorize and token endpoints:
 * - Authorize request with valid resource → 302 redirect with resource forwarded
 * - Authorize request with non-absolute URI → 302 redirect with invalid_target
 * - Authorize request with fragment in resource → 302 redirect with invalid_target
 * - Authorize request with resource not in client's allowedResources → 302 redirect with invalid_target
 * - Authorize request with resource but client has no allowedResources → 302 redirect with invalid_target
 * - Token request (password grant) with valid resource → token with correct aud
 * - Token request with invalid resource → JSON 400 with invalid_target
 * - Token request (client_credentials) with valid resource → token with correct aud
 *
 * Requirements: 2.2, 2.3, 2.4, 3.2, 3.3, 3.4, 5.1, 5.2, 5.3, 5.4
 */
describe('Resource Indicator Validation', () => {
    let app: SharedTestFixture;
    let clientApi: ClientEntityClient;
    let accessToken: string;
    let testTenantId: string;

    const REDIRECT_URI = 'https://resource-validation-test.example.com/callback';
    const VALID_RESOURCE = 'https://api.example.com';

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
        const tenant = await tenantClient.createTenant('res-val-test', 'res-val-test.com');
        testTenantId = tenant.id;
    });

    afterAll(async () => {
        await app.close();
    });

    // ─── Helper Functions ────────────────────────────────────────────────

    function authorizeRequest(params: Record<string, string>) {
        const query = new URLSearchParams(params).toString();
        return app.getHttpServer()
            .get(`/api/oauth/authorize?${query}`)
            .redirects(0);
    }

    // ─── Authorize Endpoint Validation ────────────────────────────────────

    describe('authorize endpoint validation', () => {
        it('should redirect with resource forwarded when valid (Req 2.2)', async () => {
            const client = await clientApi.createClient(testTenantId, 'Valid Resource Client', {
                redirectUris: [REDIRECT_URI],
                allowedScopes: 'openid profile email',
                isPublic: true,
                allowedResources: [VALID_RESOURCE],
            });
            const clientId = client.client.clientId;

            try {
                const response = await authorizeRequest({
                    response_type: 'code',
                    client_id: clientId,
                    redirect_uri: REDIRECT_URI,
                    scope: 'openid',
                    state: 'test-state',
                    code_challenge: 'test-challenge',
                    code_challenge_method: 'S256',
                    resource: VALID_RESOURCE,
                });

                expect(response.status).toEqual(302);
                const location = new URL(response.headers.location, 'http://localhost');
                expect(location.pathname).toEqual('/authorize');
                expect(location.searchParams.get('resource')).toEqual(VALID_RESOURCE);
            } finally {
                await clientApi.deleteClient(clientId).catch(() => {
                });
            }
        });

        it('should redirect with invalid_target for non-absolute URI (Req 5.1)', async () => {
            // Create a client with valid allowedResources (client creation validates URLs).
            // The non-absolute URI is only sent in the authorize request to test runtime validation.
            const client = await clientApi.createClient(testTenantId, 'Non-Absolute URI Client', {
                redirectUris: [REDIRECT_URI],
                allowedScopes: 'openid profile email',
                isPublic: true,
                allowedResources: [VALID_RESOURCE],
            });
            const clientId = client.client.clientId;

            try {
                const response = await authorizeRequest({
                    response_type: 'code',
                    client_id: clientId,
                    redirect_uri: REDIRECT_URI,
                    scope: 'openid',
                    state: 'test-state',
                    code_challenge: 'test-challenge',
                    code_challenge_method: 'S256',
                    resource: '/api/v1', // non-absolute URI in the request
                });

                expect(response.status).toEqual(302);
                const location = new URL(response.headers.location);
                expect(location.origin + location.pathname).toEqual(REDIRECT_URI);
                expect(location.searchParams.get('error')).toEqual('invalid_target');
                expect(location.searchParams.get('state')).toEqual('test-state');
            } finally {
                await clientApi.deleteClient(clientId).catch(() => {
                });
            }
        });

        it('should redirect with invalid_target for URI with fragment (Req 5.2)', async () => {
            const client = await clientApi.createClient(testTenantId, 'Fragment URI Client', {
                redirectUris: [REDIRECT_URI],
                allowedScopes: 'openid profile email',
                isPublic: true,
                allowedResources: [VALID_RESOURCE],
            });
            const clientId = client.client.clientId;

            try {
                const response = await authorizeRequest({
                    response_type: 'code',
                    client_id: clientId,
                    redirect_uri: REDIRECT_URI,
                    scope: 'openid',
                    state: 'test-state',
                    code_challenge: 'test-challenge',
                    code_challenge_method: 'S256',
                    resource: `${VALID_RESOURCE}#section`, // URI with fragment
                });

                expect(response.status).toEqual(302);
                const location = new URL(response.headers.location);
                expect(location.origin + location.pathname).toEqual(REDIRECT_URI);
                expect(location.searchParams.get('error')).toEqual('invalid_target');
                expect(location.searchParams.get('state')).toEqual('test-state');
            } finally {
                await clientApi.deleteClient(clientId).catch(() => {
                });
            }
        });

        it('should redirect with invalid_target when resource not in allowedResources (Req 5.3)', async () => {
            const client = await clientApi.createClient(testTenantId, 'Not Allowed Resource Client', {
                redirectUris: [REDIRECT_URI],
                allowedScopes: 'openid profile email',
                isPublic: true,
                allowedResources: [VALID_RESOURCE],
            });
            const clientId = client.client.clientId;

            try {
                const response = await authorizeRequest({
                    response_type: 'code',
                    client_id: clientId,
                    redirect_uri: REDIRECT_URI,
                    scope: 'openid',
                    state: 'test-state',
                    code_challenge: 'test-challenge',
                    code_challenge_method: 'S256',
                    resource: 'https://different-api.example.com', // not in allowedResources
                });

                expect(response.status).toEqual(302);
                const location = new URL(response.headers.location);
                expect(location.origin + location.pathname).toEqual(REDIRECT_URI);
                expect(location.searchParams.get('error')).toEqual('invalid_target');
                expect(location.searchParams.get('state')).toEqual('test-state');
            } finally {
                await clientApi.deleteClient(clientId).catch(() => {
                });
            }
        });

        it('should redirect with invalid_target when client has no allowedResources (Req 5.4)', async () => {
            const client = await clientApi.createClient(testTenantId, 'No Allowed Resources Client', {
                redirectUris: [REDIRECT_URI],
                allowedScopes: 'openid profile email',
                isPublic: true,
                // No allowedResources
            });
            const clientId = client.client.clientId;

            try {
                const response = await authorizeRequest({
                    response_type: 'code',
                    client_id: clientId,
                    redirect_uri: REDIRECT_URI,
                    scope: 'openid',
                    state: 'test-state',
                    code_challenge: 'test-challenge',
                    code_challenge_method: 'S256',
                    resource: VALID_RESOURCE,
                });

                expect(response.status).toEqual(302);
                const location = new URL(response.headers.location);
                expect(location.origin + location.pathname).toEqual(REDIRECT_URI);
                expect(location.searchParams.get('error')).toEqual('invalid_target');
                expect(location.searchParams.get('state')).toEqual('test-state');
            } finally {
                await clientApi.deleteClient(clientId).catch(() => {
                });
            }
        });
    });

    // ─── Token Endpoint Validation ────────────────────────────────────────

    describe('token endpoint validation', () => {
        it('should issue token with correct aud for valid resource (password grant) (Req 3.2)', async () => {
            const client = await clientApi.createClient(testTenantId, 'Password Grant Resource Client', {
                redirectUris: [REDIRECT_URI],
                allowedScopes: 'openid profile email',
                isPublic: true,
                allowedResources: [VALID_RESOURCE],
                allowPasswordGrant: true,
            });
            const clientId = client.client.clientId;

            try {
                const response = await app.getHttpServer()
                    .post('/api/oauth/token')
                    .send({
                        grant_type: 'password',
                        username: 'admin@auth.server.com',
                        password: 'admin9000',
                        client_id: clientId,
                        resource: VALID_RESOURCE,
                    })
                    .set('Accept', 'application/json');

                expect(response.status).toEqual(200);
                expect(response.body.access_token).toBeDefined();

                const jwt = app.jwtService().decode(response.body.access_token, {json: true}) as any;
                expect(jwt.aud).toBeDefined();
                expect(Array.isArray(jwt.aud)).toBe(true);
                expect(jwt.aud).toContain(VALID_RESOURCE);
                expect(jwt.aud).toContain('auth.server.com');
            } finally {
                await clientApi.deleteClient(clientId).catch(() => {
                });
            }
        });

        it('should return JSON 400 with invalid_target for invalid resource (Req 3.4)', async () => {
            const client = await clientApi.createClient(testTenantId, 'Invalid Resource Token Client', {
                redirectUris: [REDIRECT_URI],
                allowedScopes: 'openid profile email',
                isPublic: true,
                allowedResources: [VALID_RESOURCE],
                allowPasswordGrant: true,
            });
            const clientId = client.client.clientId;

            try {
                const response = await app.getHttpServer()
                    .post('/api/oauth/token')
                    .send({
                        grant_type: 'password',
                        username: 'admin@auth.server.com',
                        password: 'admin9000',
                        client_id: clientId,
                        resource: 'https://unauthorized-api.example.com',
                    })
                    .set('Accept', 'application/json');

                expect(response.status).toEqual(400);
                expect(response.body.error).toEqual('invalid_target');
            } finally {
                await clientApi.deleteClient(clientId).catch(() => {
                });
            }
        });

        it('should issue token with correct aud for valid resource (client_credentials) (Req 3.2)', async () => {
            // For client_credentials, we need to use a Client entity that has allowedResources
            // and authenticate using the Client's own credentials (not tenant-level credentials).
            const client = await clientApi.createClient(testTenantId, 'Client Credentials Resource Client', {
                redirectUris: [REDIRECT_URI],
                allowedScopes: 'openid profile email',
                isPublic: false,
                allowedResources: [VALID_RESOURCE],
                grantTypes: 'client_credentials',
            });
            const clientId = client.client.clientId;
            const clientSecret = client.clientSecret;

            try {
                const response = await app.getHttpServer()
                    .post('/api/oauth/token')
                    .send({
                        grant_type: 'client_credentials',
                        client_id: clientId,
                        client_secret: clientSecret,
                        resource: VALID_RESOURCE,
                    })
                    .set('Accept', 'application/json');

                // client_credentials with a Client entity that has allowedResources
                // should succeed and include the resource in the aud claim.
                expect(response.status).toEqual(200);
                expect(response.body.access_token).toBeDefined();

                const jwt = app.jwtService().decode(response.body.access_token, {json: true}) as any;
                expect(jwt.aud).toBeDefined();
                expect(Array.isArray(jwt.aud)).toBe(true);
                expect(jwt.aud).toContain(VALID_RESOURCE);
                expect(jwt.aud).toContain('auth.server.com');
            } finally {
                await clientApi.deleteClient(clientId).catch(() => {
                });
            }
        });

        it('should return invalid_target for non-absolute URI in token request (Req 5.1)', async () => {
            // Create a client with valid allowedResources (client creation validates URLs).
            // The non-absolute URI is only sent in the token request to test runtime validation.
            const client = await clientApi.createClient(testTenantId, 'Non-Absolute Token Client', {
                redirectUris: [REDIRECT_URI],
                allowedScopes: 'openid profile email',
                isPublic: true,
                allowedResources: [VALID_RESOURCE],
                allowPasswordGrant: true,
            });
            const clientId = client.client.clientId;

            try {
                const response = await app.getHttpServer()
                    .post('/api/oauth/token')
                    .send({
                        grant_type: 'password',
                        username: 'admin@auth.server.com',
                        password: 'admin9000',
                        client_id: clientId,
                        resource: '/api/v1', // non-absolute URI in the request
                    })
                    .set('Accept', 'application/json');

                expect(response.status).toEqual(400);
                expect(response.body.error).toEqual('invalid_target');
            } finally {
                await clientApi.deleteClient(clientId).catch(() => {
                });
            }
        });

        it('should return invalid_target for URI with fragment in token request (Req 5.2)', async () => {
            const client = await clientApi.createClient(testTenantId, 'Fragment Token Client', {
                redirectUris: [REDIRECT_URI],
                allowedScopes: 'openid profile email',
                isPublic: true,
                allowedResources: [VALID_RESOURCE],
                allowPasswordGrant: true,
            });
            const clientId = client.client.clientId;

            try {
                const response = await app.getHttpServer()
                    .post('/api/oauth/token')
                    .send({
                        grant_type: 'password',
                        username: 'admin@auth.server.com',
                        password: 'admin9000',
                        client_id: clientId,
                        resource: `${VALID_RESOURCE}#section`,
                    })
                    .set('Accept', 'application/json');

                expect(response.status).toEqual(400);
                expect(response.body.error).toEqual('invalid_target');
            } finally {
                await clientApi.deleteClient(clientId).catch(() => {
                });
            }
        });

        it('should return invalid_target when client has no allowedResources in token request (Req 5.4)', async () => {
            const client = await clientApi.createClient(testTenantId, 'No Resources Token Client', {
                redirectUris: [REDIRECT_URI],
                allowedScopes: 'openid profile email',
                isPublic: true,
                // No allowedResources
                allowPasswordGrant: true,
            });
            const clientId = client.client.clientId;

            try {
                const response = await app.getHttpServer()
                    .post('/api/oauth/token')
                    .send({
                        grant_type: 'password',
                        username: 'admin@auth.server.com',
                        password: 'admin9000',
                        client_id: clientId,
                        resource: VALID_RESOURCE,
                    })
                    .set('Accept', 'application/json');

                expect(response.status).toEqual(400);
                expect(response.body.error).toEqual('invalid_target');
            } finally {
                await clientApi.deleteClient(clientId).catch(() => {
                });
            }
        });
    });
});
