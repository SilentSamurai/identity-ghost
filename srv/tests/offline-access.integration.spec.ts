/**
 * Integration tests for the offline_access scope and refresh token gating feature.
 *
 * Tests the full offline_access lifecycle through the HTTP stack:
 * - Discovery document includes offline_access in scopes_supported
 * - Refresh token issued when offline_access is in granted scopes
 * - Refresh token omitted when offline_access not requested and allowRefreshToken is false
 * - Refresh token issued via allowRefreshToken client override without offline_access
 * - offline_access excluded from access token JWT scope claim
 * - offline_access preserved in refresh token record scope
 * - client_credentials grant never includes refresh token
 * - Scope resolution excludes offline_access when not in client allowedScopes
 *
 * Requirements: 1.1-1.3, 2.1-2.2, 3.1-3.2, 4.2, 6.1-6.2, 7.1-7.3
 */
import {SharedTestFixture} from './shared-test.fixture';
import {TokenFixture} from './token.fixture';
import {ClientEntityClient} from './api-client/client-entity-client';
import {AdminTenantClient} from './api-client/admin-tenant-client';
import {HelperFixture} from './helper.fixture';
import {expect2xx} from './api-client/client';

const CLIENT_ID = 'offline-access-test.local';
const EMAIL = 'admin@offline-access-test.local';
const PASSWORD = 'admin9000';

