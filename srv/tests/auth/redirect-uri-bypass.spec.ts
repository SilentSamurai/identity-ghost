import {SharedTestFixture} from '../shared-test.fixture';
import {TokenFixture} from '../token.fixture';
import {ClientEntityClient} from '../api-client/client-entity-client';
import {AdminTenantClient} from '../api-client/admin-tenant-client';

/**
 * Regression test for GitHub issue #93:
 * Legacy tenant-domain client_id must NOT bypass redirect URI validation.
 *
 * When a client_id is a tenant domain (alias) rather than a UUID, the server
 * resolves it to the default Client entity via findByClientIdOrAlias(). If that
 * client has registered redirect URIs, validation must still be enforced.
 *
 * Redirect URI validation now happens at GET /api/oauth/authorize.
 */
describe('Issue #93: domain-based client_id must not bypass redirect URI validation', () => {
    let app: SharedTestFixture;
    let tokenFixture: TokenFixture;
    let clientApi: ClientEntityClient;
    let accessToken: string;

    const domain = 'redirect-uri-bypass-test.local';
    const email = `admin@${domain}`;
    const password = 'admin9000';
    const REGISTERED_URI = 'https://legit-app.example.com/callback';

    beforeAll(async () => {
        app = new SharedTestFixture();
        tokenFixture = new TokenFixture(app);

        // Get super-admin token to configure the test tenant's client
        const superAdmin = await tokenFixture.fetchAccessToken(
            'admin@auth.server.com', 'admin9000', 'auth.server.com',
        );
        accessToken = superAdmin.accessToken;

        clientApi = new ClientEntityClient(app, accessToken);
        const adminTenantClient = new AdminTenantClient(app, accessToken);

        // Find the seeded tenant and its default client
        const allTenants = await adminTenantClient.getAllTenants();
        const tenant = allTenants.find((t: any) => t.domain === domain);

        // Register a specific redirect URI on the default client and enable password grant
        const tenantClients = await adminTenantClient.getTenantClients(tenant.id);
        const defaultClient = tenantClients.find((c: any) => c.alias === domain);
        await clientApi.updateClient(defaultClient.clientId, {
            redirectUris: [REGISTERED_URI],
            allowPasswordGrant: true,
        });
    });

    afterAll(async () => {
        await app.close();
    });

    it('should reject an unregistered redirect_uri when client_id is a domain alias (at authorize endpoint)', async () => {
        // Login first to get a session cookie
        const sidCookie = await tokenFixture.loginForCookie(email, password, domain);

        // Now try to authorize with an unregistered redirect_uri
        const response = await app.getHttpServer()
            .get('/api/oauth/authorize')
            .query({
                response_type: 'code',
                client_id: domain, // alias, not UUID
                redirect_uri: 'https://evil.example.com/steal',
                scope: 'openid profile email',
                state: 'test-state',
                code_challenge: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopq',
                code_challenge_method: 'plain',
                session_confirmed: 'true',
            })
            .set('Cookie', sidCookie)
            .redirects(0);

        expect(response.status).toEqual(400);
        expect(response.body.error).toEqual('invalid_request');
        expect(response.body.error_description).toContain('redirect_uri');
    });

    it('should accept a registered redirect_uri when client_id is a domain alias', async () => {
        const sidCookie = await tokenFixture.loginForCookie(email, password, domain);

        const response = await app.getHttpServer()
            .get('/api/oauth/authorize')
            .query({
                response_type: 'code',
                client_id: domain, // alias, not UUID
                redirect_uri: REGISTERED_URI,
                scope: 'openid profile email',
                state: 'test-state',
                code_challenge: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopq',
                code_challenge_method: 'plain',
                session_confirmed: 'true',
            })
            .set('Cookie', sidCookie)
            .redirects(0);

        expect(response.status).toEqual(302);
        const location = new URL(response.headers.location, 'http://localhost');
        // Should redirect to the registered URI with a code
        const code = location.searchParams.get('code');
        expect(code).toBeDefined();
    });
});
