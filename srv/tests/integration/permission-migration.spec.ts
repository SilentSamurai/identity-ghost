/**
 * Integration tests verifying that the Permission.isAuthorized() migration
 * preserves existing authorization behavior.
 *
 * These tests confirm that migrated endpoints (now using @CurrentPermission()
 * and permission.isAuthorized()) enforce the same allow/deny decisions as before.
 *
 * Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8
 */
import {SharedTestFixture} from "../shared-test.fixture";
import {TokenFixture} from "../token.fixture";
import {TenantClient} from "../api-client/tenant-client";
import {AdminTenantClient} from "../api-client/admin-tenant-client";

describe('Permission migration — authorization preserved', () => {
    let app: SharedTestFixture;
    let tokenFixture: TokenFixture;

    let adminClient: TenantClient;
    let viewerClient: TenantClient;
    let superAdminClient: AdminTenantClient;

    let tenant: any;
    const tenantDomain = `perm-mig-${Date.now()}.com`;

    beforeAll(async () => {
        app = new SharedTestFixture();
        tokenFixture = new TokenFixture(app);

        // --- Super admin: create tenant, add two members ---
        const superAdminToken = await tokenFixture.fetchAccessToken(
            "admin@auth.server.com", "admin9000", "auth.server.com"
        );
        superAdminClient = new AdminTenantClient(app, superAdminToken.accessToken);
        const superTenantClient = new TenantClient(app, superAdminToken.accessToken);

        tenant = await superTenantClient.createTenant("perm-mig-tenant", tenantDomain);

        // Add legolas as a member, promote to TENANT_ADMIN
        const addResult = await superAdminClient.addMembers(tenant.id, ["legolas@mail.com"]);
        const legolasId = addResult.members.find((m: any) => m.email === "legolas@mail.com").id;
        await superAdminClient.updateMemberRoles(tenant.id, legolasId, ["TENANT_ADMIN"]);

        // Add gimli as a member with TENANT_VIEWER
        const addResult2 = await superAdminClient.addMembers(tenant.id, ["gimli@mail.com"]);
        const gimliId = addResult2.members.find((m: any) => m.email === "gimli@mail.com").id;
        await superAdminClient.updateMemberRoles(tenant.id, gimliId, ["TENANT_VIEWER"]);

        // --- Log in as TENANT_ADMIN ---
        const adminToken = await tokenFixture.fetchAccessToken(
            "legolas@mail.com", "legolas9000", tenantDomain
        );
        adminClient = new TenantClient(app, adminToken.accessToken);

        // --- Log in as TENANT_VIEWER ---
        const viewerToken = await tokenFixture.fetchAccessToken(
            "gimli@mail.com", "gimli9000", tenantDomain
        );
        viewerClient = new TenantClient(app, viewerToken.accessToken);
    });

    afterAll(async () => {
        await app.close();
    });

    // ─── TENANT_ADMIN: authorized operations (migrated to @CurrentPermission()) ───

    it('TENANT_ADMIN can read tenant members (MemberController migrated)', async () => {
        const members = await adminClient.getTenantMembers(tenant.id);
        expect(Array.isArray(members)).toBe(true);
        expect(members.length).toBeGreaterThanOrEqual(2);
    });

    it('TENANT_ADMIN can update tenant (TenantController migrated)', async () => {
        const updated = await adminClient.updateTenant(tenant.id, "perm-mig-updated");
        expect(updated.name).toEqual("perm-mig-updated");
    });

    it('TENANT_ADMIN can manage roles (RoleController migrated)', async () => {
        const created = await adminClient.createRole(tenant.id, "perm-mig-role");
        expect(created).toHaveProperty('name', "perm-mig-role");

        const deleted = await adminClient.deleteRole(tenant.id, "perm-mig-role");
        expect(deleted).toBeDefined();
    });

    // ─── TENANT_VIEWER: forbidden operations (authorization still enforced) ───

    it('TENANT_VIEWER is forbidden from updating tenant', async () => {
        await expect(viewerClient.updateTenant(tenant.id, "should-fail"))
            .rejects.toMatchObject({status: 403});
    });

    it('TENANT_VIEWER is forbidden from adding members', async () => {
        await expect(viewerClient.addMembers(tenant.id, ["nobody@mail.com"]))
            .rejects.toMatchObject({status: 403});
    });

    // ─── Unauthenticated: 401 on protected endpoints ───

    it('unauthenticated request gets 401 on tenant members endpoint', async () => {
        const response = await app.getHttpServer()
            .get('/api/tenant/my/members')
            .set('Accept', 'application/json');
        expect(response.status).toBe(401);
    });

    // ─── Super admin: admin controller operations (migrated to @CurrentPermission()) ───

    it('super admin can list all tenants via AdminTenantController', async () => {
        const tenants = await superAdminClient.getAllTenants();
        expect(Array.isArray(tenants)).toBe(true);
        expect(tenants.length).toBeGreaterThanOrEqual(1);
    });

    it('super admin can read tenant members via AdminTenantController', async () => {
        const members = await superAdminClient.getTenantMembers(tenant.id);
        expect(Array.isArray(members)).toBe(true);
        expect(members.length).toBeGreaterThanOrEqual(2);
    });
});
