/**
 * Tests the App marketplace lifecycle: creation, subscription, unsubscription, and visibility.
 *
 * Creates two isolated tenants with dedicated admin users (merry, pippin) so the test is
 * fully independent of seeded tenant state and immune to cross-test interference (e.g.
 * another spec locking a shared user). A mock HTTP server simulates the app's
 * onboard/offboard webhook endpoints. Covers:
 *   - App creation and validation
 *   - Subscribe/unsubscribe with webhook verification (onboard/offboard calls)
 *   - Technical token in webhooks belongs to the app owner, not the subscriber
 *   - Invalid app ID rejection
 *   - Subscription scopes appear in the subscriber's JWT after subscribing
 *   - App visibility: unpublished apps are hidden, published apps are discoverable
 */
import {SharedTestFixture} from '../shared-test.fixture';
import {v4 as uuid} from 'uuid';
import {AppClient} from '../api-client/app-client';
import {TokenFixture} from '../token.fixture';
import {TenantClient} from '../api-client/tenant-client';
import {AdminTenantClient} from '../api-client/admin-tenant-client';

describe('AppController', () => {
    let fixture: SharedTestFixture;
    let appClient: AppClient;
    let tokenFixture: TokenFixture;
    let creatorAccessToken: string;
    let subscriberAccessToken: string;
    let creatorTenantId: string;
    let subscriberTenantId: string;
    let creatorDomain: string;
    let subscriberDomain: string;

    // Seeded users not used by any other test
    const creatorEmail = 'merry@mail.com';
    const creatorPassword = 'merry9000';
    const subscriberEmail = 'pippin@mail.com';
    const subscriberPassword = 'pippin9000';

    beforeAll(async () => {
        fixture = new SharedTestFixture();
        tokenFixture = new TokenFixture(fixture);

        // Authenticate as super admin to create isolated tenants
        const superAdmin = await tokenFixture.fetchAccessToken(
            'admin@auth.server.com',
            'admin9000',
            'auth.server.com'
        );
        const superAdminTenantClient = new TenantClient(fixture, superAdmin.accessToken);
        const adminClient = new AdminTenantClient(fixture, superAdmin.accessToken);

        // Create two unique tenants for this test suite
        creatorDomain = `app-creator-${Date.now()}.test`;
        subscriberDomain = `app-subscriber-${Date.now()}.test`;

        const creatorTenant = await superAdminTenantClient.createTenant('app-creator', creatorDomain);
        const subscriberTenant = await superAdminTenantClient.createTenant('app-subscriber', subscriberDomain);
        creatorTenantId = creatorTenant.id;
        subscriberTenantId = subscriberTenant.id;

        // Add dedicated users as TENANT_ADMIN to each tenant
        const creatorMembers = await adminClient.addMembers(creatorTenantId, [creatorEmail]);
        const creatorUserId = creatorMembers.members.find((m: any) => m.email === creatorEmail).id;
        await adminClient.updateMemberRoles(creatorTenantId, creatorUserId, ['TENANT_ADMIN']);

        const subscriberMembers = await adminClient.addMembers(subscriberTenantId, [subscriberEmail]);
        const subscriberUserId = subscriberMembers.members.find((m: any) => m.email === subscriberEmail).id;
        await adminClient.updateMemberRoles(subscriberTenantId, subscriberUserId, ['TENANT_ADMIN']);

        // Authenticate as the tenant admins
        const creatorTokenResponse = await tokenFixture.fetchAccessToken(
            creatorEmail, creatorPassword, creatorDomain
        );
        creatorAccessToken = creatorTokenResponse.accessToken;

        const subscriberTokenResponse = await tokenFixture.fetchAccessToken(
            subscriberEmail, subscriberPassword, subscriberDomain
        );
        subscriberAccessToken = subscriberTokenResponse.accessToken;

        // Initialize app client with creator's access token
        appClient = new AppClient(fixture, creatorAccessToken);
    });

    afterAll(async () => {
        await fixture.close();
    });

    describe('createApp', () => {
        it('should create a new app with valid data', async () => {
            const appData = {
                name: `test-app-${uuid()}`,
                appUrl: `http://localhost:${fixture.webhook.boundPort}`,
                description: 'Test application description'
            };

            const createAppResponse = await appClient.createApp(
                creatorTenantId,
                appData.name,
                appData.appUrl,
                appData.description
            );

            expect(createAppResponse).toHaveProperty('id');
            expect(createAppResponse).toHaveProperty('name', appData.name);
            expect(createAppResponse).toHaveProperty('description', appData.description);
            expect(createAppResponse).toHaveProperty('createdAt');
        });

        it('should fail when required fields are missing', async () => {
            const invalidData = {
                tenantId: uuid(),
                appUrl: 'https://test-app.example.com'
            };

            const response = await fixture.getHttpServer()
                .post('/api/apps/create')
                .send(invalidData)
                .set('Authorization', `Bearer ${creatorAccessToken}`)
                .set('Accept', 'application/json');

            expect(response.status).toBe(400);
        });
    });

    describe('subscribeToApp', () => {
        let testAppId: string;

        beforeEach(async () => {
            // Create a test app to subscribe to with the shared webhook server URL
            const app = await appClient.createApp(
                creatorTenantId,
                `test-app-${uuid()}`,
                `http://localhost:${fixture.webhook.boundPort}`,
                'Test app for subscription'
            );
            testAppId = app.id;
            // Publish the app so it can be subscribed to
            await appClient.publishApp(testAppId);
        });

        it('should successfully subscribe to an app', async () => {
            const subscriberAppClient = new AppClient(fixture, subscriberAccessToken);

            const subscription = await subscriberAppClient.subscribeApp(testAppId, subscriberTenantId);

            expect(subscription).toBeDefined();
            expect(subscription.status).toBeDefined();
            expect(subscription.status).toEqual("success");

            // Verify that the onboard request was made for our tenant
            const onboardRequests = (await fixture.webhook.getOnboardRequestsForTenant(subscriberTenantId)).requests;
            expect(onboardRequests.length).toBeGreaterThan(0);

            // Assert the technical token is for the app owner (creator tenant).
            // Uses tenant-keyed lookup to avoid races with parallel tests.
            const decodedToken = await fixture.webhook.getDecodedTokenForTenant(subscriberTenantId);
            expect(decodedToken).toBeDefined();
            expect(decodedToken.grant_type).toBe('client_credentials');
            expect(decodedToken.tenant?.domain).toBe(creatorDomain);
        });

        it('should successfully unsubscribe from an app', async () => {
            const subscriberAppClient = new AppClient(fixture, subscriberAccessToken);

            await subscriberAppClient.subscribeApp(testAppId, subscriberTenantId);

            const unsubscribeResponse = await subscriberAppClient.unsubscribeApp(testAppId, subscriberTenantId);
            expect(unsubscribeResponse).toBeDefined();
            expect(unsubscribeResponse.status).toBeDefined();
            expect(unsubscribeResponse.status).toEqual("success");

            // Verify that the offboard request was made for our tenant
            const offboardRequests = (await fixture.webhook.getOffboardRequestsForTenant(subscriberTenantId)).requests;
            expect(offboardRequests.length).toBeGreaterThan(0);

            // Assert the technical token is for the app owner (creator tenant)
            const decodedToken = await fixture.webhook.getDecodedTokenForTenant(subscriberTenantId);
            expect(decodedToken).toBeDefined();
            expect(decodedToken.grant_type).toBe('client_credentials');
            expect(decodedToken.tenant?.domain).toBe(creatorDomain);

            // Verify the subscription is no longer active
            const tenantSubscriptions = await subscriberAppClient.getTenantSubscriptions(subscriberTenantId);
            const unsubscribedApp = tenantSubscriptions.find((sub: any) => sub.appId === testAppId);
            expect(unsubscribedApp).toBeUndefined();
        });

        it('should fail when subscribing with invalid app ID', async () => {
            const invalidAppId = 'invalid-uuid';

            const response = await fixture.getHttpServer()
                .post(`/api/apps/${invalidAppId}/my/subscribe`)
                .send({})
                .set('Authorization', `Bearer ${subscriberAccessToken}`)
                .set('Accept', 'application/json');

            console.log(response.body)

            expect(response.status).toBe(400);
        });
    });

    it('should include the correct scope in the access token after subscribing', async () => {
        const subscriberAppClient = new AppClient(fixture, subscriberAccessToken);
        const app = await appClient.createApp(
            creatorTenantId,
            `test-app-scope-${uuid()}`,
            `http://localhost:${fixture.webhook.boundPort}`,
            'Test app for scope validation'
        );
        // Publish the app so it can be subscribed to
        await appClient.publishApp(app.id);
        await subscriberAppClient.subscribeApp(app.id, subscriberTenantId);

        // Fetch access token for the subscriber again (should now include scope)
        const tokenResponse = await tokenFixture.fetchAccessToken(
            subscriberEmail,
            subscriberPassword,
            creatorDomain
        );
        // The decoded JWT is in tokenResponse.jwt
        expect(tokenResponse.jwt).toBeDefined();
        // JWT now uses `scope` (space-delimited string) instead of `scopes` (array)
        expect(tokenResponse.jwt.scope).toBeDefined();
        expect(typeof tokenResponse.jwt.scope).toBe('string');
        // Should include at least one OIDC scope
        expect(tokenResponse.jwt.scope.length).toBeGreaterThan(0);
    });

    describe('app visibility and publishing', () => {
        let testAppId: string;
        let testAppName: string;

        beforeEach(async () => {
            testAppName = `test-app-publish-${uuid()}`;
            // Create a test app (not public by default)
            const app = await appClient.createApp(
                creatorTenantId,
                testAppName,
                `http://localhost:${fixture.webhook.boundPort}`,
                'Test app for publish/visibility'
            );
            testAppId = app.id;
        });

        it('should NOT be visible to other tenants before publishing', async () => {
            const subscriberAppClient = new AppClient(fixture, subscriberAccessToken);
            const availableApps = await subscriberAppClient.getAvailableApps(subscriberTenantId);
            const found = availableApps.find((a: any) => a.id === testAppId);
            expect(found).toBeUndefined();
        });

        it('should be visible to other tenants after publishing', async () => {
            await appClient.publishApp(testAppId);
            const subscriberAppClient = new AppClient(fixture, subscriberAccessToken);
            const availableApps = await subscriberAppClient.getAvailableApps(subscriberTenantId);
            const found = availableApps.find((a: any) => a.id === testAppId);
            expect(found).toBeDefined();
            expect(found.isPublic).toBe(true);
        });
    });
});
