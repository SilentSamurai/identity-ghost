/**
 * Tests the TENANT_VIEWER role permissions.
 *
 * Setup: super admin creates a tenant, adds a member (legolas), assigns TENANT_VIEWER.
 * Tests verify the viewer's restricted access:
 *   - CAN: read tenant details, roles, members
 *   - CANNOT: read credentials, update tenant, create/delete roles, remove members, delete tenant, list all tenants
 */
import {SharedTestFixture} from "../shared-test.fixture";
import {TokenFixture} from "../token.fixture";
import {TenantClient} from "../api-client/tenant-client";
import {AdminTenantClient} from "../api-client/admin-tenant-client";

describe('e2e tenant viewer', () => {
    let app: SharedTestFixture;
    let viewerClient: TenantClient;
    let tenant: any;
    let tenantDomain: string;

    beforeAll(async () => {
        app = new SharedTestFixture();
        const tokenFixture = new TokenFixture(app);
        const uniqueDomain = `viewer-${Date.now()}.com`;

        // Super admin: create tenant, add member, assign TENANT_VIEWER
        const superAdminResponse = await tokenFixture.fetchAccessToken(
            "admin@auth.server.com", "admin9000", "auth.server.com"
        );
        const superAdmin = new AdminTenantClient(app, superAdminResponse.accessToken);
        const superAdminTenant = new TenantClient(app, superAdminResponse.accessToken);

        tenant = await superAdminTenant.createTenant("tenant-1", uniqueDomain);

        const addResult = await superAdmin.addMembers(tenant.id, ["legolas@mail.com"]);
        const legolasId = addResult.members.find((m: any) => m.email === "legolas@mail.com").id;
        await superAdmin.updateMemberRoles(tenant.id, legolasId, ["TENANT_VIEWER"]);

        // Log in as the tenant viewer
        const viewerResponse = await tokenFixture.fetchAccessToken(
            "legolas@mail.com", "legolas9000", uniqueDomain
        );
        viewerClient = new TenantClient(app, viewerResponse.accessToken);
        tenantDomain = uniqueDomain;
    });

    afterAll(async () => {
        await app.close();
    });

    // ─── Allowed operations ───

    it('should read tenant details', async () => {
        const details = await viewerClient.getTenantDetails(tenant.id);
        expect(details.name).toEqual("tenant-1");
        expect(details.domain).toEqual(tenantDomain);
        expect(details.clientId).toBeDefined();
    });

    it('should read tenant roles', async () => {
        const roles = await viewerClient.getTenantRoles(tenant.id);
        expect(Array.isArray(roles)).toBe(true);
        expect(roles.length).toBeGreaterThanOrEqual(2);
    });

    it('should read tenant members', async () => {
        const members = await viewerClient.getTenantMembers(tenant.id);
        expect(Array.isArray(members)).toBe(true);
        expect(members.length).toBeGreaterThanOrEqual(1);
    });

    // ─── Forbidden operations ───

    it('should be forbidden from reading credentials', async () => {
        await expect(viewerClient.getTenantCredentials(tenant.id))
            .rejects.toMatchObject({status: 403});
    });

    it('should be forbidden from updating tenant', async () => {
        await expect(viewerClient.updateTenant(tenant.id, "updated-tenant-1"))
            .rejects.toMatchObject({status: 403});
    });

    it('should be forbidden from creating a role', async () => {
        await expect(viewerClient.createRole(tenant.id, "auditor"))
            .rejects.toMatchObject({status: 403});
    });

    it('should be forbidden from removing members', async () => {
        await expect(viewerClient.removeMembers(tenant.id, ["legolas@mail.com"]))
            .rejects.toMatchObject({status: 403});
    });

    it('should be forbidden from deleting a role', async () => {
        await expect(viewerClient.deleteRole(tenant.id, "auditor"))
            .rejects.toMatchObject({status: 403});
    });

    it('should be forbidden from deleting the tenant', async () => {
        await expect(viewerClient.deleteTenant(tenant.id))
            .rejects.toMatchObject({status: 403});
    });

    it('should be forbidden from listing all tenants (admin route requires super admin)', async () => {
        const response = await app.getHttpServer()
            .get('/api/admin/tenant')
            .set('Authorization', `Bearer ${viewerClient['accessToken']}`)
            .set('Accept', 'application/json');
        expect(response.status).toBe(403);
    });
});
