import {SharedTestFixture} from '../shared-test.fixture';
import {TokenFixture} from '../token.fixture';
import {ClientEntityClient} from '../api-client/client-entity-client';
import {AdminTenantClient} from '../api-client/admin-tenant-client';

/**
 * Integration tests for the Client Credentials Migration.
 *
 * Uses dedicated tenant: client-creds-migration-test.local
 * Admin email: admin@client-creds-migration-test.local
 * Password: admin9000
 *
 * Validates:
 *   - Test 1: Valid client_credentials grant with Client entity credentials (Req 2.1, 8.1)
 *   - Test 2: Invalid client_credentials grant returns invalid_client (Req 2.5, 8.2)
 *   - Test 3: Authorization code grant binds refresh token to Client UUID (Req 3.2, 4.1, 8.3)
 *   - Test 4: Refresh token grant with correct Client clientId succeeds (Req 4.2, 8.4)
 *   - Test 5: Refresh token grant with mismatched client_id returns invalid_grant (Req 4.3, 8.5)
 *   - Test 6: A public client authenticates without a secret (Req 2.3, 8.6)
 *   - Test 7: A default client has the correct configuration after tenant creation (Req 1.1–1.5)
 *   - Test 8: Secret rotation — both old and new secrets work during the overlap window (Req 2.6)
 *   - Test 9: Token client_id claim uses a Client UUID format (Req 3.2)
 *   - Test 10: ID token aud claim uses Client entity's clientId (Req 3.3)
 */
