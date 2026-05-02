/**
 * Tests group lifecycle: creation, role/user assignment, removal, update, and deletion.
 *
 * Uses a super admin token to create tenants and groups cross-tenant via admin routes.
 * Verifies group-level operations (add/remove roles, add/remove users) and that
 * group membership correctly propagates roles to users.
 */
import {SharedTestFixture} from "../shared-test.fixture";
import {TokenFixture} from "../token.fixture";
import {HelperFixture} from "../helper.fixture";
import {AdminTenantClient} from "../api-client/admin-tenant-client";

describe('e2e Groups Check', () => {
    let app: SharedTestFixture;
    let helper: HelperFixture;
    let adminClient: AdminTenantClient;
    let accessToken: string;
    let tenant: any;
    let group: any;

    beforeAll(async () => {
        app = new SharedTestFixture();
        const tokenFixture = new TokenFixture(app);
        const response = await tokenFixture.fetchAccessToken(
            "admin@auth.server.com", "admin9000", "auth.server.com"
        );
        accessToken = response.accessToken;
        helper = new HelperFixture(app, accessToken);
        adminClient = new AdminTenantClient(app, accessToken);

        tenant = await helper.tenant.createTenant("tenant-1", "test-web.com");
        await adminClient.createRole(tenant.id, "ABC_ROLE");
        await adminClient.createRole(tenant.id, "DEF_ROLE");
        await adminClient.addMembers(tenant.id, ["legolas@mail.com", "frodo@mail.com"]);
    });

    afterAll(async () => {
        await app.close();
    });

    it('should create a group', async () => {
        group = await helper.group.createGroup("group-1", tenant.id);
    });

    it('should list groups for tenant', async () => {
        const groups = await adminClient.getTenantGroups(tenant.id);
        expect(groups).toHaveLength(1);
        expect(groups[0].name).toEqual("group-1");
        expect(groups[0].tenantId).toEqual(tenant.id);
    });

    it('should only list groups for the requested tenant', async () => {
        const newTenant = await helper.tenant.createTenant("tenant-2", "dummy.tenant.com");
        await helper.group.createGroup("group-2", newTenant.id);

        const groups = await adminClient.getTenantGroups(tenant.id);
        expect(groups).toHaveLength(1);
        expect(groups[0].name).toEqual("group-1");
        expect(groups[0].tenantId).toEqual(tenant.id);
    });

    it('should add roles to group', async () => {
        const response = await helper.group.addRole(group.id, ["ABC_ROLE", "DEF_ROLE"]);
        expect(response.group.name).toEqual("group-1");
        expect(response.group.tenantId).toEqual(tenant.id);
        expect(response.roles).toHaveLength(2);
        for (const role of response.roles) {
            expect(role.name).toMatch(/ABC_ROLE|DEF_ROLE/);
        }
    });

    it('should propagate group roles to added user', async () => {
        const user = await helper.user.getUserByEmail("legolas@mail.com");
        await helper.group.addUser(group.id, [user.email]);
        const roles = await adminClient.getMemberRoles(tenant.id, user.id);
        for (const role of roles) {
            expect(role.name).toMatch(/ABC_ROLE|DEF_ROLE/);
        }
    });

    it('should remove group roles from removed user', async () => {
        const user = await helper.user.getUserByEmail("legolas@mail.com");
        await helper.group.removeUser(group.id, ["legolas@mail.com"]);
        const roles = await adminClient.getMemberRoles(tenant.id, user.id);
        for (const role of roles) {
            expect(role.name).not.toMatch(/ABC_ROLE|DEF_ROLE/);
        }
    });

    it('should add another user to group', async () => {
        const user = await helper.user.getUserByEmail("frodo@mail.com");
        await helper.group.addUser(group.id, ["frodo@mail.com"]);
        const roles = await adminClient.getMemberRoles(tenant.id, user.id);
        for (const role of roles) {
            expect(role.name).toMatch(/ABC_ROLE|DEF_ROLE/);
        }
    });

    it('should remove a role from group and propagate to members', async () => {
        const response = await helper.group.removeRoles(group.id, ["ABC_ROLE"]);
        expect(response.group.name).toEqual("group-1");
        expect(response.group.tenantId).toEqual(tenant.id);
        expect(response.roles).toHaveLength(1);
        expect(response.roles[0].name).toEqual("DEF_ROLE");

        const user = await helper.user.getUserByEmail("frodo@mail.com");
        const roles = await adminClient.getMemberRoles(tenant.id, user.id);
        for (const role of roles) {
            expect(role.name).toMatch(/DEF_ROLE/);
        }
    });

    it('should get group details', async () => {
        const response = await helper.group.getGroup(group.id);
        expect(response.group.name).toEqual("group-1");
        expect(response.group.tenantId).toEqual(tenant.id);
    });

    it('should update group name', async () => {
        const response = await app.getHttpServer()
            .patch(`/api/group/${group.id}/update`)
            .send({name: "group-name-patch"})
            .set('Authorization', `Bearer ${accessToken}`)
            .set('Accept', 'application/json');

        expect(response.status).toEqual(200);
        expect(response.body.name).toEqual("group-name-patch");
        expect(response.body.tenantId).toEqual(tenant.id);
    });

    it('should delete group', async () => {
        const response = await app.getHttpServer()
            .delete(`/api/group/${group.id}/delete`)
            .set('Authorization', `Bearer ${accessToken}`)
            .set('Accept', 'application/json');

        expect(response.status).toEqual(200);
        expect(response.body.name).toEqual("group-name-patch");
        expect(response.body.tenantId).toEqual(tenant.id);
    });
});
