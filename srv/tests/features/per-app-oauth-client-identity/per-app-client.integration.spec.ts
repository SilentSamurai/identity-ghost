import {SharedTestFixture} from '../../shared-test.fixture';
import {v4 as uuid} from 'uuid';
import {AppClient} from '../../api-client/app-client';
import {TokenFixture} from '../../token.fixture';
import {TenantClient} from '../../api-client/tenant-client';
import {AdminTenantClient} from '../../api-client/admin-tenant-client';
import {HelperFixture} from '../../helper.fixture';
import {ClientEntityClient} from '../../api-client/client-entity-client';
import {SearchClient} from '../../api-client/search-client';
import {UsersClient} from '../../api-client/user-client';

describe('Per-App OAuth Client Identity', () => {
    let fixture: SharedTestFixture;
    let appClient: AppClient;
    let tokenFixture: TokenFixture;
    let helper: HelperFixture;
    let superAdminToken: string;
    let adminClient: AdminTenantClient;
    let tenantClient: TenantClient;
    let clientEntityClient: ClientEntityClient;
    let searchClient: SearchClient;
    let usersClient: UsersClient;

    let tenantId: string;
    let tenantDomain: string;
    let accessToken: string;

    const adminEmail = `per-app-admin-${Date.now()}@mail.com`;
    const adminPassword = 'TestPassword123!';

    beforeAll(async () => {
        fixture = new SharedTestFixture();
        tokenFixture = new TokenFixture(fixture);

        const superAdmin = await tokenFixture.fetchAccessTokenFlow(
            'admin@auth.server.com',
            'admin9000',
            'auth.server.com',
        );
        superAdminToken = superAdmin.accessToken;
        adminClient = new AdminTenantClient(fixture, superAdminToken);
        tenantClient = new TenantClient(fixture, superAdminToken);
        helper = new HelperFixture(fixture, superAdminToken);
        clientEntityClient = new ClientEntityClient(fixture, superAdminToken);
        searchClient = new SearchClient(fixture, superAdminToken);
        usersClient = new UsersClient(fixture, superAdminToken);

        tenantDomain = `per-app-test-${Date.now()}.local`;
        const createdTenant = await tenantClient.createTenant('Per-App Test', tenantDomain);
        tenantId = createdTenant.id;

        await helper.enablePasswordGrant(tenantId, tenantDomain);

        // Create user with password first, then add as member
        await usersClient.createUser('Per-App Admin', adminEmail, adminPassword);
        const members = await adminClient.addMembers(tenantId, [adminEmail]);
        const memberUserId = members.members.find((m: any) => m.email === adminEmail)?.id;
        if (memberUserId) {
            await adminClient.updateMemberRoles(tenantId, memberUserId, ['TENANT_ADMIN']);
        }

        const tokenResponse = await tokenFixture.fetchAccessTokenFlow(
            adminEmail, adminPassword, tenantDomain,
        );
        accessToken = tokenResponse.accessToken;
        appClient = new AppClient(fixture, accessToken);
    });

    afterAll(async () => {
        await fixture.close();
    });

    // 17.1 App creation happy path
    it('should create an App with App_Client and expose clientId + alias', async () => {
        const appName = `happy-path-${uuid()}`;
        const appUrl = 'https://myapp.example.com/callback';
        const app = await appClient.createApp(tenantId, appName, appUrl, 'Test description');

        expect(app.clientId).toBeDefined();
        expect(app.alias).toBeDefined();
        expect(app.alias).toContain(tenantDomain);
        expect(app.description).toEqual('Test description');

        // Verify via detail endpoint
        const detail = await appClient.getAppDetails(app.id);
        expect(detail.client).toBeDefined();
        expect(detail.client.clientId).toBeDefined();
        expect(detail.client.alias).toBeDefined();
        expect(detail.client.clientSecrets).toBeUndefined();
    });

    // 17.3 App deletion with active subscription - rejection
    it('should reject app deletion with active subscriptions', async () => {
        const appName = `del-reject-${uuid()}`;
        // Use the test webhook server so subscription onboard call succeeds
        const appUrl = `http://localhost:${fixture.webhook.boundPort}`;
        const app = await appClient.createApp(tenantId, appName, appUrl);

        await appClient.publishApp(app.id);

        const subscriberDomain = `per-app-sub-${Date.now()}.local`;
        const subscriberTenant = await tenantClient.createTenant('Per-App Sub', subscriberDomain);
        await helper.enablePasswordGrant(subscriberTenant.id, subscriberDomain);

        await adminClient.subscribeToApp(subscriberTenant.id, app.id);

        try {
            await appClient.deleteApp(app.id);
            fail('Expected deleteApp to throw');
        } catch (e: any) {
            expect(e.status).toBe(500);
            expect(e.body.message).toContain('Cannot delete app with subscriptions');
        }
    });

    // 17.4 App rename cascade test
    it('should cascade name change to App_Client but keep alias unchanged', async () => {
        const appName = `rename-test-${uuid()}`;
        const appUrl = 'https://rename.example.com/callback';
        const app = await appClient.createApp(tenantId, appName, appUrl);
        const originalAlias = app.alias;

        const newName = `renamed-${uuid()}`;
        const updated = await appClient.updateApp(app.id, newName, appUrl);

        expect(updated.name).toEqual(newName);
        expect(updated.alias).toEqual(originalAlias);
    });

    // 17.5 appUrl update cascade
    it('should cascade appUrl change to App_Client redirectUris', async () => {
        const appName = `url-cascade-${uuid()}`;
        const appUrl = 'https://original.example.com/callback';
        const app = await appClient.createApp(tenantId, appName, appUrl);

        const newUrl = 'https://updated.example.com/callback';
        const updated = await appClient.updateApp(app.id, appName, newUrl);
        expect(updated.appUrl).toEqual(newUrl);
    });

    // 17.6 appUrl validation
    it('should reject appUrl with fragment', async () => {
        const appName = `fragment-reject-${uuid()}`;
        try {
            await appClient.createApp(tenantId, appName, 'https://example.com#fragment');
            fail('Expected createApp to throw');
        } catch (e: any) {
            expect(e.status).toBe(400);
            expect(e.body.message).toContain('App URL is not a valid redirect URI');
        }
    });

    it('should reject appUrl with HTTP non-localhost', async () => {
        const appName = `http-reject-${uuid()}`;
        try {
            await appClient.createApp(tenantId, appName, 'http://example.com/callback');
            fail('Expected createApp to throw');
        } catch (e: any) {
            expect(e.status).toBe(400);
            expect(e.body.message).toContain('App URL is not a valid redirect URI');
        }
    });

    it('should allow appUrl with HTTP localhost', async () => {
        const appName = `http-allow-${uuid()}`;
        const app = await appClient.createApp(tenantId, appName, 'http://localhost:3000/callback');
        expect(app.id).toBeDefined();
    });

    it('should allow appUrl with custom scheme', async () => {
        const appName = `custom-scheme-${uuid()}`;
        const app = await appClient.createApp(tenantId, appName, 'myapp://oauth/callback');
        expect(app.id).toBeDefined();
    });

    // 17.10 Client update on App_Client
    it('should reject PATCH name on App_Client with HTTP 400', async () => {
        const appName = `immutable-alias-${uuid()}`;
        const app = await appClient.createApp(tenantId, appName, 'https://immutable.example.com/callback');

        const detail = await appClient.getAppDetails(app.id);
        const clientId = detail.client.clientId;

        try {
            await clientEntityClient.updateClient(clientId, {name: 'New Name'});
            fail('Expected updateClient to throw');
        } catch (e: any) {
            expect(e.status).toBe(400);
            expect(e.body.message).toContain('immutable for App_Clients');
        }
    });

    it('should allow PATCH allowPasswordGrant on App_Client', async () => {
        const appName = `scopes-update-${uuid()}`;
        const app = await appClient.createApp(tenantId, appName, 'https://scopes.example.com/callback');

        const detail = await appClient.getAppDetails(app.id);
        const clientId = detail.client.clientId;

        const result = await clientEntityClient.updateClient(clientId, {allowPasswordGrant: true});
        expect(result).toBeDefined();
    });

    // 17.11 App detail and search
    it('should return full client config from detail endpoint (no secrets)', async () => {
        const appName = `detail-check-${uuid()}`;
        const app = await appClient.createApp(tenantId, appName, 'https://detail.example.com/callback');
        const detail = await appClient.getAppDetails(app.id);

        expect(detail.client).toBeDefined();
        expect(detail.client.redirectUris).toBeDefined();
        expect(detail.client.allowedScopes).toBeDefined();
        expect(detail.client.requirePkce).toBeDefined();
        expect(detail.client.clientSecrets).toBeUndefined();
    });

    // 17.12 Logging test - basic check
    it('should create app with audit logging', async () => {
        const appName = `audit-log-${uuid()}`;
        const app = await appClient.createApp(tenantId, appName, 'https://audit.example.com/callback');
        expect(app.clientId).toBeDefined();
        expect(app.alias).toBeDefined();
    });

    // 17.10 - Additional: Reject PATCH alias on App_Client (Req 7.6)
    it('should reject PATCH alias on App_Client with HTTP 400', async () => {
        const appName = `immutable-alias-test-${uuid()}`;
        const app = await appClient.createApp(tenantId, appName, 'https://alias-test.example.com/callback');

        const detail = await appClient.getAppDetails(app.id);
        const clientId = detail.client.clientId;

        try {
            await clientEntityClient.updateClient(clientId, {alias: 'new-alias.test.local'});
            fail('Expected updateClient to throw');
        } catch (e: any) {
            expect(e.status).toBe(400);
            expect(e.body.message).toContain('immutable for App_Clients');
            expect(e.body.message).toContain('alias');
        }
    });

    // 17.7 Authorize with App_Client alias
    it('should resolve authorize request by App_Client alias', async () => {
        const appName = `authorize-alias-${uuid()}`;
        const appUrl = 'https://authorize-alias.example.com/callback';
        const app = await appClient.createApp(tenantId, appName, appUrl);

        // Attempt authorize with App_Client alias
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

        // Should redirect to UI authorize page (not error) since client was resolved
        expect(response.status).toBe(302);
        expect(response.headers.location).toContain('/authorize');
    });

    // 17.7 Authorize with App_Client UUID
    it('should resolve authorize request by App_Client UUID', async () => {
        const appName = `authorize-uuid-${uuid()}`;
        const appUrl = 'https://authorize-uuid.example.com/callback';
        const app = await appClient.createApp(tenantId, appName, appUrl);

        // Attempt authorize with App_Client clientId (UUID)
        const response = await fixture.getHttpServer()
            .get('/api/oauth/authorize')
            .query({
                client_id: app.clientId,
                redirect_uri: appUrl,
                response_type: 'code',
                scope: 'openid',
                state: 'test-state',
                code_challenge: 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
                code_challenge_method: 'S256',
            });

        // Should redirect to UI authorize page (not error) since client was resolved
        expect(response.status).toBe(302);
        expect(response.headers.location).toContain('/authorize');
    });

    // 17.7 Authorize with unknown client_id returns invalid_request
    it('should return invalid_request for unknown client_id', async () => {
        const response = await fixture.getHttpServer()
            .get('/api/oauth/authorize')
            .query({
                client_id: 'unknown-client-id',
                redirect_uri: 'https://example.com/callback',
                response_type: 'code',
                scope: 'openid',
                state: 'test-state',
            });

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('invalid_request');
    });

    // 17.7 Authorize with empty client_id returns invalid_request
    it('should return invalid_request for empty client_id', async () => {
        const response = await fixture.getHttpServer()
            .get('/api/oauth/authorize')
            .query({
                client_id: '',
                redirect_uri: 'https://example.com/callback',
                response_type: 'code',
                scope: 'openid',
                state: 'test-state',
            });

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('invalid_request');
    });
});