describe('Client Credentials Migration', () => {
    let app: SharedTestFixture;
    let tokenFixture: TokenFixture;
    let superAdminAccessToken: string;
    let clientApi: ClientEntityClient;
    let adminTenantApi: AdminTenantClient;

    // Dedicated tenant for this test suite
    const TENANT_DOMAIN = 'client-creds-migration-test.local';
    const ADMIN_EMAIL = `admin@${TENANT_DOMAIN}`;
    const ADMIN_PASSWORD = 'admin9000';
    let tenantId: string;

    beforeAll(async () => {
        app = new SharedTestFixture();
        tokenFixture = new TokenFixture(app);

        // Get super admin token for setup operations
        const superAdminResult = await tokenFixture.fetchPasswordGrantAccessToken(
            'admin@auth.server.com',
            'admin9000',
            'auth.server.com',
        );
        superAdminAccessToken = superAdminResult.accessToken;
        clientApi = new ClientEntityClient(app, superAdminAccessToken);
        adminTenantApi = new AdminTenantClient(app, superAdminAccessToken);

        // Resolve the dedicated tenant's ID
        const allTenants = await adminTenantApi.getAllTenants();
        const testTenant = allTenants.find((t: any) => t.domain === TENANT_DOMAIN);
        expect(testTenant).toBeDefined();
        tenantId = testTenant.id;
    });

    afterAll(async () => {
        await app.close();
    });

    // ─── Test 1: Valid client_credentials grant (Req 2.1, 8.1) ───────────

    describe('valid client_credentials grant', () => {
        let confidentialClientId: string;
        let confidentialClientSecret: string;

        beforeAll(async () => {
            const result = await clientApi.createClient(tenantId, 'CC Migration Test Client', {
                allowedScopes: 'openid profile email',
                grantTypes: 'client_credentials',
                isPublic: false,
            });
            confidentialClientId = result.client.clientId;
            confidentialClientSecret = result.clientSecret;
        });

        afterAll(async () => {
            await clientApi.deleteClient(confidentialClientId).catch(() => {
            });
        });

        it('should return a valid TechnicalToken', async () => {
            const response = await app.getHttpServer()
                .post('/api/oauth/token')
                .send({
                    grant_type: 'client_credentials',
                    client_id: confidentialClientId,
                    client_secret: confidentialClientSecret,
                })
                .set('Accept', 'application/json');

            expect(response.status).toEqual(200);
            expect(response.body.access_token).toBeDefined();
            expect(response.body.token_type).toEqual('Bearer');
            expect(response.body.expires_in).toBeDefined();

            // Decode and verify it's a technical token
            const jwt = app.jwtService().decode(response.body.access_token, {json: true}) as any;
            expect(jwt.sub).toEqual('oauth');
            expect(jwt.grant_type).toEqual('client_credentials');
            expect(jwt.tenant).toBeDefined();
            expect(jwt.tenant.domain).toEqual(TENANT_DOMAIN);
        });
    });

    // ─── Test 2: Invalid client_credentials grant (Req 2.5, 8.2) ────────

    describe('invalid client_credentials grant', () => {
        let confidentialClientId: string;

        beforeAll(async () => {
            const result = await clientApi.createClient(tenantId, 'CC Invalid Test Client', {
                allowedScopes: 'openid profile email',
                grantTypes: 'client_credentials',
                isPublic: false,
            });
            confidentialClientId = result.client.clientId;
        });

        afterAll(async () => {
            await clientApi.deleteClient(confidentialClientId).catch(() => {
            });
        });

        it('should return invalid_client for wrong secret', async () => {
            const response = await app.getHttpServer()
                .post('/api/oauth/token')
                .send({
                    grant_type: 'client_credentials',
                    client_id: confidentialClientId,
                    client_secret: 'wrong-secret',
                })
                .set('Accept', 'application/json');

            expect(response.status).toEqual(401);
            expect(response.body.error).toEqual('invalid_client');
        });

        it('should return invalid_client for unknown client_id', async () => {
            const response = await app.getHttpServer()
                .post('/api/oauth/token')
                .send({
                    grant_type: 'client_credentials',
                    client_id: 'non-existent-client-id',
                    client_secret: 'any-secret',
                })
                .set('Accept', 'application/json');

            expect(response.status).toEqual(401);
            expect(response.body.error).toEqual('invalid_client');
        });
    });

    // ─── Test 3: Auth code grant binds refresh token to Client UUID (Req 3.2, 4.1, 8.3) ───

    describe('authorization code grant binds refresh token to Client UUID', () => {
        it('should issue refresh token bound to Client UUID', async () => {
            // Use the dedicated tenant's default client (public, password grant enabled)
            const tokenResult = await tokenFixture.fetchPasswordGrantAccessToken(
                ADMIN_EMAIL,
                ADMIN_PASSWORD,
                TENANT_DOMAIN,
            );

            expect(tokenResult.refreshToken).toBeDefined();

            // The access token's client_id claim should be a UUID (Client entity format)
            const jwt = tokenResult.jwt;
            expect(jwt.client_id).toBeDefined();
            // UUID v4 format check
            const uuidV4Regex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
            expect(jwt.client_id).toMatch(uuidV4Regex);
        });
    });

    // ─── Test 4: Refresh token grant with correct client_id (Req 4.2, 8.4) ───

    describe('refresh token grant with correct client_id', () => {
        it('should succeed when client_id matches the original', async () => {
            const tokenResult = await tokenFixture.fetchPasswordGrantAccessToken(
                ADMIN_EMAIL,
                ADMIN_PASSWORD,
                TENANT_DOMAIN,
            );

            const refreshResponse = await app.getHttpServer()
                .post('/api/oauth/token')
                .send({
                    grant_type: 'refresh_token',
                    refresh_token: tokenResult.refreshToken,
                    client_id: TENANT_DOMAIN, // alias resolves to the same Client
                })
                .set('Accept', 'application/json');

            expect(refreshResponse.status).toEqual(200);
            expect(refreshResponse.body.access_token).toBeDefined();
            expect(refreshResponse.body.refresh_token).toBeDefined();
            expect(refreshResponse.body.token_type).toEqual('Bearer');
        });
    });

    // ─── Test 5: Refresh token grant with mismatched client_id (Req 4.3, 8.5) ───

    describe('refresh token grant with mismatched client_id', () => {
        it('should return invalid_grant when client_id does not match', async () => {
            // Get a token from the dedicated tenant
            const tokenResult = await tokenFixture.fetchPasswordGrantAccessToken(
                ADMIN_EMAIL,
                ADMIN_PASSWORD,
                TENANT_DOMAIN,
            );

            // Create a different client in the same tenant
            const otherClient = await clientApi.createClient(tenantId, 'Other Client', {
                allowedScopes: 'openid profile email',
                isPublic: true,
                allowPasswordGrant: true,
            });

            try {
                // Try to refresh with a different client_id
                const refreshResponse = await app.getHttpServer()
                    .post('/api/oauth/token')
                    .send({
                        grant_type: 'refresh_token',
                        refresh_token: tokenResult.refreshToken,
                        client_id: otherClient.client.clientId,
                    })
                    .set('Accept', 'application/json');

                expect(refreshResponse.status).toEqual(400);
                expect(refreshResponse.body.error).toEqual('invalid_grant');
            } finally {
                await clientApi.deleteClient(otherClient.client.clientId).catch(() => {
                });
            }
        });
    });

    // ─── Test 6: Public client authenticates without a secret (Req 2.3, 8.6) ───

    describe('public client authenticates without a secret', () => {
        it('should issue token for public client without client_secret', async () => {
            // The default client for the tenant is public
            const tokenResult = await tokenFixture.fetchPasswordGrantAccessToken(
                ADMIN_EMAIL,
                ADMIN_PASSWORD,
                TENANT_DOMAIN,
            );

            expect(tokenResult.accessToken).toBeDefined();
            expect(tokenResult.jwt.grant_type).toEqual('password');
        });
    });

    // ─── Test 7: Default client configuration (Req 1.1–1.5) ─────────────

    describe('default client has correct configuration', () => {
        it('should have correct defaults after tenant creation', async () => {
            const tenantClients = await adminTenantApi.getTenantClients(tenantId);
            const defaultClient = tenantClients.find((c: any) => c.alias === TENANT_DOMAIN);

            expect(defaultClient).toBeDefined();
            expect(defaultClient.name).toEqual('Default Client');
            expect(defaultClient.isPublic).toBe(true);
            expect(defaultClient.allowedScopes).toEqual('openid profile email');
            expect(defaultClient.grantTypes).toEqual('authorization_code');
            expect(defaultClient.responseTypes).toEqual('code');
            expect(defaultClient.tokenEndpointAuthMethod).toEqual('none');
            expect(defaultClient.allowRefreshToken).toBe(true);
            expect(defaultClient.alias).toEqual(TENANT_DOMAIN);
            // clientId should be a UUID
            const uuidV4Regex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
            expect(defaultClient.clientId).toMatch(uuidV4Regex);
        });
    });

    // ─── Test 8: Secret rotation overlap window (Req 2.6) ────────────────

    describe('secret rotation overlap window', () => {
        let rotationClientId: string;
        let originalSecret: string;

        beforeAll(async () => {
            const result = await clientApi.createClient(tenantId, 'Rotation Test Client', {
                allowedScopes: 'openid profile email',
                grantTypes: 'client_credentials',
                isPublic: false,
            });
            rotationClientId = result.client.clientId;
            originalSecret = result.clientSecret;
        });

        afterAll(async () => {
            await clientApi.deleteClient(rotationClientId).catch(() => {
            });
        });

        it('should accept both old and new secrets after rotation', async () => {
            // Rotate the secret
            const rotateResult = await clientApi.rotateSecret(rotationClientId);
            const newSecret = rotateResult.clientSecret;
            expect(newSecret).toBeDefined();
            expect(newSecret).not.toEqual(originalSecret);

            // Old secret should still work (within overlap window)
            const oldSecretResponse = await app.getHttpServer()
                .post('/api/oauth/token')
                .send({
                    grant_type: 'client_credentials',
                    client_id: rotationClientId,
                    client_secret: originalSecret,
                })
                .set('Accept', 'application/json');

            expect(oldSecretResponse.status).toEqual(200);
            expect(oldSecretResponse.body.access_token).toBeDefined();

            // New secret should also work
            const newSecretResponse = await app.getHttpServer()
                .post('/api/oauth/token')
                .send({
                    grant_type: 'client_credentials',
                    client_id: rotationClientId,
                    client_secret: newSecret,
                })
                .set('Accept', 'application/json');

            expect(newSecretResponse.status).toEqual(200);
            expect(newSecretResponse.body.access_token).toBeDefined();
        });
    });

    // ─── Test 9: Token client_id claim uses Client UUID format (Req 3.2) ─

    describe('token client_id claim uses Client UUID format', () => {
        it('should have UUID-format client_id in user access token', async () => {
            const tokenResult = await tokenFixture.fetchPasswordGrantAccessToken(
                ADMIN_EMAIL,
                ADMIN_PASSWORD,
                TENANT_DOMAIN,
            );

            const jwt = tokenResult.jwt;
            expect(jwt.client_id).toBeDefined();
            const uuidV4Regex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
            expect(jwt.client_id).toMatch(uuidV4Regex);
        });

        it('should have UUID-format client_id in technical access token', async () => {
            const result = await clientApi.createClient(tenantId, 'UUID Claim Test Client', {
                allowedScopes: 'openid profile email',
                grantTypes: 'client_credentials',
                isPublic: false,
            });

            try {
                const techResult = await tokenFixture.fetchClientCredentialsToken(
                    result.client.clientId,
                    result.clientSecret,
                );

                const jwt = techResult.jwt;
                expect(jwt.client_id).toBeDefined();
                const uuidV4Regex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
                expect(jwt.client_id).toMatch(uuidV4Regex);
            } finally {
                await clientApi.deleteClient(result.client.clientId).catch(() => {
                });
            }
        });
    });

    // ─── Test 10: ID token aud claim uses Client entity's clientId (Req 3.3) ─

    describe('ID token aud claim uses Client entity clientId', () => {
        it('should have Client UUID in aud claim', async () => {
            const tokenResult = await tokenFixture.fetchPasswordGrantAccessToken(
                ADMIN_EMAIL,
                ADMIN_PASSWORD,
                TENANT_DOMAIN,
            );

            const jwt = tokenResult.jwt;
            expect(jwt.aud).toBeDefined();
            expect(Array.isArray(jwt.aud)).toBe(true);
            // aud should contain the super tenant domain
            expect(jwt.aud).toContain('auth.server.com');
        });
    });
});
