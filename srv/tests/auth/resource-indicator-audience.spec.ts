import {SharedTestFixture} from '../shared-test.fixture';
import {TokenFixture} from '../token.fixture';
import {ClientEntityClient} from '../api-client/client-entity-client';
import {TenantClient} from '../api-client/tenant-client';

/**
 * Integration tests for Resource Indicator Audience Claim Construction (RFC 8707).
 *
 * Validates audience claim construction with resource indicators:
 * - Token without resource → aud is [SUPER_TENANT_DOMAIN]
 * - Token with resource → aud is [resource, SUPER_TENANT_DOMAIN]
 * - aud is always a JSON array (never a bare string)
 * - Refresh token grant with resource → new token has correct aud
 *
 * Requirements: 4.1, 4.2, 4.3, 4.4
 */
describe('Resource Indicator Audience Claim Construction', () => {
    let app: SharedTestFixture;
    let clientApi: ClientEntityClient;
    let accessToken: string;
    let testTenantId: string;

    const REDIRECT_URI = 'https://audience-claim-test.example.com/callback';
    const VALID_RESOURCE = 'https://api.example.com';

    beforeAll(async () => {
        app = new SharedTestFixture();
        const tokenFixture = new TokenFixture(app);
        const response = await tokenFixture.fetchPasswordGrantAccessToken(
            'admin@auth.server.com',
            'admin9000',
            'auth.server.com',
        );
        accessToken = response.accessToken;
        clientApi = new ClientEntityClient(app, accessToken);

        const tenantClient = new TenantClient(app, accessToken);
        const tenant = await tenantClient.createTenant('aud-claim-test', 'aud-claim-test.com');
        testTenantId = tenant.id;
    });

    afterAll(async () => {
        await app.close();
    });

    // ─── Token Without Resource ───────────────────────────────────────────

    describe('token without resource', () => {
        it('should have aud containing only SUPER_TENANT_DOMAIN (Req 4.3)', async () => {
            const client = await clientApi.createClient(testTenantId, 'No Resource Client', {
                redirectUris: [REDIRECT_URI],
                allowedScopes: 'openid profile email',
                isPublic: true,
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
                        // No resource parameter
                    })
                    .set('Accept', 'application/json');

                expect(response.status).toEqual(200);

                const jwt = app.jwtService().decode(response.body.access_token, {json: true}) as any;

                expect(jwt.aud).toBeDefined();
                expect(Array.isArray(jwt.aud)).toBe(true);
                expect(jwt.aud.length).toBe(1);
                expect(jwt.aud).toContain('auth.server.com');
            } finally {
                await clientApi.deleteClient(clientId).catch(() => {
                });
            }
        });
    });

    // ─── Token With Resource ──────────────────────────────────────────────

    describe('token with resource', () => {
        it('should have aud containing [resource, SUPER_TENANT_DOMAIN] (Req 4.1, 4.2)', async () => {
            const client = await clientApi.createClient(testTenantId, 'With Resource Client', {
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

                const jwt = app.jwtService().decode(response.body.access_token, {json: true}) as any;

                expect(jwt.aud).toBeDefined();
                expect(Array.isArray(jwt.aud)).toBe(true);
                expect(jwt.aud.length).toBe(2);
                expect(jwt.aud).toContain(VALID_RESOURCE);
                expect(jwt.aud).toContain('auth.server.com');
            } finally {
                await clientApi.deleteClient(clientId).catch(() => {
                });
            }
        });
    });

    // ─── Audience Always Array ────────────────────────────────────────────

    describe('audience always array', () => {
        it('aud is always a JSON array (never a bare string) (Req 4.4)', async () => {
            // Test with resource
            const clientWithResource = await clientApi.createClient(testTenantId, 'Array Test Client', {
                redirectUris: [REDIRECT_URI],
                allowedScopes: 'openid profile email',
                isPublic: true,
                allowedResources: [VALID_RESOURCE],
                allowPasswordGrant: true,
            });

            try {
                const response = await app.getHttpServer()
                    .post('/api/oauth/token')
                    .send({
                        grant_type: 'password',
                        username: 'admin@auth.server.com',
                        password: 'admin9000',
                        client_id: clientWithResource.client.clientId,
                        resource: VALID_RESOURCE,
                    })
                    .set('Accept', 'application/json');

                expect(response.status).toEqual(200);

                const jwt = app.jwtService().decode(response.body.access_token, {json: true}) as any;

                // Must be an array, never a string
                expect(Array.isArray(jwt.aud)).toBe(true);
                expect(typeof jwt.aud).not.toBe('string');
            } finally {
                await clientApi.deleteClient(clientWithResource.client.clientId).catch(() => {
                });
            }

            // Test without resource
            const clientWithoutResource = await clientApi.createClient(testTenantId, 'Array Test Client 2', {
                redirectUris: [REDIRECT_URI],
                allowedScopes: 'openid profile email',
                isPublic: true,
                allowPasswordGrant: true,
            });

            try {
                const response = await app.getHttpServer()
                    .post('/api/oauth/token')
                    .send({
                        grant_type: 'password',
                        username: 'admin@auth.server.com',
                        password: 'admin9000',
                        client_id: clientWithoutResource.client.clientId,
                    })
                    .set('Accept', 'application/json');

                expect(response.status).toEqual(200);

                const jwt = app.jwtService().decode(response.body.access_token, {json: true}) as any;

                // Must be an array, never a string
                expect(Array.isArray(jwt.aud)).toBe(true);
                expect(typeof jwt.aud).not.toBe('string');
            } finally {
                await clientApi.deleteClient(clientWithoutResource.client.clientId).catch(() => {
                });
            }
        });
    });

    // ─── Refresh Token Grant with Resource ────────────────────────────────

    describe('refresh token grant with resource', () => {
        it('should issue new token with correct aud (Req 4.4)', async () => {
            const client = await clientApi.createClient(testTenantId, 'Refresh Token Resource Client', {
                redirectUris: [REDIRECT_URI],
                allowedScopes: 'openid profile email',
                isPublic: true,
                allowedResources: [VALID_RESOURCE],
                allowPasswordGrant: true,
                allowRefreshToken: true,
            });
            const clientId = client.client.clientId;

            try {
                // Get initial token with resource
                const initialResponse = await app.getHttpServer()
                    .post('/api/oauth/token')
                    .send({
                        grant_type: 'password',
                        username: 'admin@auth.server.com',
                        password: 'admin9000',
                        client_id: clientId,
                        resource: VALID_RESOURCE,
                    })
                    .set('Accept', 'application/json');

                expect(initialResponse.status).toEqual(200);
                const refreshToken = initialResponse.body.refresh_token;

                // Verify initial token has correct aud
                const initialJwt = app.jwtService().decode(initialResponse.body.access_token, {json: true}) as any;
                expect(initialJwt.aud).toContain(VALID_RESOURCE);

                // Use refresh token with same resource
                const refreshResponse = await app.getHttpServer()
                    .post('/api/oauth/token')
                    .send({
                        grant_type: 'refresh_token',
                        refresh_token: refreshToken,
                        client_id: clientId,
                        resource: VALID_RESOURCE,
                    })
                    .set('Accept', 'application/json');

                expect(refreshResponse.status).toEqual(200);

                const refreshJwt = app.jwtService().decode(refreshResponse.body.access_token, {json: true}) as any;

                // Refreshed token should have the same audience
                expect(refreshJwt.aud).toBeDefined();
                expect(Array.isArray(refreshJwt.aud)).toBe(true);
                expect(refreshJwt.aud).toContain(VALID_RESOURCE);
                expect(refreshJwt.aud).toContain('auth.server.com');
            } finally {
                await clientApi.deleteClient(clientId).catch(() => {
                });
            }
        });
    });

    // ─── Client Credentials with Resource ─────────────────────────────────

    describe('client credentials with resource', () => {
        it('should return invalid_target for client_credentials when client has no allowedResources (Req 4.1, 4.2)', async () => {
            // Create a confidential client without allowedResources
            const noResourceClient = await clientApi.createClient(testTenantId, 'No Resource CC Client', {
                allowedScopes: 'openid profile email',
                grantTypes: 'client_credentials',
                isPublic: false,
            });

            try {
                const response = await app.getHttpServer()
                    .post('/api/oauth/token')
                    .send({
                        grant_type: 'client_credentials',
                        client_id: noResourceClient.client.clientId,
                        client_secret: noResourceClient.clientSecret,
                        resource: VALID_RESOURCE,
                    })
                    .set('Accept', 'application/json');

                expect(response.status).toEqual(400);
                expect(response.body.error).toEqual('invalid_target');
            } finally {
                await clientApi.deleteClient(noResourceClient.client.clientId).catch(() => {
                });
            }
        });
    });
});
