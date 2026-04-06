import {SharedTestFixture} from '../shared-test.fixture';
import {TokenFixture} from '../token.fixture';
import {ClientEntityClient} from '../api-client/client-entity-client';
import {TenantClient} from '../api-client/tenant-client';
import {CryptUtil} from '../../src/util/crypt.util';

/**
 * Integration test: S256 enforcement and downgrade prevention
 *
 * Validates that:
 * - Clients with require_pkce=true reject plain method
 * - Clients with require_pkce=true accept S256 method
 * - Clients with require_pkce=false accept plain method
 * - Clients that previously used S256 reject plain (downgrade prevention)
 * - Fresh clients with no history accept S256 and update pkceMethodUsed
 *
 * Validates: Requirements 4.1, 4.2, 4.3, 5.1, 5.2, 5.3
 */
describe('S256 enforcement and downgrade prevention', () => {
    let app: SharedTestFixture;
    let tokenFixture: TokenFixture;
    let clientApi: ClientEntityClient;
    let accessToken: string;
    let testTenantId: string;

    const adminEmail = 'admin@auth.server.com';
    const adminPassword = 'admin9000';

    // Valid PKCE verifier/challenge for plain method
    const plainVerifier = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopq';
    // For S256, compute the challenge from the verifier
    const s256Challenge = CryptUtil.generateCodeChallenge(plainVerifier, 'S256');

    beforeAll(async () => {
        app = new SharedTestFixture();
        tokenFixture = new TokenFixture(app);
        const response = await tokenFixture.fetchAccessToken(adminEmail, adminPassword, 'auth.server.com');
        accessToken = response.accessToken;
        clientApi = new ClientEntityClient(app, accessToken);

        // Create a tenant to own test clients
        const tenantClient = new TenantClient(app, accessToken);
        const tenant = await tenantClient.createTenant('pkce-s256-test', 'pkce-s256-test.com');
        testTenantId = tenant.id;
    });

    afterAll(async () => {
        await app.close();
    });

    /** Helper: attempt login with a given client_id and challenge method */
    async function loginWith(clientId: string, method: string, challenge: string) {
        return app.getHttpServer()
            .post('/api/oauth/login')
            .send({
                email: adminEmail,
                password: adminPassword,
                client_id: clientId,
                code_challenge: challenge,
                code_challenge_method: method,
            })
            .set('Accept', 'application/json');
    }

    it('rejects plain method when client has require_pkce=true', async () => {
        const created = await clientApi.createClient(testTenantId, 'PKCE Required Client', {
            requirePkce: true,
            isPublic: true,
        });
        const clientId = created.client.clientId;

        try {
            const response = await loginWith(clientId, 'plain', plainVerifier);
            expect(response.status).toEqual(400);
            expect(response.body.error).toEqual('invalid_request');
            expect(response.body.error_description).toContain('S256');
        } finally {
            await clientApi.deleteClient(clientId);
        }
    });

    it('accepts S256 method when client has require_pkce=true', async () => {
        const created = await clientApi.createClient(testTenantId, 'PKCE Required S256 Client', {
            requirePkce: true,
            isPublic: true,
        });
        const clientId = created.client.clientId;

        try {
            const response = await loginWith(clientId, 'S256', s256Challenge);
            expect(response.status).toEqual(201);
            expect(response.body.authentication_code).toBeDefined();
        } finally {
            await clientApi.deleteClient(clientId);
        }
    });

    it('accepts plain method when client has require_pkce=false', async () => {
        const created = await clientApi.createClient(testTenantId, 'PKCE Optional Client', {
            requirePkce: false,
            isPublic: true,
        });
        const clientId = created.client.clientId;

        try {
            const response = await loginWith(clientId, 'plain', plainVerifier);
            expect(response.status).toEqual(201);
            expect(response.body.authentication_code).toBeDefined();
        } finally {
            await clientApi.deleteClient(clientId);
        }
    });

    it('rejects plain method after client previously used S256 (downgrade prevention)', async () => {
        const created = await clientApi.createClient(testTenantId, 'Downgrade Test Client', {
            requirePkce: false,
            isPublic: true,
        });
        const clientId = created.client.clientId;

        try {
            // First login with S256 to set pkceMethodUsed
            const firstResponse = await loginWith(clientId, 'S256', s256Challenge);
            expect(firstResponse.status).toEqual(201);
            expect(firstResponse.body.authentication_code).toBeDefined();

            // Now attempt login with plain — should be rejected (downgrade)
            const secondResponse = await loginWith(clientId, 'plain', plainVerifier);
            expect(secondResponse.status).toEqual(400);
            expect(secondResponse.body.error).toEqual('invalid_request');
            expect(secondResponse.body.error_description).toContain('downgrade');
        } finally {
            await clientApi.deleteClient(clientId);
        }
    });

    it('accepts S256 for fresh client with no history and updates pkceMethodUsed', async () => {
        const created = await clientApi.createClient(testTenantId, 'Fresh S256 Client', {
            requirePkce: false,
            isPublic: true,
        });
        const clientId = created.client.clientId;

        try {
            // Verify fresh client has no pkceMethodUsed
            const beforeLogin = await clientApi.getClient(clientId);
            expect(beforeLogin.pkceMethodUsed).toBeNull();

            // Login with S256
            const response = await loginWith(clientId, 'S256', s256Challenge);
            expect(response.status).toEqual(201);
            expect(response.body.authentication_code).toBeDefined();

            // Verify pkceMethodUsed was updated
            const afterLogin = await clientApi.getClient(clientId);
            expect(afterLogin.pkceMethodUsed).toEqual('S256');
        } finally {
            await clientApi.deleteClient(clientId);
        }
    });

    it('accepts plain for fresh client with no history', async () => {
        const created = await clientApi.createClient(testTenantId, 'Fresh Plain Client', {
            requirePkce: false,
            isPublic: true,
        });
        const clientId = created.client.clientId;

        try {
            const response = await loginWith(clientId, 'plain', plainVerifier);
            expect(response.status).toEqual(201);
            expect(response.body.authentication_code).toBeDefined();
        } finally {
            await clientApi.deleteClient(clientId);
        }
    });
});