describe('Offline Access & Refresh Token Gating Integration Tests', () => {
    let app: SharedTestFixture;
    let clientApi: ClientEntityClient;
    let adminTenantApi: AdminTenantClient;
    let helper: HelperFixture;
    let accessToken: string;
    let testTenantId: string;

    beforeAll(async () => {
        app = new SharedTestFixture();
        const tokenFixture = new TokenFixture(app);

        // Get super-admin access token using the default first-party client
        const tokenResponse = await tokenFixture.fetchAccessToken(
            'admin@auth.server.com',
            'admin9000',
            'auth.server.com',
        );
        accessToken = tokenResponse.accessToken;

        clientApi = new ClientEntityClient(app, accessToken);
        adminTenantApi = new AdminTenantClient(app, accessToken);
        helper = new HelperFixture(app, accessToken);

        // Get the seeded test tenant
        const tenants = await adminTenantApi.getAllTenants();
        const testTenant = tenants.find((t: any) => t.domain === CLIENT_ID);
        expect(testTenant).toBeDefined();
        testTenantId = testTenant.id;

        // Enable password grant on the default client for the test tenant
        await helper.enablePasswordGrant(testTenantId, CLIENT_ID);
    }, 60_000);

    afterAll(async () => {
        await app.close();
    });

    // ─── Helper Functions ──────────────────────────────────────────────────────

    /**
     * Send a password grant request to the token endpoint.
     */
    function passwordGrantRequest(body: {
        client_id: string;
        username?: string;
        password?: string;
        scope?: string;
    }) {
        return app.getHttpServer()
            .post('/api/oauth/token')
            .send({
                grant_type: 'password',
                username: EMAIL,
                password: PASSWORD,
                ...body,
            })
            .set('Accept', 'application/json');
    }

    /**
     * Send a refresh token grant request to the token endpoint.
     */
    function refreshTokenGrantRequest(body: {
        client_id: string;
        refresh_token: string;
        scope?: string;
    }) {
        return app.getHttpServer()
            .post('/api/oauth/token')
            .send({
                grant_type: 'refresh_token',
                ...body,
            })
            .set('Accept', 'application/json');
    }

    /**
     * Send a client credentials grant request to the token endpoint.
     */
    async function clientCredentialsGrantRequest(clientId: string, clientSecret: string) {
        return app.getHttpServer()
            .post('/api/oauth/token')
            .send({
                grant_type: 'client_credentials',
                client_id: clientId,
                client_secret: clientSecret,
            })
            .set('Accept', 'application/json');
    }

    /**
     * Get the default client for the test tenant.
     */
    async function getDefaultClient() {
        const tenantClients = await adminTenantApi.getTenantClients(testTenantId);
        const defaultClient = tenantClients.find((c: any) => c.alias === CLIENT_ID);
        expect(defaultClient).toBeDefined();
        return defaultClient;
    }

    // ─── Sub-task 7.3: Discovery document includes offline_access in scopes_supported ───

    describe('Req 3.1, 3.2: Discovery document includes offline_access', () => {
        it('should include offline_access in scopes_supported alongside openid, profile, email', async () => {
            const res = await app.getHttpServer()
                .get(`/${CLIENT_ID}/.well-known/openid-configuration`)
                .set('Accept', 'application/json');

            expect(res.status).toEqual(200);
            expect(res.body.scopes_supported).toBeDefined();
            expect(res.body.scopes_supported).toContain('openid');
            expect(res.body.scopes_supported).toContain('profile');
            expect(res.body.scopes_supported).toContain('email');
            expect(res.body.scopes_supported).toContain('offline_access');
        });
    });

    // ─── Sub-task 7.4: Refresh token issued when offline_access is in granted scopes ───

    describe('Req 1.1, 6.1: Refresh token issued when offline_access is in granted scopes', () => {
        let testClient: any;
        let clientId: string;

        beforeAll(async () => {
            // Create a client with offline_access in allowedScopes and allowRefreshToken: false
            testClient = await clientApi.createClient(testTenantId, 'Offline Access Scope Client', {
                redirectUris: ['https://offline-test.example.com/callback'],
                allowedScopes: 'openid profile email offline_access',
                isPublic: true,
                allowPasswordGrant: true,
                allowRefreshToken: false,
            });
            clientId = testClient.client.clientId;
        });

        afterAll(async () => {
            if (clientId) {
                await clientApi.deleteClient(clientId).catch(() => {});
            }
        });

        it('should issue refresh_token when offline_access is requested and in allowedScopes', async () => {
            const response = await passwordGrantRequest({
                client_id: clientId,
                scope: 'openid offline_access',
            });

            expect(response.status).toEqual(200);
            expect(response.body.access_token).toBeDefined();
            expect(response.body.refresh_token).toBeDefined();
            expect(response.body.token_type).toEqual('Bearer');
            expect(response.body.scope).toBeDefined();
            expect(response.body.scope).toContain('offline_access');
        });
    });

    // ─── Sub-task 7.5: Refresh token omitted when offline_access not requested and allowRefreshToken is false ───

    describe('Req 1.2, 2.2: Refresh token omitted when offline_access not requested and allowRefreshToken is false', () => {
        let testClient: any;
        let clientId: string;

        beforeAll(async () => {
            // Create a client without offline_access in allowedScopes and allowRefreshToken: false
            testClient = await clientApi.createClient(testTenantId, 'No Refresh Token Client', {
                redirectUris: ['https://no-refresh-test.example.com/callback'],
                allowedScopes: 'openid profile email',
                isPublic: true,
                allowPasswordGrant: true,
                allowRefreshToken: false,
            });
            clientId = testClient.client.clientId;
        });

        afterAll(async () => {
            if (clientId) {
                await clientApi.deleteClient(clientId).catch(() => {});
            }
        });

        it('should NOT issue refresh_token when offline_access is not requested and allowRefreshToken is false', async () => {
            const response = await passwordGrantRequest({
                client_id: clientId,
                scope: 'openid profile',
            });

            expect(response.status).toEqual(200);
            expect(response.body.access_token).toBeDefined();
            expect(response.body.token_type).toEqual('Bearer');
            expect(response.body.refresh_token).toBeUndefined();
        });
    });

    // ─── Sub-task 7.6: Refresh token issued via allowRefreshToken client override ───

    describe('Req 2.1: Refresh token issued via allowRefreshToken client override without offline_access', () => {
        let testClient: any;
        let clientId: string;

        beforeAll(async () => {
            // Create a client without offline_access in allowedScopes but allowRefreshToken: true
            testClient = await clientApi.createClient(testTenantId, 'Allow Refresh Token Override Client', {
                redirectUris: ['https://override-test.example.com/callback'],
                allowedScopes: 'openid profile email',
                isPublic: true,
                allowPasswordGrant: true,
                allowRefreshToken: true,
            });
            clientId = testClient.client.clientId;
        });

        afterAll(async () => {
            if (clientId) {
                await clientApi.deleteClient(clientId).catch(() => {});
            }
        });

        it('should issue refresh_token when allowRefreshToken is true even without offline_access', async () => {
            const response = await passwordGrantRequest({
                client_id: clientId,
                scope: 'openid profile',
            });

            expect(response.status).toEqual(200);
            expect(response.body.access_token).toBeDefined();
            expect(response.body.refresh_token).toBeDefined();
            expect(response.body.token_type).toEqual('Bearer');
            // offline_access was not requested, so it should not be in scope
            expect(response.body.scope).not.toContain('offline_access');
        });
    });

    // ─── Sub-task 7.7: offline_access excluded from access token JWT scope claim ───

    describe('Req 7.1, 7.2: offline_access excluded from access token JWT scope claim', () => {
        let testClient: any;
        let clientId: string;

        beforeAll(async () => {
            // Create a client with offline_access in allowedScopes
            testClient = await clientApi.createClient(testTenantId, 'JWT Scope Filter Client', {
                redirectUris: ['https://jwt-scope-test.example.com/callback'],
                allowedScopes: 'openid profile email offline_access',
                isPublic: true,
                allowPasswordGrant: true,
                allowRefreshToken: false,
            });
            clientId = testClient.client.clientId;
        });

        afterAll(async () => {
            if (clientId) {
                await clientApi.deleteClient(clientId).catch(() => {});
            }
        });

        it('should exclude offline_access from JWT scope claim but include in Token_Response scope', async () => {
            const response = await passwordGrantRequest({
                client_id: clientId,
                scope: 'openid offline_access',
            });

            expect(response.status).toEqual(200);
            expect(response.body.access_token).toBeDefined();

            // Decode the access token JWT
            const decoded = app.jwtService().decode(response.body.access_token, {json: true}) as any;
            expect(decoded).toBeDefined();
            expect(decoded.scope).toBeDefined();

            // JWT scope claim should NOT contain offline_access
            expect(decoded.scope).not.toContain('offline_access');

            // Token_Response scope field SHOULD contain offline_access
            expect(response.body.scope).toBeDefined();
            expect(response.body.scope).toContain('offline_access');
        });
    });

    // ─── Sub-task 7.8: offline_access preserved in refresh token record scope ───

    describe('Req 6.1, 6.2, 7.3: offline_access preserved in refresh token record scope', () => {
        let testClient: any;
        let clientId: string;

        beforeAll(async () => {
            // Create a client with offline_access in allowedScopes
            testClient = await clientApi.createClient(testTenantId, 'Refresh Token Scope Client', {
                redirectUris: ['https://refresh-scope-test.example.com/callback'],
                allowedScopes: 'openid profile email offline_access',
                isPublic: true,
                allowPasswordGrant: true,
                allowRefreshToken: false,
            });
            clientId = testClient.client.clientId;
        });

        afterAll(async () => {
            if (clientId) {
                await clientApi.deleteClient(clientId).catch(() => {});
            }
        });

        it('should preserve offline_access in scope after refresh token rotation', async () => {
            // Step 1: Obtain token with offline_access scope
            const initialResponse = await passwordGrantRequest({
                client_id: clientId,
                scope: 'openid offline_access',
            });

            expect(initialResponse.status).toEqual(200);
            expect(initialResponse.body.refresh_token).toBeDefined();
            expect(initialResponse.body.scope).toContain('offline_access');

            const refreshToken = initialResponse.body.refresh_token;

            // Step 2: Use the refresh token to rotate
            const refreshResponse = await refreshTokenGrantRequest({
                client_id: clientId,
                refresh_token: refreshToken,
            });

            expect(refreshResponse.status).toEqual(200);
            expect(refreshResponse.body.access_token).toBeDefined();
            expect(refreshResponse.body.refresh_token).toBeDefined();

            // The new token response should still include offline_access in scope
            expect(refreshResponse.body.scope).toContain('offline_access');
        });
    });

    // ─── Sub-task 7.9: client_credentials grant never includes refresh token ───

    describe('Req 1.3: client_credentials grant never includes refresh token', () => {
        it('should NOT issue refresh_token for client_credentials grant regardless of scope or client config', async () => {
            // Create a confidential client for client_credentials grant
            const tokenFixture = new TokenFixture(app);
            const credentials = await tokenFixture.createConfidentialClient(accessToken, testTenantId);

            // Request token with client_credentials grant using confidential client credentials
            const response = await clientCredentialsGrantRequest(credentials.clientId, credentials.clientSecret);

            expect(response.status).toEqual(200);
            expect(response.body.access_token).toBeDefined();
            expect(response.body.token_type).toEqual('Bearer');
            // refresh_token should NOT be present for client_credentials
            expect(response.body.refresh_token).toBeUndefined();
        });
    });

    // ─── Sub-task 7.10: Scope resolution excludes offline_access when not in client allowedScopes ───

    describe('Req 4.2: Scope resolution excludes offline_access when not in client allowedScopes', () => {
        let testClient: any;
        let clientId: string;

        beforeAll(async () => {
            // Create a client WITHOUT offline_access in allowedScopes
            testClient = await clientApi.createClient(testTenantId, 'Scope Resolution Client', {
                redirectUris: ['https://scope-resolution-test.example.com/callback'],
                allowedScopes: 'openid profile email',
                isPublic: true,
                allowPasswordGrant: true,
                allowRefreshToken: false,
            });
            clientId = testClient.client.clientId;
        });

        afterAll(async () => {
            if (clientId) {
                await clientApi.deleteClient(clientId).catch(() => {});
            }
        });

        it('should exclude offline_access from response scope when not in client allowedScopes', async () => {
            // Request token with offline_access in scope, but client does not allow it
            const response = await passwordGrantRequest({
                client_id: clientId,
                scope: 'openid offline_access',
            });

            expect(response.status).toEqual(200);
            expect(response.body.access_token).toBeDefined();

            // The response scope should NOT contain offline_access (two-way intersection)
            expect(response.body.scope).toBeDefined();
            expect(response.body.scope).not.toContain('offline_access');

            // Should still have the other requested scopes that are allowed
            expect(response.body.scope).toContain('openid');
        });
    });
});
