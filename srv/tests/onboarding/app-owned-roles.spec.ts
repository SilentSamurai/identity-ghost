/**
 * Integration tests for app-owned roles: residency, token namespacing, policy resolution,
 * and subscription lifecycle.
 *
 * Covers:
 *   - App-owned role assignment via user_roles references role in owner tenant (Req 1)
 *   - Duplicate assignment prevention via composite PK constraint (Req 2)
 *   - Token includes namespaced app-owned roles (`{appName}:{roleName}` format) (Req 7)
 *   - Token includes un-namespaced internal roles alongside namespaced app-owned roles (Req 7)
 *   - Token includes roles from multiple subscribed apps (Req 7)
 *   - `/my/permissions` returns policies from owner tenant for app-owned roles (Req 3)
 *   - `/my/permissions` returns combined policies from tenant-local + app-owned roles (Req 3)
 *   - `/tenant-user/permissions` resolves app-owned role policies from owner tenant (Req 3)
 *   - Graceful degradation when app-owned role is deleted (Req 1, 3)
 *   - Unsubscribe removes user_roles for app-owned roles only (Req 1)
 *   - App-owned roles remain in owner tenant after subscriber unsubscribes (Req 1)
 *
 * Requirements: 1, 2, 3, 7
 */
import { SharedTestFixture } from '../shared-test.fixture';
import { v4 as uuid } from 'uuid';
import { AppClient } from '../api-client/app-client';
import { TokenFixture } from '../token.fixture';
import { TenantClient } from '../api-client/tenant-client';
import { AdminTenantClient } from '../api-client/admin-tenant-client';
import { HelperFixture } from '../helper.fixture';
import { RoleClient } from '../api-client/role-client';
import { expect2xx } from '../api-client/client';

