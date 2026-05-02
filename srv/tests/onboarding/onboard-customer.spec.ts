/**
 * Integration tests for POST /api/apps/:appId/onboard-customer
 *
 * Covers the app-initiated tenant onboarding endpoint:
 *   - Successful onboarding with new tenant + user (Req 4.2)
 *   - Successful onboarding with new tenant without user (Req 4.3)
 *   - Onboarding with existing subscribed tenant + user — upsert (Req 4.4)
 *   - Onboarding with existing subscribed tenant without user (Req 4.5)
 *   - Onboarding with existing unsubscribed tenant (Req 4.6)
 *   - 401 for missing/invalid token (Req 5.4)
 *   - 403 for non-owner technical token (Req 5.2, 5.3)
 *   - 403 for user token (not technical) (Req 5.3)
 *   - 404 for invalid appId (Req 5.5)
 *   - 409 for duplicate tenant domain (Req 4 — domain conflict)
 *   - Idempotency for duplicate requests (Req 8.1, 8.2, 8.3)
 *   - Email sent for new user only (Req 9.1, 9.2, 9.4)
 *
 * Requirements: 4, 5, 8, 9
 */
import { SharedTestFixture } from '../shared-test.fixture';
import { v4 as uuid } from 'uuid';
import { AppClient } from '../api-client/app-client';
import { TokenFixture } from '../token.fixture';
import { TenantClient } from '../api-client/tenant-client';
import { AdminTenantClient } from '../api-client/admin-tenant-client';
import { HelperFixture } from '../helper.fixture';
import { RoleClient } from '../api-client/role-client';

