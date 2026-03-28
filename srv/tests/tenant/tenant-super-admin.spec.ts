/**
 * Tests the full tenant CRUD lifecycle from a super admin's perspective.
 *
 * Covers: create tenant, read details/credentials/roles, update tenant,
 * create/delete roles, add/remove members, update member roles, delete tenant,
 * and list all tenants. All operations use the admin API (cross-tenant).
 */
import {SharedTestFixture} from "../shared-test.fixture";
import {TokenFixture} from "../token.fixture";
import {TenantClient} from "../api-client/tenant-client";
import {AdminTenantClient} from "../api-client/admin-tenant-client";

describe("E2E Tenant Management", () => {
    let app: SharedTestFixture;
    let tenant: any;
    let tenantClient: TenantClient;
    let adminClient: AdminTenantClient;

    // Helper to check for valid UUID
    const expectUuid = (item: string) =>
        expect(item).toMatch(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/);

    beforeAll(async () => {
        app = new SharedTestFixture();
        const tokenFixture = new TokenFixture(app);
        const response = await tokenFixture.fetchAccessToken(
            "admin@auth.server.com", "admin9000", "auth.server.com"
        );
        tenantClient = new TenantClient(app, response.accessToken);
        adminClient = new AdminTenantClient(app, response.accessToken);
    });

    afterAll(async () => {
        await app.close();
    });

    it("should execute all tenant operations sequentially", async () => {
        // 1) Create Tenant
        tenant = await tenantClient.createTenant("tenant-1", "test-website.com");
        expect(tenant.id).toBeDefined();

        // 2) Get Tenant Details (cross-tenant → admin route)
        let tenantDetails = await adminClient.getTenant(tenant.id);
        expect(tenantDetails.id).toEqual(tenant.id);
        expect(tenantDetails.name).toEqual("tenant-1");
        expect(tenantDetails.domain).toEqual("test-website.com");
        expect(tenantDetails.clientId).toBeDefined();

        // Verify members array
        expect(Array.isArray(tenantDetails.members)).toBe(true);
        expect(tenantDetails.members.length).toBeGreaterThanOrEqual(1);
        expectUuid(tenantDetails.members[0].id);
        expect(tenantDetails.members[0].email).toEqual("admin@auth.server.com");

        // Verify roles array
        expect(Array.isArray(tenantDetails.roles)).toBe(true);
        expect(tenantDetails.roles.length).toBeGreaterThanOrEqual(2);
        expect(tenantDetails.roles[0].name).toEqual("TENANT_ADMIN");
        expect(tenantDetails.roles[1].name).toEqual("TENANT_VIEWER");

        // 3) Get Tenant Credentials
        let tenantCred = await adminClient.getTenantCredentials(tenant.id);
        expect(tenantCred.clientId).toBeDefined();
        expect(tenantCred.publicKey).toBeDefined();

        // 4) Get Tenant Roles
        let roles = await adminClient.getTenantRoles(tenant.id);
        expect(Array.isArray(roles)).toBe(true);
        expect(roles.length).toBeGreaterThanOrEqual(2);

        // 5) Update Tenant
        let updatedTenant = await adminClient.updateTenant(tenant.id, {name: "updated-tenant-1"});
        expect(updatedTenant.id).toEqual(tenant.id);
        expect(updatedTenant.name).toEqual("updated-tenant-1");

        // 6) Verify Update
        let updatedDetails = await adminClient.getTenant(tenant.id);
        expect(updatedDetails.name).toEqual("updated-tenant-1");

        // 7) Create Role
        let newRole = await adminClient.createRole(tenant.id, "auditor");
        expect(newRole.name).toEqual("auditor");

        // 8) Verify Role Added
        let rolesAfterAdd = await adminClient.getTenantRoles(tenant.id);
        expect(rolesAfterAdd.find((r: any) => r.name === "auditor")).toBeDefined();

        // 9) Add Members
        let addResult = await adminClient.addMembers(tenant.id, ["legolas@mail.com"]);
        expect(addResult.id).toEqual(tenant.id);
        expect(addResult.members.map((m: any) => m.email)).toContain("legolas@mail.com");
        let legolasId = addResult.members.find((m: any) => m.email === "legolas@mail.com").id;

        // 10) Get Members
        let members = await adminClient.getTenantMembers(tenant.id);
        expect(members.length).toBeGreaterThanOrEqual(2);

        // 11) Update Member Roles
        await adminClient.updateMemberRoles(tenant.id, legolasId, ["TENANT_VIEWER", "auditor"]);

        // 12) Verify Member Roles
        let memberRoles = await adminClient.getMemberRoles(tenant.id, legolasId);
        expect(memberRoles.map((r: any) => r.name)).toContain("auditor");

        // 13) Remove Member
        let removeResult = await adminClient.removeMembers(tenant.id, ["legolas@mail.com"]);
        expect(removeResult.id).toEqual(tenant.id);

        // 14) Verify Member Removed
        let membersAfter = await adminClient.getTenantMembers(tenant.id);
        expect(membersAfter.find((m: any) => m.email === "legolas@mail.com")).toBeUndefined();

        // 15) Remove Role
        let removedRole = await adminClient.deleteRole(tenant.id, "auditor");
        expect(removedRole.name).toEqual("auditor");

        // 16) Verify Role Removed
        let rolesAfterRemove = await adminClient.getTenantRoles(tenant.id);
        expect(rolesAfterRemove.find((r: any) => r.name === "auditor")).toBeUndefined();

        // 17) Delete Tenant
        let deleted = await adminClient.deleteTenant(tenant.id);
        expect(deleted.name).toEqual("updated-tenant-1");

        // 18) Verify Deletion (should 404)
        try {
            await adminClient.getTenant(tenant.id);
            fail("Expected 404");
        } catch (e: any) {
            expect(e.status).toBe(404);
        }

        // 19) List All Tenants
        let allTenants = await adminClient.getAllTenants();
        expect(Array.isArray(allTenants)).toBe(true);
    });
});
