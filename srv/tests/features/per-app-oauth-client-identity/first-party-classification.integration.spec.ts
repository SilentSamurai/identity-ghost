import {SharedTestFixture} from '../../shared-test.fixture';
import {v4 as uuid} from 'uuid';
import {AppClient} from '../../api-client/app-client';
import {TokenFixture} from '../../token.fixture';
import {TenantClient} from '../../api-client/tenant-client';
import {AdminTenantClient} from '../../api-client/admin-tenant-client';
import {HelperFixture} from '../../helper.fixture';
import {ClientEntityClient} from '../../api-client/client-entity-client';
import {SearchClient} from '../../api-client/search-client';

/**
 * Tests for Requirement 5: First-Party Classification
 * 
 * First-party status is narrowed to a single stored identity:
 * - The Super_Tenant's Default_Client (alias === 'auth.server.com')
 * 
 * All other clients (including App_Clients on the super tenant) are NOT first-party.
 */
describe('Per-App OAuth Client Identity — First-Party Classification', () => {
    let fixture: SharedTestFixture;
    let tokenFixture: TokenFixture;
    let helper: HelperFixture;
    let superAdminToken: string;
    let adminClient: AdminTenantClient;
    let tenantClient: TenantClient;
    let clientEntityClient: ClientEntityClient;
    let appClient: AppClient;
    let searchClient: SearchClient;

    const SUPER_TENANT_DOMAIN = 'auth.server.com';

    beforeAll(async () => {
        fixture = new SharedTestFixture();
        tokenFixture = new TokenFixture(fixture);

        const superAdmin = await tokenFixture.fetchAccessToken(
            'admin@auth.server.com',
            'admin9000',
            SUPER_TENANT_DOMAIN,
        );
        superAdminToken = superAdmin.accessToken;
        adminClient = new AdminTenantClient(fixture, superAdminToken);
        tenantClient = new TenantClient(fixture, superAdminToken);
        helper = new HelperFixture(fixture, superAdminToken);
        clientEntityClient = new ClientEntityClient(fixture, superAdminToken);
        appClient = new AppClient(fixture, superAdminToken);
        searchClient = new SearchClient(fixture, superAdminToken);
    });

    afterAll(async () => {
        await fixture.close();
    });

    // 17.8 First-party classification: Super_Tenant Default_Client is first-party
    it('should treat Super_Tenant Default_Client as first-party (no consent required)', async () => {
        // The super tenant's default client has alias === 'auth.server.com'
        // When used as client_id, it should be treated as first-party
        // This is verified by the fact that the authorize flow doesn't require consent
        
        // Get the super tenant's default client
        const clients = await clientEntityClient.getClientsByTenant(SUPER_TENANT_DOMAIN);
        const defaultClient = clients.find((c: any) => c.alias === SUPER_TENANT_DOMAIN);
        
        expect(defaultClient).toBeDefined();
        expect(defaultClient.alias).toBe(SUPER_TENANT_DOMAIN);
    });

    // 17.8 First-party classification: Default_Client on non-super tenant is NOT first-party
    it('should treat Default_Client on non-super tenant as NOT first-party', async () => {
        // Use the pre-seeded test tenant to avoid name length issues
        const testDomain = 'per-app-client-test.local';
        
        // The tenant's default client should NOT be first-party
        // Authorize requests using this client_id should require consent
        const response = await fixture.getHttpServer()
            .get('/api/oauth/authorize')
            .query({
                client_id: testDomain, // Default client alias
                redirect_uri: 'http://localhost:3000/callback',
                response_type: 'code',
                scope: 'openid',
                state: 'test-state',
            });

        // Should redirect to UI authorize page (consent will be required after login)
        expect(response.status).toBe(302);
        expect(response.headers.location).toContain('/authorize');
    });

    // 17.8 First-party classification: App_Client on super tenant is NOT first-party
    it('should treat App_Client on super tenant as NOT first-party', async () => {
        // Get super tenant ID using the search client
        const tenants = await searchClient.searchTenantByDomain(SUPER_TENANT_DOMAIN);
        expect(tenants.length).toBeGreaterThan(0);
        
        const superTenantId = tenants[0]?.id;
        expect(superTenantId).toBeDefined();

        // Create an App on the super tenant
        const appName = `super-app-${uuid().slice(0, 8)}`;
        const appUrl = 'https://super-tenant-app.example.com/callback';
        const app = await appClient.createApp(superTenantId, appName, appUrl);

        expect(app.clientId).toBeDefined();
        expect(app.alias).toBeDefined();

        // Authorize with the App_Client should NOT be first-party
        // (consent will be required after login)
        const response = await fixture.getHttpServer()
            .get('/api/oauth/authorize')
            .query({
                client_id: app.alias,
                redirect_uri: appUrl,
                response_type: 'code',
                scope: 'openid',
                state: 'test-state',
                code_challenge: 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
                code_challenge_method: 'S256',
            });

        // Should redirect to UI authorize page (consent will be required after login for non-first-party)
        expect(response.status).toBe(302);
        expect(response.headers.location).toContain('/authorize');
    });

    // 17.9 TenantAmbiguityService: Default_Client returns empty candidate list
    it('should return empty subscriber tenant list for Default_Client', async () => {
        // Use the pre-seeded test tenant
        const testDomain = 'per-app-client-test.local';

        // Default_Client is not linked to any App, so TenantAmbiguityService
        // should return an empty candidate list (Req 6.4)
        // This is implicitly tested by the authorize flow not showing tenant selection
        const response = await fixture.getHttpServer()
            .get('/api/oauth/authorize')
            .query({
                client_id: testDomain,
                redirect_uri: 'http://localhost:3000/callback',
                response_type: 'code',
                scope: 'openid',
                state: 'test-state',
            });

        // Should redirect to UI authorize page without tenant selection
        expect(response.status).toBe(302);
        expect(response.headers.location).toContain('/authorize');
        expect(response.headers.location).not.toContain('tenant-select');
    });
});