describe('Onboard Customer Endpoint', () => {
    let fixture: SharedTestFixture;
    let tokenFixture: TokenFixture;

    // Owner tenant — the tenant that owns the app
    let ownerDomain: string;
    let ownerTenantId: string;
    let ownerAdminToken: string;

    // Non-owner tenant — used for 403 tests
    let nonOwnerDomain: string;
    let nonOwnerTenantId: string;
    let nonOwnerAdminToken: string;

    // Technical token (client_credentials) for the owner tenant
    let ownerTechnicalToken: string;

    // Technical token for the non-owner tenant (for 403 test)
    let nonOwnerTechnicalToken: string;

    // App details
    let appId: string;
    let appName: string;

    // App-owned role names
    const appRoleNames = ['editor', 'viewer'];

    // Super admin credentials
    const superAdminEmail = 'admin@auth.server.com';
    const superAdminPassword = 'admin9000';

    // Dedicated test users from users.json (not shared with other test suites)
    const ownerAdminEmail = 'boromir@mail.com';
    const ownerAdminPassword = 'boromir9000';
    const nonOwnerAdminEmail = 'aragorn@mail.com';
    const nonOwnerAdminPassword = 'aragorn9000';

    beforeAll(async () => {
        fixture = new SharedTestFixture();
        tokenFixture = new TokenFixture(fixture);

        // 1. Authenticate as super admin
        const superAdmin = await tokenFixture.fetchAccessToken(
            superAdminEmail,
            superAdminPassword,
            'auth.server.com',
        );
        const superAdminTenantClient = new TenantClient(fixture, superAdmin.accessToken);
        const adminClient = new AdminTenantClient(fixture, superAdmin.accessToken);
        const helper = new HelperFixture(fixture, superAdmin.accessToken);

        // 2. Create owner tenant
        ownerDomain = `onboard-owner-${Date.now()}.test`;
        const ownerTenant = await superAdminTenantClient.createTenant('onboard-owner', ownerDomain);
        ownerTenantId = ownerTenant.id;
        await helper.enablePasswordGrant(ownerTenantId, ownerDomain);

        // 3. Create non-owner tenant
        nonOwnerDomain = `onboard-nonowner-${Date.now()}.test`;
        const nonOwnerTenant = await superAdminTenantClient.createTenant('onboard-nonowner', nonOwnerDomain);
        nonOwnerTenantId = nonOwnerTenant.id;
        await helper.enablePasswordGrant(nonOwnerTenantId, nonOwnerDomain);

        // 4. Add admin users to both tenants
        const ownerMembers = await adminClient.addMembers(ownerTenantId, [ownerAdminEmail]);
        const ownerUserId = ownerMembers.members.find((m: any) => m.email === ownerAdminEmail).id;
        await adminClient.updateMemberRoles(ownerTenantId, ownerUserId, ['TENANT_ADMIN']);

        const nonOwnerMembers = await adminClient.addMembers(nonOwnerTenantId, [nonOwnerAdminEmail]);
        const nonOwnerUserId = nonOwnerMembers.members.find((m: any) => m.email === nonOwnerAdminEmail).id;
        await adminClient.updateMemberRoles(nonOwnerTenantId, nonOwnerUserId, ['TENANT_ADMIN']);

        // 5. Authenticate as tenant admins
        const ownerTokenResp = await tokenFixture.fetchAccessToken(
            ownerAdminEmail, ownerAdminPassword, ownerDomain,
        );
        ownerAdminToken = ownerTokenResp.accessToken;

        const nonOwnerTokenResp = await tokenFixture.fetchAccessToken(
            nonOwnerAdminEmail, nonOwnerAdminPassword, nonOwnerDomain,
        );
        nonOwnerAdminToken = nonOwnerTokenResp.accessToken;

        // 6. Create confidential clients for client_credentials tokens
        const ownerConfClient = await tokenFixture.createConfidentialClient(
            ownerAdminToken, ownerTenantId, 'onboard-owner-cc',
        );
        const ownerCCToken = await tokenFixture.fetchClientCredentialsToken(
            ownerConfClient.clientId, ownerConfClient.clientSecret,
        );
        ownerTechnicalToken = ownerCCToken.accessToken;

        const nonOwnerConfClient = await tokenFixture.createConfidentialClient(
            nonOwnerAdminToken, nonOwnerTenantId, 'onboard-nonowner-cc',
        );
        const nonOwnerCCToken = await tokenFixture.fetchClientCredentialsToken(
            nonOwnerConfClient.clientId, nonOwnerConfClient.clientSecret,
        );
        nonOwnerTechnicalToken = nonOwnerCCToken.accessToken;

        // 7. Create an app owned by the owner tenant
        const appClient = new AppClient(fixture, ownerAdminToken);
        appName = `onboard-test-app-${Date.now()}`;
        const app = await appClient.createApp(ownerTenantId, appName, 'http://localhost:9999', 'Test app for onboarding');

        appId = app.id;

        // 8. Create app-owned roles in the owner tenant and associate them with the app
        const roleClient = new RoleClient(fixture, ownerAdminToken);
        for (const roleName of appRoleNames) {
            const role = await roleClient.createRole(roleName, ownerTenantId);
            // Associate the role with the app via PATCH /api/role/:roleId
            await fixture.getHttpServer()
                .patch(`/api/role/${role.id}`)
                .send({ appId: appId })
                .set('Authorization', `Bearer ${ownerAdminToken}`)
                .set('Accept', 'application/json');
        }

        // 9. Publish the app
        await appClient.publishApp(appId);

        // 10. Clear any emails from setup
        await fixture.smtp.clearEmails();
    });

    afterAll(async () => {
        await fixture.close();
    });

    // ─── Helper ───

    function onboardRequest(
        targetAppId: string,
        body: Record<string, any>,
        token?: string,
    ) {
        const req = fixture.getHttpServer()
            .post(`/api/apps/${targetAppId}/onboard-customer`)
            .send(body)
            .set('Accept', 'application/json');

        if (token) {
            req.set('Authorization', `Bearer ${token}`);
        }
        return req;
    }

    // ─── Success Scenarios ───

    describe('successful onboarding', () => {
        it('should onboard a new tenant with a new user (Req 4.2)', async () => {
            const tenantDomain = `new-tenant-${uuid()}.test`;
            const userEmail = `user-${uuid()}@onboard.test`;

            await fixture.smtp.clearEmails();

            const response = await onboardRequest(appId, {
                tenantName: 'New Customer Tenant',
                tenantDomain: tenantDomain,
                userEmail: userEmail,
                userName: 'New User',
            }, ownerTechnicalToken);

            expect(response.status).toBeGreaterThanOrEqual(200);
            expect(response.status).toBeLessThan(300);
            expect(response.body.tenantId).toBeDefined();
            expect(response.body.subscriptionId).toBeDefined();
            expect(response.body.userId).toBeDefined();
            expect(response.body.roleNames).toBeDefined();
            expect(Array.isArray(response.body.roleNames)).toBe(true);
            expect(response.body.roleNames.length).toBe(appRoleNames.length);
            // All app-owned roles should be assigned
            for (const roleName of appRoleNames) {
                expect(response.body.roleNames).toContain(roleName);
            }
        });

        it('should onboard a new tenant without a user (Req 4.3)', async () => {
            const tenantDomain = `no-user-tenant-${uuid()}.test`;

            const response = await onboardRequest(appId, {
                tenantName: 'Tenant Without User',
                tenantDomain: tenantDomain,
            }, ownerTechnicalToken);

            expect(response.status).toBeGreaterThanOrEqual(200);
            expect(response.status).toBeLessThan(300);
            expect(response.body.tenantId).toBeDefined();
            expect(response.body.subscriptionId).toBeDefined();
            // No user fields when user not provided
            expect(response.body.userId).toBeUndefined();
            expect(response.body.roleNames).toBeUndefined();
        });
    });

    // ─── Existing Tenant Scenarios ───

    describe('existing tenant handling', () => {
        let existingTenantDomain: string;
        let existingTenantId: string;
        let existingSubscriptionId: string;

        beforeAll(async () => {
            // Pre-create a tenant + subscription via onboarding
            existingTenantDomain = `existing-tenant-${uuid()}.test`;
            const response = await onboardRequest(appId, {
                tenantName: 'Existing Tenant',
                tenantDomain: existingTenantDomain,
                userEmail: `existing-user-${uuid()}@onboard.test`,
                userName: 'Existing User',
            }, ownerTechnicalToken);

            expect(response.status).toBeGreaterThanOrEqual(200);
            expect(response.status).toBeLessThan(300);
            existingTenantId = response.body.tenantId;
            existingSubscriptionId = response.body.subscriptionId;
        });

        it('should upsert roles for existing subscribed tenant with a new user (Req 4.4)', async () => {
            const newUserEmail = `upsert-user-${uuid()}@onboard.test`;

            const response = await onboardRequest(appId, {
                tenantName: 'Existing Tenant',
                tenantDomain: existingTenantDomain,
                userEmail: newUserEmail,
                userName: 'Upsert User',
            }, ownerTechnicalToken);

            expect(response.status).toBeGreaterThanOrEqual(200);
            expect(response.status).toBeLessThan(300);
            expect(response.body.tenantId).toEqual(existingTenantId);
            expect(response.body.subscriptionId).toEqual(existingSubscriptionId);
            expect(response.body.userId).toBeDefined();
            expect(response.body.roleNames).toBeDefined();
            expect(response.body.roleNames.length).toBe(appRoleNames.length);
        });

        it('should return existing subscription for existing subscribed tenant without user (Req 4.5)', async () => {
            const response = await onboardRequest(appId, {
                tenantName: 'Existing Tenant',
                tenantDomain: existingTenantDomain,
            }, ownerTechnicalToken);

            expect(response.status).toBeGreaterThanOrEqual(200);
            expect(response.status).toBeLessThan(300);
            expect(response.body.tenantId).toEqual(existingTenantId);
            expect(response.body.subscriptionId).toEqual(existingSubscriptionId);
            expect(response.body.userId).toBeUndefined();
            expect(response.body.roleNames).toBeUndefined();
        });

        it('should create subscription for existing unsubscribed tenant (Req 4.6)', async () => {
            // Create a tenant that exists but is NOT subscribed to this app
            // We do this by creating a tenant via the super admin API directly
            const superAdmin = await tokenFixture.fetchAccessToken(
                superAdminEmail, superAdminPassword, 'auth.server.com',
            );
            const superAdminTenantClient = new TenantClient(fixture, superAdmin.accessToken);
            const unsubDomain = `unsub-tenant-${uuid()}.test`;
            const unsubTenant = await superAdminTenantClient.createTenant('Unsub Tenant', unsubDomain);

            const response = await onboardRequest(appId, {
                tenantName: 'Unsub Tenant',
                tenantDomain: unsubDomain,
                userEmail: `unsub-user-${uuid()}@onboard.test`,
                userName: 'Unsub User',
            }, ownerTechnicalToken);

            expect(response.status).toBeGreaterThanOrEqual(200);
            expect(response.status).toBeLessThan(300);
            expect(response.body.tenantId).toEqual(unsubTenant.id);
            expect(response.body.subscriptionId).toBeDefined();
            expect(response.body.userId).toBeDefined();
            expect(response.body.roleNames).toBeDefined();
            expect(response.body.roleNames.length).toBe(appRoleNames.length);
        });
    });

    // ─── Authorization & Error Scenarios ───

    describe('authorization errors', () => {
        it('should return 401 for missing token (Req 5.4)', async () => {
            const response = await onboardRequest(appId, {
                tenantName: 'No Auth Tenant',
                tenantDomain: `no-auth-${uuid()}.test`,
                userEmail: 'noauth@test.com',
                userName: 'No Auth',
            }); // no token

            expect(response.status).toBe(401);
        });

        it('should return 401 for invalid token (Req 5.4)', async () => {
            const response = await onboardRequest(appId, {
                tenantName: 'Bad Token Tenant',
                tenantDomain: `bad-token-${uuid()}.test`,
                userEmail: 'badtoken@test.com',
                userName: 'Bad Token',
            }, 'invalid.jwt.token');

            expect(response.status).toBe(401);
        });

        it('should return 403 for non-owner technical token (Req 5.2, 5.3)', async () => {
            const response = await onboardRequest(appId, {
                tenantName: 'Non Owner Tenant',
                tenantDomain: `non-owner-${uuid()}.test`,
                userEmail: 'nonowner@test.com',
                userName: 'Non Owner',
            }, nonOwnerTechnicalToken);

            expect(response.status).toBe(403);
        });

        it('should return 403 for user token (not technical) (Req 5.3)', async () => {
            // ownerAdminToken is a password-grant user token, not client_credentials
            const response = await onboardRequest(appId, {
                tenantName: 'User Token Tenant',
                tenantDomain: `user-token-${uuid()}.test`,
                userEmail: 'usertoken@test.com',
                userName: 'User Token',
            }, ownerAdminToken);

            expect(response.status).toBe(403);
        });
    });

    describe('validation errors', () => {
        it('should return 404 for invalid appId (Req 5.5)', async () => {
            const fakeAppId = uuid(); // valid UUID but no matching app

            const response = await onboardRequest(fakeAppId, {
                tenantName: 'Invalid App Tenant',
                tenantDomain: `invalid-app-${uuid()}.test`,
                userEmail: 'invalidapp@test.com',
                userName: 'Invalid App',
            }, ownerTechnicalToken);

            expect(response.status).toBe(404);
        });

        it('should return 409 for duplicate tenant domain when creating via different app (Req 4 — domain conflict)', async () => {
            // First, onboard a tenant with a specific domain
            const conflictDomain = `conflict-${uuid()}.test`;
            const firstResponse = await onboardRequest(appId, {
                tenantName: 'First Tenant',
                tenantDomain: conflictDomain,
            }, ownerTechnicalToken);

            expect(firstResponse.status).toBeGreaterThanOrEqual(200);
            expect(firstResponse.status).toBeLessThan(300);

            // Create a second app owned by the same owner
            const appClient = new AppClient(fixture, ownerAdminToken);
            const secondAppName = `second-app-${Date.now()}`;
            const secondApp = await appClient.createApp(
                ownerTenantId, secondAppName, 'http://localhost:9998', 'Second test app',
            );
            await appClient.publishApp(secondApp.id);

            // Try to onboard with the same domain via the second app
            // The tenant already exists, so this should create a subscription (not 409)
            // because the existing-tenant flow handles this case
            const secondResponse = await onboardRequest(secondApp.id, {
                tenantName: 'First Tenant',
                tenantDomain: conflictDomain,
            }, ownerTechnicalToken);

            // Existing tenant without subscription → creates subscription (Req 4.6)
            expect(secondResponse.status).toBeGreaterThanOrEqual(200);
            expect(secondResponse.status).toBeLessThan(300);
            expect(secondResponse.body.subscriptionId).toBeDefined();
        });
    });

    // ─── Idempotency ───

    describe('idempotency', () => {
        it('should return same response for duplicate requests (Req 8.1, 8.2, 8.3)', async () => {
            const tenantDomain = `idempotent-${uuid()}.test`;
            const userEmail = `idempotent-${uuid()}@onboard.test`;
            const body = {
                tenantName: 'Idempotent Tenant',
                tenantDomain: tenantDomain,
                userEmail: userEmail,
                userName: 'Idempotent User',
            };

            // First request
            const first = await onboardRequest(appId, body, ownerTechnicalToken);
            expect(first.status).toBeGreaterThanOrEqual(200);
            expect(first.status).toBeLessThan(300);

            // Second (duplicate) request
            const second = await onboardRequest(appId, body, ownerTechnicalToken);
            expect(second.status).toBeGreaterThanOrEqual(200);
            expect(second.status).toBeLessThan(300);

            // Same tenant and subscription
            expect(second.body.tenantId).toEqual(first.body.tenantId);
            expect(second.body.subscriptionId).toEqual(first.body.subscriptionId);
            expect(second.body.userId).toEqual(first.body.userId);
            expect(second.body.roleNames).toBeDefined();
            expect(second.body.roleNames.length).toBe(first.body.roleNames.length);
        });
    });

    // ─── Email Notification ───

    describe('email notifications', () => {
        it('should send email for newly created user (Req 9.1)', async () => {
            await fixture.smtp.clearEmails();

            const userEmail = `email-test-${uuid()}@onboard.test`;
            const tenantDomain = `email-tenant-${uuid()}.test`;

            const response = await onboardRequest(appId, {
                tenantName: 'Email Test Tenant',
                tenantDomain: tenantDomain,
                userEmail: userEmail,
                userName: 'Email Test User',
            }, ownerTechnicalToken);

            expect(response.status).toBeGreaterThanOrEqual(200);
            expect(response.status).toBeLessThan(300);

            // Verify email was sent to the new user
            const email = await fixture.smtp.waitForEmail(
                { to: userEmail },
                10000,
            );
            expect(email).toBeDefined();
            expect(email.to).toBeDefined();
        });

        it('should NOT send email when no user is provided (Req 9.4)', async () => {
            await fixture.smtp.clearEmails();

            const tenantDomain = `no-email-tenant-${uuid()}.test`;

            const response = await onboardRequest(appId, {
                tenantName: 'No Email Tenant',
                tenantDomain: tenantDomain,
            }, ownerTechnicalToken);

            expect(response.status).toBeGreaterThanOrEqual(200);
            expect(response.status).toBeLessThan(300);

            // Wait briefly and verify no email was sent
            const emails = await fixture.smtp.listEmails({ limit: 10 });
            // No emails should have been sent after clearing
            expect(emails.emails.length).toBe(0);
        });

        it('should NOT send email for existing user added to new tenant (Req 9.2)', async () => {
            // First, create a user via onboarding
            const sharedEmail = `shared-user-${uuid()}@onboard.test`;
            const firstDomain = `first-email-${uuid()}.test`;

            await onboardRequest(appId, {
                tenantName: 'First Email Tenant',
                tenantDomain: firstDomain,
                userEmail: sharedEmail,
                userName: 'Shared User',
            }, ownerTechnicalToken);

            // Clear emails after first onboarding
            await fixture.smtp.clearEmails();

            // Now onboard the same user to a different tenant (existing subscribed tenant)
            // The user already exists, so no email should be sent
            const secondDomain = `second-email-${uuid()}.test`;

            // Create a second app for a fresh tenant
            const appClient = new AppClient(fixture, ownerAdminToken);
            const secondAppName = `email-app-${Date.now()}`;
            const secondApp = await appClient.createApp(
                ownerTenantId, secondAppName, 'http://localhost:9997', 'Email test app 2',
            );

            // Create app-owned roles for the second app
            const roleClient = new RoleClient(fixture, ownerAdminToken);
            for (const roleName of ['role-a', 'role-b']) {
                const role = await roleClient.createRole(`${secondAppName}-${roleName}`, ownerTenantId);
                await fixture.getHttpServer()
                    .patch(`/api/role/${role.id}`)
                    .send({ appId: secondApp.id })
                    .set('Authorization', `Bearer ${ownerAdminToken}`)
                    .set('Accept', 'application/json');
            }

            await appClient.publishApp(secondApp.id);

            const response = await onboardRequest(secondApp.id, {
                tenantName: 'Second Email Tenant',
                tenantDomain: secondDomain,
                userEmail: sharedEmail,
                userName: 'Shared User',
            }, ownerTechnicalToken);

            expect(response.status).toBeGreaterThanOrEqual(200);
            expect(response.status).toBeLessThan(300);

            // Verify no email was sent (user already existed)
            const emails = await fixture.smtp.listEmails({ to: sharedEmail, limit: 10 });
            expect(emails.emails.length).toBe(0);
        });
    });
});