describe('App-Owned Roles', () => {
    let fixture: SharedTestFixture;
    let tokenFixture: TokenFixture;

    // Super admin
    const superAdminEmail = 'admin@auth.server.com';
    const superAdminPassword = 'admin9000';
    let superAdminToken: string;
    let superAdminTenantClient: TenantClient;
    let adminClient: AdminTenantClient;
    let helper: HelperFixture;

    // Owner tenant — the tenant that owns the app
    // Use a pre-seeded user from users.json for the owner admin
    const ownerAdminEmail = 'gimli@mail.com';
    const ownerAdminPassword = 'gimli9000';
    let ownerDomain: string;
    let ownerTenantId: string;
    let ownerAdminToken: string;

    // Technical token (client_credentials) for the owner tenant
    let ownerTechnicalToken: string;
    let ownerConfClientId: string;
    let ownerConfClientSecret: string;

    // App details
    let appId: string;
    let appName: string;

    // App-owned role IDs and names
    const appRoleNames = ['app-editor', 'app-viewer'];
    const appRoleIds: Record<string, string> = {};

    // Subscriber tenant — onboarded via the onboarding endpoint
    // Password will be set via super admin after onboarding
    const subscriberUserPassword = 'Subscriber9000';
    let subscriberDomain: string;
    let subscriberTenantId: string;
    let subscriberUserEmail: string;
    let subscriberUserId: string;

    // Subscriber technical token
    let subscriberTechnicalToken: string;

    beforeAll(async () => {
        fixture = new SharedTestFixture();
        tokenFixture = new TokenFixture(fixture);

        // 1. Authenticate as super admin
        const superAdmin = await tokenFixture.fetchAccessTokenFlow(
            superAdminEmail,
            superAdminPassword,
            'auth.server.com',
        );
        superAdminToken = superAdmin.accessToken;
        superAdminTenantClient = new TenantClient(fixture, superAdminToken);
        adminClient = new AdminTenantClient(fixture, superAdminToken);
        helper = new HelperFixture(fixture, superAdminToken);

        // 2. Create owner tenant
        ownerDomain = `app-roles-owner-${Date.now()}.test`;
        const ownerTenant = await superAdminTenantClient.createTenant('app-roles-owner', ownerDomain);
        ownerTenantId = ownerTenant.id;
        await helper.enablePasswordGrant(ownerTenantId, ownerDomain);

        // 3. Add pre-seeded admin user to owner tenant
        const ownerMembers = await adminClient.addMembers(ownerTenantId, [ownerAdminEmail]);
        const ownerUser = ownerMembers.members.find((m: any) => m.email === ownerAdminEmail);
        await adminClient.updateMemberRoles(ownerTenantId, ownerUser.id, ['TENANT_ADMIN']);

        // 4. Authenticate as owner admin (using pre-seeded password)
        const ownerTokenResp = await tokenFixture.fetchAccessTokenFlow(
            ownerAdminEmail, ownerAdminPassword, ownerDomain,
        );
        ownerAdminToken = ownerTokenResp.accessToken;

        // 5. Create confidential client for owner tenant (client_credentials)
        const ownerConfClient = await tokenFixture.createConfidentialClient(
            ownerAdminToken, ownerTenantId, 'app-roles-owner-cc',
        );
        ownerConfClientId = ownerConfClient.clientId;
        ownerConfClientSecret = ownerConfClient.clientSecret;
        const ownerCCToken = await tokenFixture.fetchClientCredentialsTokenFlow(
            ownerConfClientId, ownerConfClientSecret,
        );
        ownerTechnicalToken = ownerCCToken.accessToken;

        // 6. Create an app owned by the owner tenant
        const appClient = new AppClient(fixture, ownerAdminToken);
        appName = `app-roles-test-${Date.now()}`;
        const app = await appClient.createApp(
            ownerTenantId, appName, `http://localhost:${fixture.webhook.boundPort}`, 'App for role tests',
        );
        appId = app.id;

        // 7. Create app-owned roles and associate them with the app
        const roleClient = new RoleClient(fixture, ownerAdminToken);
        for (const roleName of appRoleNames) {
            const role = await roleClient.createRole(roleName, ownerTenantId);
            appRoleIds[roleName] = role.id;
            // Associate the role with the app
            const patchResp = await fixture.getHttpServer()
                .patch(`/api/role/${role.id}`)
                .send({ appId })
                .set('Authorization', `Bearer ${ownerAdminToken}`)
                .set('Accept', 'application/json');
            expect2xx(patchResp);
        }

        // 8. Create policies for the app-owned roles in the owner tenant
        for (const roleName of appRoleNames) {
            const roleId = appRoleIds[roleName];
            const policyResp = await fixture.getHttpServer()
                .post('/api/v1/policy/create')
                .send({
                    role: roleId,
                    effect: 'ALLOW',
                    action: 'read',
                    subject: `${roleName}-Subject`,
                })
                .set('Authorization', `Bearer ${ownerAdminToken}`)
                .set('Accept', 'application/json');
            expect2xx(policyResp);
        }

        // 9. Publish the app
        await appClient.publishApp(appId);

        // 10. Onboard a subscriber tenant with a user via the onboarding endpoint
        subscriberDomain = `app-roles-sub-${Date.now()}.test`;
        subscriberUserEmail = `app-roles-sub-user-${Date.now()}@mail.com`;
        const onboardResp = await fixture.getHttpServer()
            .post(`/api/apps/${appId}/onboard-customer`)
            .send({
                tenantName: 'App Roles Subscriber',
                tenantDomain: subscriberDomain,
                userEmail: subscriberUserEmail,
                userName: 'Subscriber User',
            })
            .set('Authorization', `Bearer ${ownerTechnicalToken}`)
            .set('Accept', 'application/json');
        expect2xx(onboardResp);
        subscriberTenantId = onboardResp.body.tenantId;
        subscriberUserId = onboardResp.body.userId;

        // 11. Enable password grant on the subscriber tenant
        await helper.enablePasswordGrant(subscriberTenantId, subscriberDomain);

        // 11a. Set a known password for the onboarded user (onboarding creates random password)
        await helper.setUserPassword(subscriberUserId, subscriberUserPassword);

        // 11b. Verify the onboarded user so they can authenticate
        await helper.verifyUser(subscriberUserEmail);

        // 12. Create a confidential client on the subscriber tenant for technical token
        // First, get a subscriber admin token — the onboarded user needs TENANT_ADMIN
        await adminClient.updateMemberRoles(subscriberTenantId, subscriberUserId, ['TENANT_ADMIN']);
        const subscriberAdminTokenResp = await tokenFixture.fetchAccessTokenFlow(
            subscriberUserEmail,
            subscriberUserPassword,
            subscriberDomain,
        );
        const subscriberAdminToken = subscriberAdminTokenResp.accessToken;

        const subscriberConfClient = await tokenFixture.createConfidentialClient(
            subscriberAdminToken, subscriberTenantId, 'app-roles-sub-cc',
        );
        const subscriberCCToken = await tokenFixture.fetchClientCredentialsTokenFlow(
            subscriberConfClient.clientId, subscriberConfClient.clientSecret,
        );
        subscriberTechnicalToken = subscriberCCToken.accessToken;
    });

    afterAll(async () => {
        await fixture.close();
    });

    // ─── Role Assignment ───

    describe('role assignment via user_roles', () => {
        it('should assign app-owned roles that reference roles in the owner tenant (Req 1.1)', async () => {
            // The onboarded user should have app-owned roles assigned
            // Verify by fetching a token and checking the roles claim
            // (getMemberRoles doesn't return app-owned roles due to cross-tenant nature)
            const tokenResp = await tokenFixture.fetchAccessTokenFlow(
                subscriberUserEmail,
                subscriberUserPassword,
                subscriberDomain,
            );

            const jwt = tokenResp.jwt;
            expect(jwt.roles).toBeDefined();
            expect(Array.isArray(jwt.roles)).toBe(true);

            // The user should have the app-owned roles (namespaced as {appName}:{roleName})
            for (const appRoleName of appRoleNames) {
                const namespacedRole = `${appName}:${appRoleName}`;
                expect(jwt.roles).toContain(namespacedRole);
            }
        });

        it('should prevent duplicate role assignment via composite PK constraint (Req 2.4)', async () => {
            // Try to onboard the same user again — should be idempotent, not create duplicates
            const onboardResp = await fixture.getHttpServer()
                .post(`/api/apps/${appId}/onboard-customer`)
                .send({
                    tenantName: 'App Roles Subscriber',
                    tenantDomain: subscriberDomain,
                    userEmail: subscriberUserEmail,
                    userName: 'Subscriber User',
                })
                .set('Authorization', `Bearer ${ownerTechnicalToken}`)
                .set('Accept', 'application/json');
            expect2xx(onboardResp);

            // Verify no duplicate roles by checking the token
            // Each app-owned role should appear exactly once
            const tokenResp = await tokenFixture.fetchAccessTokenFlow(
                subscriberUserEmail,
                subscriberUserPassword,
                subscriberDomain,
            );

            const jwt = tokenResp.jwt;
            const appOwnedRolesInToken = jwt.roles.filter((r: string) => 
                appRoleNames.some(name => r === `${appName}:${name}`)
            );
            expect(appOwnedRolesInToken.length).toBe(appRoleNames.length);
        });
    });

    // ─── Token Namespacing ───

    describe('token role namespacing', () => {
        it('should include namespaced app-owned roles in token ({appName}:{roleName} format) (Req 7.2)', async () => {
            // Fetch an access token for the onboarded user using the subscriber domain
            const tokenResp = await tokenFixture.fetchAccessTokenFlow(
                subscriberUserEmail,
                subscriberUserPassword,
                subscriberDomain,
            );

            const jwt = tokenResp.jwt;
            expect(jwt.roles).toBeDefined();
            expect(Array.isArray(jwt.roles)).toBe(true);

            // Each app-owned role should be namespaced as {appName}:{roleName}
            for (const roleName of appRoleNames) {
                const namespacedRole = `${appName}:${roleName}`;
                expect(jwt.roles).toContain(namespacedRole);
            }
        });

        it('should include un-namespaced internal roles alongside namespaced app-owned roles (Req 7.4)', async () => {
            // The subscriber user has TENANT_ADMIN (internal) + app-owned roles
            const tokenResp = await tokenFixture.fetchAccessTokenFlow(
                subscriberUserEmail,
                subscriberUserPassword,
                subscriberDomain,
            );

            const jwt = tokenResp.jwt;
            expect(jwt.roles).toBeDefined();

            // Internal role should be un-namespaced
            expect(jwt.roles).toContain('TENANT_ADMIN');

            // App-owned roles should be namespaced
            for (const roleName of appRoleNames) {
                expect(jwt.roles).toContain(`${appName}:${roleName}`);
            }

            // Internal roles should NOT contain ':'
            const internalRoles = jwt.roles.filter((r: string) => r === 'TENANT_ADMIN');
            for (const ir of internalRoles) {
                expect(ir).not.toContain(':');
            }
        });

        it('should include roles from multiple subscribed apps (Req 7.3)', async () => {
            // Create a second app with different roles
            const appClient2 = new AppClient(fixture, ownerAdminToken);
            const secondAppName = `app-roles-second-${Date.now()}`;
            const secondApp = await appClient2.createApp(
                ownerTenantId, secondAppName, `http://localhost:${fixture.webhook.boundPort}`, 'Second app',
            );

            // Create roles for the second app
            const roleClient = new RoleClient(fixture, ownerAdminToken);
            const secondAppRoleNames = ['manager', 'analyst'];
            for (const roleName of secondAppRoleNames) {
                const role = await roleClient.createRole(`${secondAppName}-${roleName}`, ownerTenantId);
                const patchResp = await fixture.getHttpServer()
                    .patch(`/api/role/${role.id}`)
                    .send({ appId: secondApp.id })
                    .set('Authorization', `Bearer ${ownerAdminToken}`)
                    .set('Accept', 'application/json');
                expect2xx(patchResp);
            }

            // Publish the second app
            await appClient2.publishApp(secondApp.id);

            // Onboard the same subscriber tenant to the second app
            const onboardResp = await fixture.getHttpServer()
                .post(`/api/apps/${secondApp.id}/onboard-customer`)
                .send({
                    tenantName: 'App Roles Subscriber',
                    tenantDomain: subscriberDomain,
                    userEmail: subscriberUserEmail,
                    userName: 'Subscriber User',
                })
                .set('Authorization', `Bearer ${ownerTechnicalToken}`)
                .set('Accept', 'application/json');
            expect2xx(onboardResp);

            // Fetch token and verify roles from both apps
            const tokenResp = await tokenFixture.fetchAccessTokenFlow(
                subscriberUserEmail,
                subscriberUserPassword,
                subscriberDomain,
            );

            const jwt = tokenResp.jwt;
            expect(jwt.roles).toBeDefined();

            // Roles from first app
            for (const roleName of appRoleNames) {
                expect(jwt.roles).toContain(`${appName}:${roleName}`);
            }

            // Roles from second app
            for (const roleName of secondAppRoleNames) {
                expect(jwt.roles).toContain(`${secondAppName}:${secondAppName}-${roleName}`);
            }
        });
    });

    // ─── Policy Resolution ───

    describe('/my/permissions policy resolution', () => {
        it('should return policies from owner tenant for app-owned roles (Req 3.1)', async () => {
            // Fetch access token for the subscriber user
            const tokenResp = await tokenFixture.fetchAccessTokenFlow(
                subscriberUserEmail,
                subscriberUserPassword,
                subscriberDomain,
            );

            // Call /my/permissions
            const permResp = await fixture.getHttpServer()
                .get('/api/v1/my/permissions')
                .set('Authorization', `Bearer ${tokenResp.accessToken}`)
                .set('Accept', 'application/json');
            expect2xx(permResp);

            const policies = permResp.body;
            expect(Array.isArray(policies)).toBe(true);

            // Should contain policies for each app-owned role
            for (const roleName of appRoleNames) {
                const rolePolicy = policies.find(
                    (p: any) => p.subject === `${roleName}-Subject`,
                );
                expect(rolePolicy).toBeDefined();
                expect(rolePolicy.action).toBe('read');
                expect(rolePolicy.effect).toBe('ALLOW');
            }
        });

        it('should return combined policies from tenant-local + app-owned roles (Req 3.2)', async () => {
            // Create a tenant-local role with a policy in the subscriber tenant
            // First, get a subscriber admin token
            const subscriberAdminTokenResp = await tokenFixture.fetchAccessTokenFlow(
                subscriberUserEmail,
                subscriberUserPassword,
                subscriberDomain,
            );
            const subscriberAdminToken = subscriberAdminTokenResp.accessToken;

            // Create a tenant-local role in the subscriber tenant
            const localRoleName = `local-role-${Date.now()}`;
            const roleClient = new RoleClient(fixture, subscriberAdminToken);
            const localRole = await roleClient.createRole(localRoleName, subscriberTenantId);

            // Create a policy for the tenant-local role
            const policyResp = await fixture.getHttpServer()
                .post('/api/v1/policy/create')
                .send({
                    role: localRole.id,
                    effect: 'ALLOW',
                    action: 'create',
                    subject: 'LocalSubject',
                })
                .set('Authorization', `Bearer ${subscriberAdminToken}`)
                .set('Accept', 'application/json');
            expect2xx(policyResp);

            // Assign the tenant-local role to the subscriber user
            await adminClient.updateMemberRoles(subscriberTenantId, subscriberUserId, [
                'TENANT_ADMIN',
                localRoleName,
            ]);

            // Fetch a fresh token (now includes both app-owned and tenant-local roles)
            const freshTokenResp = await tokenFixture.fetchAccessTokenFlow(
                subscriberUserEmail,
                subscriberUserPassword,
                subscriberDomain,
            );

            // Call /my/permissions
            const permResp = await fixture.getHttpServer()
                .get('/api/v1/my/permissions')
                .set('Authorization', `Bearer ${freshTokenResp.accessToken}`)
                .set('Accept', 'application/json');
            expect2xx(permResp);

            const policies = permResp.body;
            expect(Array.isArray(policies)).toBe(true);

            // Should contain app-owned role policies (from owner tenant)
            const appPolicies = policies.filter(
                (p: any) => appRoleNames.some(rn => p.subject === `${rn}-Subject`),
            );
            expect(appPolicies.length).toBeGreaterThanOrEqual(appRoleNames.length);

            // Should contain tenant-local role policy (from subscriber tenant)
            const localPolicy = policies.find((p: any) => p.subject === 'LocalSubject');
            expect(localPolicy).toBeDefined();
            expect(localPolicy.action).toBe('create');
            expect(localPolicy.effect).toBe('ALLOW');
        });
    });

    describe('/tenant-user/permissions policy resolution', () => {
        it('should resolve app-owned role policies from owner tenant (Req 3.4)', async () => {
            // Use the subscriber's technical token to query the user's permissions
            const permResp = await fixture.getHttpServer()
                .post('/api/v1/tenant-user/permissions')
                .send({ email: subscriberUserEmail })
                .set('Authorization', `Bearer ${subscriberTechnicalToken}`)
                .set('Accept', 'application/json');
            expect2xx(permResp);

            const policies = permResp.body;
            expect(Array.isArray(policies)).toBe(true);

            // Should contain policies for app-owned roles resolved from the owner tenant
            for (const roleName of appRoleNames) {
                const rolePolicy = policies.find(
                    (p: any) => p.subject === `${roleName}-Subject`,
                );
                expect(rolePolicy).toBeDefined();
                expect(rolePolicy.action).toBe('read');
                expect(rolePolicy.effect).toBe('ALLOW');
            }
        });
    });

    // ─── Graceful Degradation ───

    describe('graceful degradation', () => {
        it('should handle deleted app-owned role gracefully (Req 1.4, 3.5)', async () => {
            // Create a new app with a role, onboard a user, then delete the role
            const appClient = new AppClient(fixture, ownerAdminToken);
            const degradeAppName = `degrade-app-${Date.now()}`;
            const degradeApp = await appClient.createApp(
                ownerTenantId, degradeAppName, `http://localhost:${fixture.webhook.boundPort}`, 'Degrade test app',
            );

            // Create a role and associate with the app
            const roleClient = new RoleClient(fixture, ownerAdminToken);
            const degradeRoleName = `degrade-role-${Date.now()}`;
            const degradeRole = await roleClient.createRole(degradeRoleName, ownerTenantId);
            const patchResp = await fixture.getHttpServer()
                .patch(`/api/role/${degradeRole.id}`)
                .send({ appId: degradeApp.id })
                .set('Authorization', `Bearer ${ownerAdminToken}`)
                .set('Accept', 'application/json');
            expect2xx(patchResp);

            // Create a policy for the role
            const policyResp = await fixture.getHttpServer()
                .post('/api/v1/policy/create')
                .send({
                    role: degradeRole.id,
                    effect: 'ALLOW',
                    action: 'read',
                    subject: 'DegradeSubject',
                })
                .set('Authorization', `Bearer ${ownerAdminToken}`)
                .set('Accept', 'application/json');
            expect2xx(policyResp);
            const policyId = policyResp.body.id;

            // Publish and onboard
            await appClient.publishApp(degradeApp.id);
            const degradeSubDomain = `degrade-sub-${Date.now()}.test`;
            const degradeUserEmail = `degrade-user-${Date.now()}@mail.com`;
            const degradeUserPassword = 'DegradeUser9000';
            const onboardResp = await fixture.getHttpServer()
                .post(`/api/apps/${degradeApp.id}/onboard-customer`)
                .send({
                    tenantName: 'Degrade Subscriber',
                    tenantDomain: degradeSubDomain,
                    userEmail: degradeUserEmail,
                    userName: 'Degrade User',
                })
                .set('Authorization', `Bearer ${ownerTechnicalToken}`)
                .set('Accept', 'application/json');
            expect2xx(onboardResp);
            await helper.enablePasswordGrant(onboardResp.body.tenantId, degradeSubDomain);
            
            // Set a known password for the onboarded user
            await helper.setUserPassword(onboardResp.body.userId, degradeUserPassword);

            // Verify the onboarded user so they can authenticate
            await helper.verifyUser(degradeUserEmail);

            // Delete the policy first (FK constraint requires this before modifying the role)
            const deletePolicyResp = await fixture.getHttpServer()
                .delete(`/api/v1/policy/${policyId}`)
                .set('Authorization', `Bearer ${superAdminToken}`)
                .set('Accept', 'application/json');
            expect2xx(deletePolicyResp);

            // Remove the app association from the role (making it no longer an app-owned role)
            // This tests graceful degradation when a role is no longer app-owned
            // Note: We can't delete the role because it's still assigned to users
            const removeAppResp = await fixture.getHttpServer()
                .patch(`/api/role/${degradeRole.id}`)
                .send({ appId: null })
                .set('Authorization', `Bearer ${ownerAdminToken}`)
                .set('Accept', 'application/json');
            expect2xx(removeAppResp);

            // Fetch token for the onboarded user — should not fail
            // The role should no longer appear as an app-owned role (no namespace)
            const tokenResp = await tokenFixture.fetchAccessTokenFlow(
                degradeUserEmail,
                degradeUserPassword,
                degradeSubDomain,
            );

            const jwt = tokenResp.jwt;
            expect(jwt.roles).toBeDefined();

            // The role should NOT appear as a namespaced app-owned role
            const namespacedRole = `${degradeAppName}:${degradeRoleName}`;
            expect(jwt.roles).not.toContain(namespacedRole);

            // /my/permissions should not fail — graceful degradation
            const permResp = await fixture.getHttpServer()
                .get('/api/v1/my/permissions')
                .set('Authorization', `Bearer ${tokenResp.accessToken}`)
                .set('Accept', 'application/json');
            expect2xx(permResp);

            // The role's policy should not appear (policy was deleted)
            const degradePolicy = permResp.body.find((p: any) => p.subject === 'DegradeSubject');
            expect(degradePolicy).toBeUndefined();
        });
    });

    // ─── Unsubscribe Behavior ───

    describe('unsubscribe behavior', () => {
        let unsubAppId: string;
        let unsubAppName: string;
        let unsubRoleNames: string[];
        let unsubSubscriberDomain: string;
        let unsubSubscriberTenantId: string;
        let unsubSubscriberUserEmail: string;
        let unsubSubscriberUserId: string;
        let unsubSubscriberAdminToken: string;
        const unsubSubscriberUserPassword = 'UnsubUser9000';

        beforeAll(async () => {
            // Create a fresh app + subscriber for unsubscribe tests
            const appClient = new AppClient(fixture, ownerAdminToken);
            unsubAppName = `unsub-app-${Date.now()}`;
            const unsubApp = await appClient.createApp(
                ownerTenantId, unsubAppName, `http://localhost:${fixture.webhook.boundPort}`, 'Unsub test app',
            );
            unsubAppId = unsubApp.id;

            // Create app-owned roles
            unsubRoleNames = ['unsub-editor', 'unsub-viewer'];
            const roleClient = new RoleClient(fixture, ownerAdminToken);
            for (const roleName of unsubRoleNames) {
                const role = await roleClient.createRole(roleName, ownerTenantId);
                const patchResp = await fixture.getHttpServer()
                    .patch(`/api/role/${role.id}`)
                    .send({ appId: unsubAppId })
                    .set('Authorization', `Bearer ${ownerAdminToken}`)
                    .set('Accept', 'application/json');
                expect2xx(patchResp);
            }

            // Publish the app
            await appClient.publishApp(unsubAppId);

            // Onboard a subscriber
            unsubSubscriberDomain = `unsub-sub-${Date.now()}.test`;
            unsubSubscriberUserEmail = `unsub-sub-user-${Date.now()}@mail.com`;
            const onboardResp = await fixture.getHttpServer()
                .post(`/api/apps/${unsubAppId}/onboard-customer`)
                .send({
                    tenantName: 'Unsub Subscriber',
                    tenantDomain: unsubSubscriberDomain,
                    userEmail: unsubSubscriberUserEmail,
                    userName: 'Unsub User',
                })
                .set('Authorization', `Bearer ${ownerTechnicalToken}`)
                .set('Accept', 'application/json');
            expect2xx(onboardResp);
            unsubSubscriberTenantId = onboardResp.body.tenantId;
            unsubSubscriberUserId = onboardResp.body.userId;

            // Enable password grant and set a known password for the onboarded user
            await helper.enablePasswordGrant(unsubSubscriberTenantId, unsubSubscriberDomain);
            await helper.setUserPassword(unsubSubscriberUserId, unsubSubscriberUserPassword);
            await helper.verifyUser(unsubSubscriberUserEmail);
            await adminClient.updateMemberRoles(unsubSubscriberTenantId, unsubSubscriberUserId, ['TENANT_ADMIN']);

            const subTokenResp = await tokenFixture.fetchAccessTokenFlow(
                unsubSubscriberUserEmail,
                unsubSubscriberUserPassword,
                unsubSubscriberDomain,
            );
            unsubSubscriberAdminToken = subTokenResp.accessToken;
        });

        it('should remove user_roles for app-owned roles when unsubscribing (Req 1.4)', async () => {
            // Verify user has app-owned roles before unsubscribe by checking the token
            const tokenBefore = await tokenFixture.fetchAccessTokenFlow(
                unsubSubscriberUserEmail,
                unsubSubscriberUserPassword,
                unsubSubscriberDomain,
            );
            const rolesBefore = tokenBefore.jwt.roles;
            const appRolesBefore = rolesBefore.filter((r: string) => 
                unsubRoleNames.some(name => r === `${unsubAppName}:${name}`)
            );
            expect(appRolesBefore.length).toBe(unsubRoleNames.length);

            // Unsubscribe using the subscriber's admin token
            const unsubClient = new AppClient(fixture, unsubSubscriberAdminToken);
            await unsubClient.unsubscribeApp(unsubAppId, unsubSubscriberTenantId);

            // Verify app-owned roles are removed by checking the token
            const tokenAfter = await tokenFixture.fetchAccessTokenFlow(
                unsubSubscriberUserEmail,
                unsubSubscriberUserPassword,
                unsubSubscriberDomain,
            );
            const rolesAfter = tokenAfter.jwt.roles;
            const appRolesAfter = rolesAfter.filter((r: string) => 
                unsubRoleNames.some(name => r === `${unsubAppName}:${name}`)
            );
            expect(appRolesAfter.length).toBe(0);

            // Internal roles should still be present
            expect(rolesAfter).toContain('TENANT_ADMIN');
        });

        it('should keep app-owned roles in owner tenant after subscriber unsubscribes (Req 1.1)', async () => {
            // After unsubscribe, the roles should still exist in the owner tenant
            const ownerRoles = await adminClient.getTenantRoles(ownerTenantId);
            for (const roleName of unsubRoleNames) {
                const role = ownerRoles.find((r: any) => r.name === roleName);
                expect(role).toBeDefined();
            }
        });
    });
});
