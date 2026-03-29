/**
 * Feature: casl-internal-external-separation
 *
 * Integration tests for the internal and external permissions endpoints,
 * plus a regression test for the tenant-user permissions endpoint.
 *
 * Property 7: Internal permissions endpoint returns internal-only rules
 * Property 8: External permissions endpoint returns only custom role policies
 * Validates: Requirements 3.3, 3.5, 4.1, 4.2, 4.4, 4.7, 7.1, 7.2
 */
import {SharedTestFixture} from "../shared-test.fixture";
import {PolicyClient} from "../api-client/policy-client";
import {TokenFixture} from "../token.fixture";
import {TenantClient} from "../api-client/tenant-client";
import {UsersClient} from "../api-client/user-client";
import {Action, Effect} from "../../src/casl/actions.enum";

describe('Permissions Endpoints (e2e)', () => {
    let app: SharedTestFixture;
    let tokenFixture: TokenFixture;

    beforeAll(async () => {
        app = new SharedTestFixture();
        tokenFixture = new TokenFixture(app);
    });

    afterAll(async () => {
        await app.close();
    });

    // --- Helpers ----------------------------------------------------

    async function setupCustomRoleWithPolicy(email: string, pass: string, domain: string, roleName: string, policy: { subject: string, action: Action, effect: Effect, conditions: any }) {
        const adminToken = await tokenFixture.fetchAccessToken(email, pass, domain);
        const tenantClient = new TenantClient(app, adminToken.accessToken);
        const usersClient = new UsersClient(app, adminToken.accessToken);
        const policyClient = new PolicyClient(app, adminToken.accessToken);

        const user = await usersClient.getMe();
        const tenant = await tenantClient.getTenantDetails(null);

        // Check if role already exists
        const roles = await tenantClient.getTenantRoles(tenant.id);
        let customRole = roles.find(r => r.name === roleName);

        if (!customRole) {
            // Create a custom role
            customRole = await tenantClient.createRole(tenant.id, roleName);
        }

        // Attach a policy
        await policyClient.createAuthorization(
            customRole.id,
            policy.effect,
            policy.action,
            policy.subject,
            policy.conditions
        );

        // Assign the custom role to the user (keep existing roles)
        const existingRoles = await tenantClient.getMemberRoles(tenant.id, user.id);
        if (!existingRoles.find(r => r.name === roleName)) {
            const allRoleNames = [...existingRoles.map(r => r.name), roleName];
            await tenantClient.updateMemberRoles(tenant.id, user.id, allRoleNames);
        }

        return {
            adminToken,
            tenantClient,
            usersClient,
            policyClient,
            user,
            tenant,
            customRole,
            originalRoleNames: existingRoles.map(r => r.name)
        };
    }

    // ─── 8.1: GET /my/internal-permissions ───────────────────────────

    describe('GET /my/internal-permissions', () => {

        it('returns CASL rules with Read grants for TENANT_VIEWER token', async () => {
            // arrange
            // admin@auth.server.com has SUPER_ADMIN, TENANT_ADMIN, TENANT_VIEWER
            const superToken = await tokenFixture.fetchAccessToken(
                "admin@auth.server.com", "admin9000", "auth.server.com"
            );
            const policyClient = new PolicyClient(app, superToken.accessToken);

            // act
            const permissions = await policyClient.getMyInternalPermissions();

            // assert
            expect(Array.isArray(permissions)).toBe(true);
            expect(permissions.length).toBeGreaterThan(0);

            // TENANT_VIEWER contributes Read rules for tenant resources
            const readRules = permissions.filter(r => r.action === "read");
            const readSubjects = readRules.map(r => r.subject);
            expect(readSubjects).toContain("Tenant");

            // User self-management (Manage on User)
            const manageUser = permissions.find(
                r => r.subject === "User" && r.action === "manage" && !r.inverted
            );
            expect(manageUser).toBeDefined();

            // SUPER_ADMIN on super domain grants manage all
            const manageAll = permissions.find(
                r => r.action === "manage" && r.subject === "all"
            );
            expect(manageAll).toBeDefined();
        });

        it('returns CASL rules with Manage grants for TENANT_ADMIN token', async () => {
            // arrange
            const adminToken = await tokenFixture.fetchAccessToken(
                "admin@shire.local", "admin9000", "shire.local"
            );
            const policyClient = new PolicyClient(app, adminToken.accessToken);

            // act
            const permissions = await policyClient.getMyInternalPermissions();

            // assert
            expect(Array.isArray(permissions)).toBe(true);
            expect(permissions.length).toBeGreaterThan(0);

            // TENANT_ADMIN should have Manage on TenantMember, Role, Policy, Client
            const manageRules = permissions.filter(r => r.action === "manage");
            const managedSubjects = manageRules.map(r => r.subject);
            expect(managedSubjects).toContain("TenantMember");
            expect(managedSubjects).toContain("Role");
            expect(managedSubjects).toContain("Policy");
            expect(managedSubjects).toContain("Client");

            // Should have read-credential on Tenant (Action.ReadCredentials = "read-credential")
            const readCreds = permissions.find(
                r => r.subject === "Tenant" && r.action === "read-credential"
            );
            expect(readCreds).toBeDefined();
        });

        it('returns 401 without JWT', async () => {
            // act
            const response = await app.getHttpServer()
                .get('/api/v1/my/internal-permissions')
                .set('Accept', 'application/json');

            // assert
            expect(response.status).toBe(401);
        });

        it('each rule has action and subject fields', async () => {
            // arrange
            const adminToken = await tokenFixture.fetchAccessToken(
                "admin@shire.local", "admin9000", "shire.local"
            );
            const policyClient = new PolicyClient(app, adminToken.accessToken);

            // act
            const permissions = await policyClient.getMyInternalPermissions();

            // assert
            for (const rule of permissions) {
                expect(rule.action).toBeDefined();
                expect(rule.subject).toBeDefined();
            }
        });
    });

    // ─── 8.2: GET /my/permissions (external, custom roles only) ──────

    describe('GET /my/permissions', () => {

        it('returns Policy entities for token with custom roles that have policies', async () => {
            // arrange
            const customRoleName = `custom-perm-${Date.now()}`;
            const state = await setupCustomRoleWithPolicy(
                "admin@auth.server.com", "admin9000", "auth.server.com",
                customRoleName,
                { subject: "invoices", action: Action.Read, effect: Effect.ALLOW, conditions: { region: "EU" } }
            );

            // Re-fetch token so it includes the new custom role
            const freshToken = await tokenFixture.fetchAccessToken(
                "admin@auth.server.com", "admin9000", "auth.server.com"
            );
            const freshPolicyClient = new PolicyClient(app, freshToken.accessToken);

            // act
            const myPermissions = await freshPolicyClient.getMyPermission();

            // assert
            expect(Array.isArray(myPermissions)).toBe(true);
            expect(myPermissions.length).toBeGreaterThan(0);

            const invoicePolicy = myPermissions.find(p => p.subject === "invoices");
            expect(invoicePolicy).toBeDefined();
            expect(invoicePolicy.action).toBe(Action.Read);
            expect(invoicePolicy.effect).toBe(Effect.ALLOW);
            expect(invoicePolicy.conditions).toBeDefined();
            expect(invoicePolicy.conditions.region).toBe("EU");

            // cleanup
            await state.tenantClient.updateMemberRoles(
                state.tenant.id, state.user.id, state.originalRoleNames
            );
        });

        it('returns empty array for token with only internal roles', async () => {
            // arrange
            const adminToken = await tokenFixture.fetchAccessToken(
                "admin@auth.server.com", "admin9000", "auth.server.com"
            );
            const policyClient = new PolicyClient(app, adminToken.accessToken);

            // act
            const myPermissions = await policyClient.getMyPermission();

            // assert
            expect(Array.isArray(myPermissions)).toBe(true);
            expect(myPermissions.length).toBe(0);
        });

        it('returns empty array when user has no custom roles', async () => {
            // arrange
            const adminToken = await tokenFixture.fetchAccessToken(
                "admin@auth.server.com", "admin9000", "auth.server.com"
            );
            const policyClient = new PolicyClient(app, adminToken.accessToken);

            // act
            const myPermissions = await policyClient.getMyPermission();

            // assert
            expect(Array.isArray(myPermissions)).toBe(true);
            expect(myPermissions.length).toBe(0);
        });

        it('returns 401 without JWT', async () => {
            // act
            const response = await app.getHttpServer()
                .get('/api/v1/my/permissions')
                .set('Accept', 'application/json');

            // assert
            expect(response.status).toBe(401);
        });
    });

    // ─── 8.3: POST /tenant-user/permissions (regression) ────────────

    describe('POST /tenant-user/permissions (regression)', () => {

        it('returns raw Policy entities for TechnicalToken + email', async () => {
            // arrange
            const state = await setupCustomRoleWithPolicy(
                "admin@perm-test.local", "admin9000", "perm-test.local",
                "CustomTestRole",
                { subject: "secure-resource", action: Action.Read, effect: Effect.ALLOW, conditions: { public: false } }
            );

            // Get client credentials for the tenant
            const credential = await state.tenantClient.getTenantCredentials(state.tenant.id);
            const ccToken = await tokenFixture.fetchClientCredentialsToken(
                credential.clientId,
                credential.clientSecret
            );

            // act
            const techPolicyClient = new PolicyClient(app, ccToken.accessToken);
            const policies = await techPolicyClient.getTenantPermissions("admin@perm-test.local");

            // assert
            expect(Array.isArray(policies)).toBe(true);
            expect(policies.length).toBeGreaterThan(0);

            const found = policies.find(p => p.subject === "secure-resource");
            expect(found).toBeDefined();
            expect(found.action).toBe(Action.Read);
            expect(found.effect).toBe(Effect.ALLOW);
            expect(found.conditions).toBeDefined();
            expect(found.conditions.public).toBe(false);

            // cleanup
            await state.tenantClient.updateMemberRoles(
                state.tenant.id, state.user.id, state.originalRoleNames
            );
        });
    });
});
