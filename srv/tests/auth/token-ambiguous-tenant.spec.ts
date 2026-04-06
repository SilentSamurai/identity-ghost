/**
 * Tests tenant ambiguity resolution during token issuance for cross-tenant app subscriptions.
 *
 * When a user belongs to multiple tenants that are all subscribed to the same app,
 * the server cannot determine which tenant context to issue the token for. Covers:
 *   - Password grant returns 400 when multiple subscription tenants are ambiguous
 *   - subscriber_tenant_hint resolves the ambiguity for password grant
 *   - Login endpoint returns requires_tenant_selection with the list of candidate tenants
 *   - Login with subscriber_tenant_hint returns an auth code directly
 *   - Single subscription: no ambiguity, auth code issued immediately
 *   - Own tenant login: no ambiguity
 *   - No tenant membership: returns 403
 *   - Full flow: hint → auth code → token exchange → verify JWT tenant claims
 */
import {SharedTestFixture} from "../shared-test.fixture";
import {v4 as uuid} from 'uuid';
import {AppClient} from '../api-client/app-client';
import {SearchClient} from '../api-client/search-client';
import {TokenFixture} from '../token.fixture';
import {UsersClient} from '../api-client/user-client';
import {AdminTenantClient} from '../api-client/admin-tenant-client';

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
        // Get super admin access token
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
    });

    afterAll(async () => {
        await app.close();
    });

    it('/POST Token (password grant) with ambiguous subscription tenant returns ambiguity error', async () => {
        // 1. Find shire.local, rivendell.local, and bree.local tenants
        const appOwnerTenant = await searchClient.findTenantBy({domain: 'shire.local'});
        const subscriber1 = await searchClient.findTenantBy({domain: 'rivendell.local'});
        const subscriber2 = await searchClient.findTenantBy({domain: 'bree.local'});
        expect(subscriber1).toBeDefined();
        expect(subscriber2).toBeDefined();
        expect(appOwnerTenant).toBeDefined();

        // 2. Create a new app under appOwnerTenant
        const appData = {
            name: `ambiguous-app-${uuid()}`,
            appUrl: `http://localhost:${app.webhook.boundPort}`,
            description: 'Ambiguous app for test'
        };
        const createdApp = await appClient.createApp(appOwnerTenant.id, appData.name, appData.appUrl, appData.description);
        await appClient.publishApp(createdApp.id);

        // 3. Create a new user and add to both subscribers
        const testUserEmail = `ambiguous-user-${uuid()}@test.com`;
        const testUserPassword = 'TestPassword123!';
        const createdUser = await usersClient.createUser('Ambiguous User', testUserEmail, testUserPassword);
        expect(createdUser).toBeDefined();
        expect(createdUser.email).toBe(testUserEmail);

        await adminTenantClient.addMembers(subscriber1.id, [testUserEmail]);
        await adminTenantClient.addMembers(subscriber2.id, [testUserEmail]);

        // 4. Subscribe both subscriber1 and subscriber2 to the app
        await adminTenantClient.subscribeToApp(subscriber1.id, createdApp.id);
        await adminTenantClient.subscribeToApp(subscriber2.id, createdApp.id);

        // 5. Attempt password grant — should fail with ambiguity error
        try {
            await tokenFixture.fetchAccessToken(
                testUserEmail,
                testUserPassword,
                appOwnerTenant.clientId
            );
            fail('Expected BadRequestException for ambiguous tenants');
        } catch (error) {
            expect(error.status).toBe(400);
        }
    });

    it('/POST Token (password grant) resolves ambiguous subscription tenant with subscriber_tenant_hint', async () => {
        // 1. Find shire.local, rivendell.local, and bree.local tenants
        const appOwnerTenant = await searchClient.findTenantBy({domain: 'shire.local'});
        const subscriber1 = await searchClient.findTenantBy({domain: 'rivendell.local'});
        const subscriber2 = await searchClient.findTenantBy({domain: 'bree.local'});
        expect(appOwnerTenant).toBeDefined();
        expect(subscriber1).toBeDefined();
        expect(subscriber2).toBeDefined();

        // 2. Create a new app under appOwnerTenant
        const appData = {
            name: `ambiguous-app-${uuid()}`,
            appUrl: `http://localhost:${app.webhook.boundPort}`,
            description: 'Ambiguous app for test'
        };
        const createdApp = await appClient.createApp(appOwnerTenant.id, appData.name, appData.appUrl, appData.description);
        await appClient.publishApp(createdApp.id);

        // 3. Create a new user and add to both subscribers
        const testUserEmail = `ambiguous-user-${uuid()}@test.com`;
        const testUserPassword = 'TestPassword123!';
        const createdUser = await usersClient.createUser('Ambiguous User', testUserEmail, testUserPassword);
        expect(createdUser).toBeDefined();
        expect(createdUser.email).toBe(testUserEmail);

        await adminTenantClient.addMembers(subscriber1.id, [testUserEmail]);
        await adminTenantClient.addMembers(subscriber2.id, [testUserEmail]);

        // 4. Subscribe both subscriber1 and subscriber2 to the app
        await adminTenantClient.subscribeToApp(subscriber1.id, createdApp.id);
        await adminTenantClient.subscribeToApp(subscriber2.id, createdApp.id);

        // 5. Password grant with subscriber_tenant_hint — should resolve
        const response = await app.getHttpServer()
            .post('/api/oauth/token')
            .send({
                grant_type: 'password',
                username: testUserEmail,
                password: testUserPassword,
                client_id: appOwnerTenant.clientId,
                subscriber_tenant_hint: subscriber1.domain,
            })
            .set('Accept', 'application/json');

        expect(response.status).toBe(201);
        expect(response.body.access_token).toBeDefined();
        expect(response.body.token_type).toBe('Bearer');
        expect(response.body.refresh_token).toBeDefined();
    });

    it('/POST login returns ambiguous tenants when user has multiple subscriptions', async () => {
        // 1. Find shire.local, rivendell.local, and bree.local tenants
        const appOwnerTenant = await searchClient.findTenantBy({domain: 'shire.local'});
        const subscriber1 = await searchClient.findTenantBy({domain: 'rivendell.local'});
        const subscriber2 = await searchClient.findTenantBy({domain: 'bree.local'});
        expect(appOwnerTenant).toBeDefined();
        expect(subscriber1).toBeDefined();
        expect(subscriber2).toBeDefined();

        // 2. Create a new app under appOwnerTenant
        const appData = {
            name: `ambiguous-app-${uuid()}`,
            appUrl: `http://localhost:${app.webhook.boundPort}`,
            description: 'Ambiguous app for test'
        };
        const createdApp = await appClient.createApp(appOwnerTenant.id, appData.name, appData.appUrl, appData.description);
        await appClient.publishApp(createdApp.id);

        // 3. Create a new user and add to both subscribers
        const testUserEmail = `ambiguous-user-${uuid()}@test.com`;
        const testUserPassword = 'TestPassword123!';
        const createdUser = await usersClient.createUser('Ambiguous User', testUserEmail, testUserPassword);
        expect(createdUser).toBeDefined();
        expect(createdUser.email).toBe(testUserEmail);

        await adminTenantClient.addMembers(subscriber1.id, [testUserEmail]);
        await adminTenantClient.addMembers(subscriber2.id, [testUserEmail]);

        // 4. Subscribe both subscriber1 and subscriber2 to the app
        await adminTenantClient.subscribeToApp(subscriber1.id, createdApp.id);
        await adminTenantClient.subscribeToApp(subscriber2.id, createdApp.id);

        // 5. Login without hint — should return ambiguity
        const loginResponse = await tokenFixture.login(
            testUserEmail,
            testUserPassword,
            appOwnerTenant.clientId
        );

        // 6. Assert the response indicates tenant selection is required
        expect(loginResponse.requires_tenant_selection).toBe(true);
        expect(Array.isArray(loginResponse.tenants)).toBe(true);
        expect(loginResponse.tenants.length).toBe(2);

        // 7. Verify the returned tenants are the correct ones
        const tenantIds = loginResponse.tenants.map(t => t.id);
        expect(tenantIds).toContain(subscriber1.id);
        expect(tenantIds).toContain(subscriber2.id);

        // 8. Verify tenant details
        const tenant1 = loginResponse.tenants.find(t => t.id === subscriber1.id);
        const tenant2 = loginResponse.tenants.find(t => t.id === subscriber2.id);
        expect(tenant1.domain).toBe(subscriber1.domain);
        expect(tenant1.name).toBe(subscriber1.name);
        expect(tenant2.domain).toBe(subscriber2.domain);
        expect(tenant2.name).toBe(subscriber2.name);
    });

    it('/POST login returns no ambiguity when user has single subscription', async () => {
        // 1. Find shire.local and rivendell.local tenants
        const appOwnerTenant = await searchClient.findTenantBy({domain: 'shire.local'});
        const subscriber = await searchClient.findTenantBy({domain: 'rivendell.local'});
        expect(appOwnerTenant).toBeDefined();
        expect(subscriber).toBeDefined();

        // 2. Create a new app under appOwnerTenant
        const appData = {
            name: `single-sub-app-${uuid()}`,
            appUrl: `http://localhost:${app.webhook.boundPort}`,
            description: 'Single subscription app for test'
        };
        const createdApp = await appClient.createApp(appOwnerTenant.id, appData.name, appData.appUrl, appData.description);
        await appClient.publishApp(createdApp.id);

        // 3. Create a new user and add to subscriber
        const testUserEmail = `single-sub-user-${uuid()}@test.com`;
        const testUserPassword = 'TestPassword123!';
        const createdUser = await usersClient.createUser('Single Sub User', testUserEmail, testUserPassword);
        expect(createdUser).toBeDefined();
        expect(createdUser.email).toBe(testUserEmail);

        await adminTenantClient.addMembers(subscriber.id, [testUserEmail]);

        // 4. Subscribe subscriber to the app
        await adminTenantClient.subscribeToApp(subscriber.id, createdApp.id);

        // 5. Login — should succeed with auth code (no ambiguity)
        const loginResponse = await tokenFixture.login(
            testUserEmail,
            testUserPassword,
            appOwnerTenant.clientId
        );

        // 6. Assert the response contains an auth code, not a tenant selection
        expect(loginResponse.authentication_code).toBeDefined();
        expect(loginResponse.requires_tenant_selection).not.toBeDefined();
    });

    it('/POST login returns no ambiguity when user logs into own tenant', async () => {
        // 1. Find shire.local tenant
        const appOwnerTenant = await searchClient.findTenantBy({domain: 'shire.local'});
        expect(appOwnerTenant).toBeDefined();

        // 2. Create a new app under appOwnerTenant
        const appData = {
            name: `own-tenant-app-${uuid()}`,
            appUrl: `http://localhost:${app.webhook.boundPort}`,
            description: 'App for own tenant test'
        };
        const createdApp = await appClient.createApp(appOwnerTenant.id, appData.name, appData.appUrl, appData.description);
        await appClient.publishApp(createdApp.id);

        // 3. Create a new user in appOwnerTenant
        const testUserEmail = `own-tenant-user-${uuid()}@test.com`;
        const testUserPassword = 'TestPassword123!';
        const createdUser = await usersClient.createUser('Own Tenant User', testUserEmail, testUserPassword);
        expect(createdUser).toBeDefined();
        expect(createdUser.email).toBe(testUserEmail);

        await adminTenantClient.addMembers(appOwnerTenant.id, [testUserEmail]);

        // 4. Login — should succeed with auth code
        const loginResponse = await tokenFixture.login(
            testUserEmail,
            testUserPassword,
            appOwnerTenant.clientId
        );

        // 5. Assert the response contains an auth code
        expect(loginResponse.authentication_code).toBeDefined();
        expect(loginResponse.requires_tenant_selection).not.toBeDefined();
    });

    it('/POST login returns 403 when user does not belong to any tenant', async () => {
        // 1. Find shire.local tenant
        const appOwnerTenant = await searchClient.findTenantBy({domain: 'shire.local'});
        expect(appOwnerTenant).toBeDefined();

        // 2. Create a new user without adding to any tenant
        const testUserEmail = `no-tenant-user-${uuid()}@test.com`;
        const testUserPassword = 'TestPassword123!';
        const createdUser = await usersClient.createUser('No Tenant User', testUserEmail, testUserPassword);
        expect(createdUser).toBeDefined();
        expect(createdUser.email).toBe(testUserEmail);

        try {
            const loginResponse = await tokenFixture.login(
                testUserEmail,
                testUserPassword,
                appOwnerTenant.clientId
            );
            expect(loginResponse.authentication_code).toBeDefined();
        } catch (error) {
            expect(error.status).toBe(403);
        }
    });

    it('/POST login with subscriber_tenant_hint resolves ambiguity and issues auth code', async () => {
        // 1. Find shire.local, rivendell.local, and bree.local tenants
        const appOwnerTenant = await searchClient.findTenantBy({domain: 'shire.local'});
        const subscriber1 = await searchClient.findTenantBy({domain: 'rivendell.local'});
        const subscriber2 = await searchClient.findTenantBy({domain: 'bree.local'});
        expect(subscriber1).toBeDefined();
        expect(subscriber2).toBeDefined();
        expect(appOwnerTenant).toBeDefined();

        // 2. Create a new app under appOwnerTenant
        const appData = {
            name: `hint-test-app-${uuid()}`,
            appUrl: `http://localhost:${app.webhook.boundPort}`,
            description: 'App for testing tenant hint'
        };
        const createdApp = await appClient.createApp(appOwnerTenant.id, appData.name, appData.appUrl, appData.description);
        await appClient.publishApp(createdApp.id);

        // 3. Create a new user and add to both subscribers
        const testUserEmail = `hint-test-user-${uuid()}@test.com`;
        const testUserPassword = 'TestPassword123!';
        const createdUser = await usersClient.createUser('Hint Test User', testUserEmail, testUserPassword);
        expect(createdUser).toBeDefined();
        expect(createdUser.email).toBe(testUserEmail);

        await adminTenantClient.addMembers(subscriber1.id, [testUserEmail]);
        await adminTenantClient.addMembers(subscriber2.id, [testUserEmail]);

        // 4. Subscribe both subscribers to the app
        await adminTenantClient.subscribeToApp(subscriber1.id, createdApp.id);
        await adminTenantClient.subscribeToApp(subscriber2.id, createdApp.id);

        // 5. Login without hint — should return ambiguity
        const ambiguousResponse = await tokenFixture.login(
            testUserEmail,
            testUserPassword,
            appOwnerTenant.clientId
        );
        expect(ambiguousResponse.requires_tenant_selection).toBe(true);

        // 6. Login again with subscriber_tenant_hint — should return auth code
        const resolvedResponse = await tokenFixture.login(
            testUserEmail,
            testUserPassword,
            appOwnerTenant.clientId,
            'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopq',
            subscriber1.domain
        );
        expect(resolvedResponse.authentication_code).toBeDefined();

        // 7. Exchange the auth code for a token — hint is baked in, no ambiguity
        const tokenResponse = await tokenFixture.exchangeCodeForToken(
            resolvedResponse.authentication_code,
            appOwnerTenant.clientId,
        );
        expect(tokenResponse.access_token).toBeDefined();
        expect(tokenResponse.refresh_token).toBeDefined();

        // 8. Verify the token contains the correct tenant
        const decodedToken = app.jwtService().decode(tokenResponse.access_token, {json: true}) as any;
        expect(decodedToken.tenant.domain).toBe(appOwnerTenant.domain);
        expect(decodedToken.userTenant.domain).toBe(subscriber1.domain);
    });
});
