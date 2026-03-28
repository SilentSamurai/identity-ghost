/**
 * Tests the App marketplace lifecycle: creation, subscription, unsubscription, and visibility.
 *
 * Uses two pre-seeded tenants (shire.local as creator, bree.local as subscriber) with their
 * own tokens to test the full flow from each tenant's perspective. A mock HTTP server
 * simulates the app's onboard/offboard webhook endpoints. Covers:
 *   - App creation and validation
 *   - Subscribe/unsubscribe with webhook verification (onboard/offboard calls)
 *   - Technical token in webhooks belongs to the app owner, not the subscriber
 *   - Invalid app ID rejection
 *   - Subscription scopes appear in the subscriber's JWT after subscribing
 *   - App visibility: unpublished apps are hidden, published apps are discoverable
 */
import {TestAppFixture} from '../test-app.fixture';
import {INestApplication} from '@nestjs/common';
import {v4 as uuid} from 'uuid';
import {AppClient} from '../api-client/app-client';
import {SearchClient} from '../api-client/search-client';
import {TokenFixture} from '../token.fixture';
import {createTenantAppServer, TenantAppServer} from './tenant-app-server';

describe('AppController', () => {
    let app: INestApplication;
    let fixture: TestAppFixture;
    let appClient: AppClient;
    let searchClient: SearchClient;
    let tokenFixture: TokenFixture;
    let creatorAccessToken: string;
    let subscriberAccessToken: string;
    let creatorTenantId: string;
    let subscriberTenantId: string;
    let mockServer: TenantAppServer;

    beforeAll(async () => {
        // Start the mock server
        mockServer = createTenantAppServer({port: 0});
        await mockServer.listen();

        // Initialize the test app
        fixture = new TestAppFixture();
        await fixture.init();
        app = fixture.nestApp;

        // Initialize token fixture
        tokenFixture = new TokenFixture(fixture);

        // Get super admin access token
        const superAdminTokenResponse = await tokenFixture.fetchAccessToken(
            'admin@auth.server.com',
            'admin9000',
            'auth.server.com'
        );
        const superAdminToken = superAdminTokenResponse.accessToken;

        // Initialize search client with super admin token
        searchClient = new SearchClient(fixture, superAdminToken);

        // Find the existing test tenants
        const shireTenant = await searchClient.findTenantBy({domain: 'shire.local'});
        const breeTenant = await searchClient.findTenantBy({domain: 'bree.local'});

        creatorTenantId = shireTenant.id;
        subscriberTenantId = breeTenant.id;

        // Get access tokens for both tenants
        const creatorTokenResponse = await tokenFixture.fetchAccessToken(
            'admin@shire.local',
            'admin9000',
            'shire.local'
        );
        creatorAccessToken = creatorTokenResponse.accessToken;

        const subscriberTokenResponse = await tokenFixture.fetchAccessToken(
            'admin@bree.local',
            'admin9000',
            'bree.local'
        );
        subscriberAccessToken = subscriberTokenResponse.accessToken;

        // Initialize app client with creator's access token
        appClient = new AppClient(fixture, creatorAccessToken);
    });

    afterAll(async () => {
        // Close the mock server
        await fixture.close();
        await mockServer.close();
    });

    describe('createApp', () => {
        it('should create a new app with valid data', async () => {
            const appData = {
                name: `test-app-${uuid()}`,
                appUrl: `http://localhost:${mockServer.boundPort}`,
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
            // This test needs to be done with direct HTTP request since the client validates inputs
            const invalidData = {
                tenantId: uuid(),
                // name is missing
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
            // Create a test app to subscribe to with the mock server URL
            const app = await appClient.createApp(
                creatorTenantId,
                `test-app-${uuid()}`,
                `http://localhost:${mockServer.boundPort}`,
                'Test app for subscription'
            );
            testAppId = app.id;
            // Publish the app so it can be subscribed to
            await appClient.publishApp(testAppId);
        });

        it('should successfully subscribe to an app', async () => {
            // Create a new app client with subscriber's access token
            const subscriberAppClient = new AppClient(fixture, subscriberAccessToken);

            const subscription = await subscriberAppClient.subscribeApp(testAppId, subscriberTenantId);

            expect(subscription).toBeDefined();
            expect(subscription.status).toBeDefined();
            expect(subscription.status).toEqual("success");

            // Verify that the onboard request was made
            const onboardRequests = mockServer.getOnboardRequests();
            expect(onboardRequests.length).toBeGreaterThan(0);
            expect(onboardRequests[0].tenantId).toBe(subscriberTenantId);

            // Assert the technical token is for the app owner (creatorTenantId)
            const lastDecodedToken = mockServer.getLastDecodedToken();
            expect(lastDecodedToken).toBeDefined();
            expect(lastDecodedToken.grant_type).toBe('client_credentials');
            expect(lastDecodedToken.tenant?.domain).toBe('shire.local');
        });

        it('should successfully unsubscribe from an app', async () => {
            // Create a new app client with subscriber's access token
            const subscriberAppClient = new AppClient(fixture, subscriberAccessToken);

            const subscription = await subscriberAppClient.subscribeApp(testAppId, subscriberTenantId);

            // Then unsubscribe using the AppClient
            const unsubscribeResponse = await subscriberAppClient.unsubscribeApp(testAppId, subscriberTenantId);
            expect(unsubscribeResponse).toBeDefined();
            expect(unsubscribeResponse.status).toBeDefined();
            expect(unsubscribeResponse.status).toEqual("success");

            // Verify that the offboard request was made
            const offboardRequests = mockServer.getOffboardRequests();
            expect(offboardRequests.length).toBeGreaterThan(0);
            expect(offboardRequests[0].tenantId).toBe(subscriberTenantId);

            // Assert the technical token is for the app owner (creatorTenantId)
            const lastDecodedToken = mockServer.getLastDecodedToken();
            expect(lastDecodedToken).toBeDefined();
            expect(lastDecodedToken.grant_type).toBe('client_credentials');
            expect(lastDecodedToken.tenant?.domain).toBe('shire.local');

            // Verify the subscription is no longer active
            const tenantSubscriptions = await subscriberAppClient.getTenantSubscriptions(subscriberTenantId);
            const unsubscribedApp = tenantSubscriptions.find(sub => sub.appId === testAppId);
            expect(unsubscribedApp).toBeUndefined();
        });

        it('should fail when subscribing with invalid app ID', async () => {
            const invalidAppId = 'invalid-uuid';

            // This test needs to be done with direct HTTP request since the client validates inputs
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
        // Subscribe to an app
        const subscriberAppClient = new AppClient(fixture, subscriberAccessToken);
        const app = await appClient.createApp(
            creatorTenantId,
            `test-app-scope-${uuid()}`,
            `http://localhost:${mockServer.boundPort}`,
            'Test app for scope validation'
        );
        // Publish the app so it can be subscribed to
        await appClient.publishApp(app.id);
        await subscriberAppClient.subscribeApp(app.id, subscriberTenantId);

        // Fetch access token for the subscriber again (should now include scope)
        const tokenResponse = await tokenFixture.fetchAccessToken(
            'admin@bree.local',
            'admin9000',
            'shire.local'
        );
        // The decoded JWT is in tokenResponse.jwt
        expect(tokenResponse.jwt).toBeDefined();
        expect(tokenResponse.jwt.scopes).toBeDefined();
        expect(Array.isArray(tokenResponse.jwt.scopes)).toBe(true);
        // Should include at least one scope (role) from the subscription
        expect(tokenResponse.jwt.scopes.length).toBeGreaterThan(0);
        // Optionally, check for a specific role name if known (e.g., 'TENANT_VIEWER')
        // expect(tokenResponse.jwt.scopes).toContain('TENANT_VIEWER');
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
                `http://localhost:${mockServer.boundPort}`,
                'Test app for publish/visibility'
            );
            testAppId = app.id;
        });

        it('should NOT be visible to other tenants before publishing', async () => {
            // Use the search client with the subscriber's token
            const subscriberAppClient = new AppClient(fixture, subscriberAccessToken);
            const availableApps = await subscriberAppClient.getAvailableApps(subscriberTenantId);
            const found = availableApps.find((a: any) => a.id === testAppId);
            expect(found).toBeUndefined();
        });

        it('should be visible to other tenants after publishing', async () => {
            // Publish the app
            await appClient.publishApp(testAppId);
            // Use the search client with the subscriber's token
            const subscriberAppClient = new AppClient(fixture, subscriberAccessToken);
            const availableApps = await subscriberAppClient.getAvailableApps(subscriberTenantId);
            const found = availableApps.find((a: any) => a.id === testAppId);
            expect(found).toBeDefined();
            expect(found.isPublic).toBe(true);
        });
    });
}); 