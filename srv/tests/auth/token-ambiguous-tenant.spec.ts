/**
 * Tests tenant ambiguity resolution during token issuance for cross-tenant app subscriptions.
 *
 * Covers the password grant flow only — subscriber_tenant_hint is not supported
 * in the authorization code flow (not wired through the authorize endpoint).
 *
 *   - Password grant returns 400 when multiple subscription tenants are ambiguous
 *   - subscriber_tenant_hint resolves the ambiguity for password grant
 *   - Single subscription: no ambiguity, token issued immediately
 *   - Own tenant login: no ambiguity
 *   - No tenant membership: returns error
 *   - Full flow: hint → token → verify JWT tenant claims
 */
import {SharedTestFixture} from "../shared-test.fixture";
import {v4 as uuid} from 'uuid';
import {AppClient} from '../api-client/app-client';
import {SearchClient} from '../api-client/search-client';
import {TokenFixture} from '../token.fixture';
import {UsersClient} from '../api-client/user-client';
import {AdminTenantClient} from '../api-client/admin-tenant-client';
import {HelperFixture} from '../helper.fixture';

describe('Ambiguous Subscription Tenant Flow', () => {
    let app: SharedTestFixture;
    let appClient: AppClient;
    let searchClient: SearchClient;
    let tokenFixture: TokenFixture;
    let usersClient: UsersClient;
    let adminTenantClient: AdminTenantClient;
    let superAdminToken: string;

    beforeAll(async () => {
        app = new SharedTestFixture();
        tokenFixture = new TokenFixture(app);
        const superAdminTokenResponse = await tokenFixture.fetchAccessToken(
            'admin@auth.server.com',
            'admin9000',
            'auth.server.com'
        );
        superAdminToken = superAdminTokenResponse.accessToken;
        searchClient = new SearchClient(app, superAdminToken);
        appClient = new AppClient(app, superAdminToken);
        usersClient = new UsersClient(app, superAdminToken);
        adminTenantClient = new AdminTenantClient(app, superAdminToken);

        // Enable password grant on seeded tenants used by these tests
        const helper = new HelperFixture(app, superAdminToken);
        const shireTenant = await searchClient.findTenantBy({domain: 'shire.local'});
        await helper.enablePasswordGrant(shireTenant.id, 'shire.local');
    });

    afterAll(async () => {
        await app.close();
    });

    it('/POST Token (password grant) with ambiguous subscription tenant returns ambiguity error', async () => {
        const appOwnerTenant = await searchClient.findTenantBy({domain: 'shire.local'});
        const subscriber1 = await searchClient.findTenantBy({domain: 'rivendell.local'});
        const subscriber2 = await searchClient.findTenantBy({domain: 'bree.local'});
        expect(subscriber1).toBeDefined();
        expect(subscriber2).toBeDefined();
        expect(appOwnerTenant).toBeDefined();

        const createdApp = await appClient.createApp(appOwnerTenant.id, `ambiguous-app-${uuid()}`, `http://localhost:${app.webhook.boundPort}`, 'Ambiguous app for test');
        await appClient.publishApp(createdApp.id);

        const testUserEmail = `ambiguous-user-${uuid()}@test.com`;
        const testUserPassword = 'TestPassword123!';
        const createdUser = await usersClient.createUser('Ambiguous User', testUserEmail, testUserPassword);
        expect(createdUser).toBeDefined();

        await adminTenantClient.addMembers(subscriber1.id, [testUserEmail]);
        await adminTenantClient.addMembers(subscriber2.id, [testUserEmail]);
        await adminTenantClient.subscribeToApp(subscriber1.id, createdApp.id);
        await adminTenantClient.subscribeToApp(subscriber2.id, createdApp.id);

        try {
            await tokenFixture.fetchAccessToken(testUserEmail, testUserPassword, appOwnerTenant.domain);
            fail('Expected BadRequestException for ambiguous tenants');
        } catch (error) {
            expect(error.status).toBe(400);
        }
    });

    it('/POST Token (password grant) resolves ambiguous subscription tenant with subscriber_tenant_hint', async () => {
        const appOwnerTenant = await searchClient.findTenantBy({domain: 'shire.local'});
        const subscriber1 = await searchClient.findTenantBy({domain: 'rivendell.local'});
        const subscriber2 = await searchClient.findTenantBy({domain: 'bree.local'});
        expect(appOwnerTenant).toBeDefined();
        expect(subscriber1).toBeDefined();
        expect(subscriber2).toBeDefined();

        const createdApp = await appClient.createApp(appOwnerTenant.id, `ambiguous-app-${uuid()}`, `http://localhost:${app.webhook.boundPort}`, 'Ambiguous app for test');
        await appClient.publishApp(createdApp.id);

        const testUserEmail = `ambiguous-user-${uuid()}@test.com`;
        const testUserPassword = 'TestPassword123!';
        await usersClient.createUser('Ambiguous User', testUserEmail, testUserPassword);

        await adminTenantClient.addMembers(subscriber1.id, [testUserEmail]);
        await adminTenantClient.addMembers(subscriber2.id, [testUserEmail]);
        await adminTenantClient.subscribeToApp(subscriber1.id, createdApp.id);
        await adminTenantClient.subscribeToApp(subscriber2.id, createdApp.id);

        const response = await app.getHttpServer()
            .post('/api/oauth/token')
            .send({
                grant_type: 'password',
                username: testUserEmail,
                password: testUserPassword,
                client_id: appOwnerTenant.domain,
                subscriber_tenant_hint: subscriber1.domain,
            })
            .set('Accept', 'application/json');

        expect(response.status).toBe(200);
        expect(response.body.access_token).toBeDefined();
        expect(response.body.token_type).toBe('Bearer');
        expect(response.body.refresh_token).toBeDefined();
    });

    it('/POST token (password grant) returns ambiguity error when user has multiple subscriptions', async () => {
        const appOwnerTenant = await searchClient.findTenantBy({domain: 'shire.local'});
        const subscriber1 = await searchClient.findTenantBy({domain: 'rivendell.local'});
        const subscriber2 = await searchClient.findTenantBy({domain: 'bree.local'});
        expect(appOwnerTenant).toBeDefined();
        expect(subscriber1).toBeDefined();
        expect(subscriber2).toBeDefined();

        const createdApp = await appClient.createApp(appOwnerTenant.id, `ambiguous-app-${uuid()}`, `http://localhost:${app.webhook.boundPort}`, 'Ambiguous app for test');
        await appClient.publishApp(createdApp.id);

        const testUserEmail = `ambiguous-user-${uuid()}@test.com`;
        const testUserPassword = 'TestPassword123!';
        await usersClient.createUser('Ambiguous User', testUserEmail, testUserPassword);

        await adminTenantClient.addMembers(subscriber1.id, [testUserEmail]);
        await adminTenantClient.addMembers(subscriber2.id, [testUserEmail]);
        await adminTenantClient.subscribeToApp(subscriber1.id, createdApp.id);
        await adminTenantClient.subscribeToApp(subscriber2.id, createdApp.id);

        // Password grant without hint — should fail with ambiguity error
        const response = await app.getHttpServer()
            .post('/api/oauth/token')
            .send({
                grant_type: 'password',
                username: testUserEmail,
                password: testUserPassword,
                client_id: appOwnerTenant.domain,
            })
            .set('Accept', 'application/json');

        expect(response.status).toBe(400);
        expect(response.body.error).toBeDefined();
    });

    it('/POST token (password grant) succeeds when user has single subscription', async () => {
        const appOwnerTenant = await searchClient.findTenantBy({domain: 'shire.local'});
        const subscriber = await searchClient.findTenantBy({domain: 'rivendell.local'});
        expect(appOwnerTenant).toBeDefined();
        expect(subscriber).toBeDefined();

        const createdApp = await appClient.createApp(appOwnerTenant.id, `single-sub-app-${uuid()}`, `http://localhost:${app.webhook.boundPort}`, 'Single subscription app for test');
        await appClient.publishApp(createdApp.id);

        const testUserEmail = `single-sub-user-${uuid()}@test.com`;
        const testUserPassword = 'TestPassword123!';
        await usersClient.createUser('Single Sub User', testUserEmail, testUserPassword);

        await adminTenantClient.addMembers(subscriber.id, [testUserEmail]);
        await adminTenantClient.subscribeToApp(subscriber.id, createdApp.id);

        // Password grant — should succeed (no ambiguity)
        const response = await app.getHttpServer()
            .post('/api/oauth/token')
            .send({
                grant_type: 'password',
                username: testUserEmail,
                password: testUserPassword,
                client_id: appOwnerTenant.domain,
            })
            .set('Accept', 'application/json');

        expect(response.status).toBe(200);
        expect(response.body.access_token).toBeDefined();
    });

    it('/POST token (password grant) succeeds when user logs into own tenant', async () => {
        const appOwnerTenant = await searchClient.findTenantBy({domain: 'shire.local'});
        expect(appOwnerTenant).toBeDefined();

        const createdApp = await appClient.createApp(appOwnerTenant.id, `own-tenant-app-${uuid()}`, `http://localhost:${app.webhook.boundPort}`, 'App for own tenant test');
        await appClient.publishApp(createdApp.id);

        const testUserEmail = `own-tenant-user-${uuid()}@test.com`;
        const testUserPassword = 'TestPassword123!';
        await usersClient.createUser('Own Tenant User', testUserEmail, testUserPassword);

        await adminTenantClient.addMembers(appOwnerTenant.id, [testUserEmail]);

        // Password grant — should succeed (no ambiguity, user is in own tenant)
        const response = await app.getHttpServer()
            .post('/api/oauth/token')
            .send({
                grant_type: 'password',
                username: testUserEmail,
                password: testUserPassword,
                client_id: appOwnerTenant.domain,
            })
            .set('Accept', 'application/json');

        expect(response.status).toBe(200);
        expect(response.body.access_token).toBeDefined();
    });

    it('/POST token (password grant) returns error when user does not belong to any tenant', async () => {
        const appOwnerTenant = await searchClient.findTenantBy({domain: 'shire.local'});
        expect(appOwnerTenant).toBeDefined();

        const testUserEmail = `no-tenant-user-${uuid()}@test.com`;
        const testUserPassword = 'TestPassword123!';
        await usersClient.createUser('No Tenant User', testUserEmail, testUserPassword);

        // Password grant — should fail (user not in any tenant)
        const response = await app.getHttpServer()
            .post('/api/oauth/token')
            .send({
                grant_type: 'password',
                username: testUserEmail,
                password: testUserPassword,
                client_id: appOwnerTenant.domain,
            })
            .set('Accept', 'application/json');

        // User has no tenant membership — expect an error (400 or 403)
        expect(response.status).toBeGreaterThanOrEqual(400);
    });

    it('/POST token (password grant) with subscriber_tenant_hint resolves ambiguity and returns correct tenant claims', async () => {
        const appOwnerTenant = await searchClient.findTenantBy({domain: 'shire.local'});
        const subscriber1 = await searchClient.findTenantBy({domain: 'rivendell.local'});
        const subscriber2 = await searchClient.findTenantBy({domain: 'bree.local'});
        expect(subscriber1).toBeDefined();
        expect(subscriber2).toBeDefined();
        expect(appOwnerTenant).toBeDefined();

        const createdApp = await appClient.createApp(appOwnerTenant.id, `hint-test-app-${uuid()}`, `http://localhost:${app.webhook.boundPort}`, 'App for testing tenant hint');
        await appClient.publishApp(createdApp.id);

        const testUserEmail = `hint-test-user-${uuid()}@test.com`;
        const testUserPassword = 'TestPassword123!';
        await usersClient.createUser('Hint Test User', testUserEmail, testUserPassword);

        await adminTenantClient.addMembers(subscriber1.id, [testUserEmail]);
        await adminTenantClient.addMembers(subscriber2.id, [testUserEmail]);
        await adminTenantClient.subscribeToApp(subscriber1.id, createdApp.id);
        await adminTenantClient.subscribeToApp(subscriber2.id, createdApp.id);

        // Password grant without hint — should fail with ambiguity error
        const ambiguousResponse = await app.getHttpServer()
            .post('/api/oauth/token')
            .send({
                grant_type: 'password',
                username: testUserEmail,
                password: testUserPassword,
                client_id: appOwnerTenant.domain,
            })
            .set('Accept', 'application/json');
        expect(ambiguousResponse.status).toBe(400);

        const tokenResponse = await app.getHttpServer()
            .post('/api/oauth/token')
            .send({
                grant_type: 'password',
                username: testUserEmail,
                password: testUserPassword,
                client_id: appOwnerTenant.domain,
                subscriber_tenant_hint: subscriber1.domain,
            })
            .set('Accept', 'application/json');

        expect(tokenResponse.status).toBe(200);
        expect(tokenResponse.body.access_token).toBeDefined();
        expect(tokenResponse.body.refresh_token).toBeDefined();

        // Verify the token contains the correct tenant
        const decodedToken = app.jwtService().decode(tokenResponse.body.access_token, {json: true}) as any;
        expect(decodedToken.tenant.domain).toBe(appOwnerTenant.domain);
        expect(decodedToken.userTenant.domain).toBe(subscriber1.domain);
    });
});
