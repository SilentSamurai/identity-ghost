import {SharedTestFixture} from '../shared-test.fixture';
import {TokenFixture} from '../token.fixture';
import {AppClient} from '../api-client/app-client';
import {SearchClient} from '../api-client/search-client';
import {AdminTenantClient} from '../api-client/admin-tenant-client';
import {v4 as uuid} from 'uuid';

describe('Webhook Adapter End-to-End', () => {
    let fixture: SharedTestFixture;
    let tokenFixture: TokenFixture;
    let superAdminToken: string;
    let shireTenantId: string;
    let breeTenantId: string;

    beforeAll(async () => {
        fixture = new SharedTestFixture();
        tokenFixture = new TokenFixture(fixture);

        // Clear webhook request history
        await fixture.webhook.clearOnboardRequests();
        await fixture.webhook.clearOffboardRequests();

        // Get super admin token
        const superAdminResponse = await tokenFixture.fetchAccessToken(
            'admin@auth.server.com',
            'admin9000',
            'auth.server.com'
        );
        superAdminToken = superAdminResponse.accessToken;

        // Find shire.local and bree.local tenants
        const searchClient = new SearchClient(fixture, superAdminToken);
        const shireTenant = await searchClient.findTenantBy({domain: 'shire.local'});
        const breeTenant = await searchClient.findTenantBy({domain: 'bree.local'});
        shireTenantId = shireTenant.id;
        breeTenantId = breeTenant.id;
    });

    afterAll(async () => {
        await fixture.close();
    });

    it('should track onboard and offboard webhook requests through the adapter', async () => {
        // Get creator (shire.local) token to create and publish an app
        const creatorTokenResponse = await tokenFixture.fetchAccessToken(
            'admin@shire.local',
            'admin9000',
            'shire.local'
        );
        const creatorToken = creatorTokenResponse.accessToken;
        const appClient = new AppClient(fixture, creatorToken);

        // Create an app under shire.local pointing to the shared webhook server
        const appName = `webhook-e2e-${uuid()}`;
        const app = await appClient.createApp(
            shireTenantId,
            appName,
            `http://localhost:${fixture.webhook.boundPort}`,
            'Webhook adapter e2e test app'
        );

        // Publish the app so bree.local can subscribe
        await appClient.publishApp(app.id);

        // Clear webhook history right before subscribe to isolate this test
        await fixture.webhook.clearOnboardRequests();
        await fixture.webhook.clearOffboardRequests();

        // Subscribe bree.local to the app (triggers onboard webhook)
        const adminClient = new AdminTenantClient(fixture, superAdminToken);
        await adminClient.subscribeToApp(breeTenantId, app.id);

        // Verify onboard request was tracked
        const onboardResult = await fixture.webhook.getOnboardRequests();
        expect(onboardResult.count).toBeGreaterThanOrEqual(1);
        expect(onboardResult.requests.length).toBeGreaterThanOrEqual(1);

        const onboardReq = onboardResult.requests.find(r => r.tenantId === breeTenantId);
        expect(onboardReq).toBeDefined();
        expect(onboardReq!.tenantId).toBe(breeTenantId);
        expect(onboardReq!.timestamp).toBeDefined();

        // Unsubscribe bree.local (triggers offboard webhook)
        await adminClient.unsubscribeFromApp(breeTenantId, app.id);

        // Verify offboard request was tracked
        const offboardResult = await fixture.webhook.getOffboardRequests();
        expect(offboardResult.count).toBeGreaterThanOrEqual(1);
        expect(offboardResult.requests.length).toBeGreaterThanOrEqual(1);

        const offboardReq = offboardResult.requests.find(r => r.tenantId === breeTenantId);
        expect(offboardReq).toBeDefined();
        expect(offboardReq!.tenantId).toBe(breeTenantId);
        expect(offboardReq!.timestamp).toBeDefined();
    });
});
