/**
 * Tests the TENANT_ADMIN role permissions.
 *
 * Setup: super admin creates a tenant, adds a member (legolas), promotes them to TENANT_ADMIN.
 * Tests verify what that tenant admin can and cannot do:
 *   - CAN: read tenant details/credentials/roles/members, update tenant, create/delete roles
 *   - CANNOT: remove members, delete tenant, list all tenants
 */
import {SharedTestFixture} from "../shared-test.fixture";
import {TokenFixture} from "../token.fixture";
import {TenantClient} from "../api-client/tenant-client";
import {AdminTenantClient} from "../api-client/admin-tenant-client";

describe('e2e tenant admin', () => {
    let app: SharedTestFixture;
    let adminClient: TenantClient;
    let tenant: any;

    beforeAll(async () => {
        app = new SharedTestFixture();
        const tokenFixture = new TokenFixture(app);

        // Super admin: create tenant, add member, assign TENANT_ADMIN
        const superAdminResponse = await tokenFixture.fetchAccessToken(
            "admin@auth.server.com", "admin9000", "auth.server.com"
        );
        const superAdmin = new AdminTenantClient(app, superAdminResponse.accessToken);
        const superAdminTenant = new TenantClient(app, superAdminResponse.accessToken);

        tenant = await superAdminTenant.createTenant("tenant-1", "test-wesite.com");

        const addResult = await superAdmin.addMembers(tenant.id, ["legolas@mail.com"]);
        const legolasId = addResult.members.find((m: any) => m.email === "legolas@mail.com").id;
        await superAdmin.updateMemberRoles(tenant.id, legolasId, ["TENANT_ADMIN"]);

        // Log in as the tenant admin
        const tenantAdminResponse = await tokenFixture.fetchAccessToken(
            "legolas@mail.com", "legolas9000", "test-wesite.com"
        );
        adminClient = new TenantClient(app, tenantAdminResponse.accessToken);
    });

    afterAll(async () => {
        await app.close();
    });

    // ─── Allowed operations ───

    it('should read tenant details', async () => {
        const details = await adminClient.getTenantDetails(tenant.id);
        expect(details.name).toEqual("tenant-1");
        expect(details.domain).toEqual("test-wesite.com");
        expect(details.clientId).toBeDefined();
    });

    it('should read tenant credentials', async () => {
        const credentials = await adminClient.getTenantCredentials(tenant.id);
        expect(credentials.clientId).toBeDefined();
        expect(credentials.clientSecret).toBeDefined();
        expect(credentials.publicKey).toBeDefined();
    });

    it('should read tenant roles', async () => {
        const roles = await adminClient.getTenantRoles(tenant.id);
        expect(Array.isArray(roles)).toBe(true);
        expect(roles.length).toBeGreaterThanOrEqual(2);
    });

    it('should read tenant members', async () => {
        const members = await adminClient.getTenantMembers(tenant.id);
        expect(Array.isArray(members)).toBe(true);
        expect(members.length).toBeGreaterThanOrEqual(2);
        expect(members[0].id).toBeDefined();
        expect(members[0].name).toBeDefined();
    });

    it('should update tenant', async () => {
        const updated = await adminClient.updateTenant(tenant.id, "updated-tenant-1");
        expect(updated.clientId).toEqual(tenant.clientId);
        expect(updated.name).toEqual("updated-tenant-1");
        expect(updated.domain).toEqual("test-wesite.com");
    });

    it('should create and delete a role', async () => {
        const created = await adminClient.createRole(tenant.id, "auditor");
        expect(created).toHaveProperty('id');
        expect(created).toHaveProperty('name', "auditor");
        expect(created).toHaveProperty('removable', true);
        expect(created.tenant).toBeDefined();
        expect(Array.isArray(created.tenant.roles)).toBe(true);
        expect(Array.isArray(created.tenant.members)).toBe(true);

        const deleted = await adminClient.deleteRole(tenant.id, "auditor");
        expect(deleted).toBeDefined();
    });

    // ─── Forbidden operations ───

    it('should be forbidden from removing members', async () => {
        await expect(adminClient.removeMembers(tenant.id, ["legolas@mail.com"]))
            .rejects.toMatchObject({status: 403});
    });

    it('should be forbidden from deleting the tenant', async () => {
        await expect(adminClient.deleteTenant(tenant.id))
            .rejects.toMatchObject({status: 403});
    });

    it('should be forbidden from listing all tenants (admin route requires super admin)', async () => {
        const response = await app.getHttpServer()
            .get('/api/admin/tenant')
            .set('Authorization', `Bearer ${adminClient['accessToken']}`)
            .set('Accept', 'application/json');
        expect(response.status).toBe(403);
    });
});
