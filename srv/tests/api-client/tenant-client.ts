import {expect2xx, HttpClient, TestFixture} from "./client";

export class TenantClient extends HttpClient {

    constructor(app: TestFixture, accessToken: string) {
        super(app, accessToken);
    }

    public async createTenant(name: string, domain: string) {
        const response = await this.app.getHttpServer()
            .post('/api/tenant/create')
            .send({name, domain})
            .set('Authorization', `Bearer ${this.accessToken}`)
            .set('Accept', 'application/json');

        console.log("Create Tenant Response:", response.body);
        expect2xx(response);
        expect(response.status).toEqual(201);
        expect(response.body.id).toBeDefined();
        expect(response.body.name).toEqual(name);
        expect(response.body.domain).toEqual(domain);

        return response.body;
    }

    // -----------------------------------------------------------------
    // Add members using POST /api/tenant/my/members/add
    // -----------------------------------------------------------------
    public async addMembers(tenantId: string, emails: string[]) {
        const response = await this.app.getHttpServer()
            .post(`/api/tenant/my/members/add`)
            .set('Authorization', `Bearer ${this.accessToken}`)
            .set('Accept', 'application/json')
            .send({emails});

        console.log("Add Members Response:", response.body);
        expect2xx(response);
        return response.body;
    }

    // -----------------------------------------------------------------
    // Remove members (DELETE /api/tenant/my/members/delete)
    // -----------------------------------------------------------------
    public async removeMembers(tenantId: string, emails: string[]) {
        const response = await this.app.getHttpServer()
            .delete(`/api/tenant/my/members/delete`)
            .send({emails})
            .set('Authorization', `Bearer ${this.accessToken}`)
            .set('Accept', 'application/json');

        console.log("Remove Members Response:", response.body);
        expect2xx(response);
        // Controller returns the updated tenant; expect a 200 or 201 depending on how it's set up

        return response.body;
    }

    // -----------------------------------------------------------------
    // Get all members of a tenant (GET /api/tenant/my/members)
    // -----------------------------------------------------------------
    public async getTenantMembers(tenantId: string) {
        const response = await this.app.getHttpServer()
            .get(`/api/tenant/my/members`)
            .set('Authorization', `Bearer ${this.accessToken}`)
            .set('Accept', 'application/json');

        console.log("Get Tenant Members Response:", response.body);
        expect2xx(response);

        return response.body;
    }

    // -----------------------------------------------------------------
    // Update roles for a specific user in a tenant
    // (PUT /api/tenant/my/member/:userId/roles)
    // -----------------------------------------------------------------
    public async updateMemberRoles(tenantId: string, userId: string, roles: string[]) {
        const response = await this.app.getHttpServer()
            .put(`/api/tenant/my/member/${userId}/roles`)
            .set('Authorization', `Bearer ${this.accessToken}`)
            .set('Accept', 'application/json')
            .send({roles});

        console.log("Update Member Roles Response:", response.body);
        expect2xx(response);

        return response.body;
    }

    // -----------------------------------------------------------------
    // Get details for a particular tenant member
    // (GET /api/tenant/my/member/:userId)
    // -----------------------------------------------------------------
    public async getMember(tenantId: string, userId: string) {
        const response = await this.app.getHttpServer()
            .get(`/api/tenant/my/member/${userId}`)
            .set('Authorization', `Bearer ${this.accessToken}`)
            .set('Accept', 'application/json');

        console.log("Get Member Response:", response.body);
        expect2xx(response);

        return response.body;
    }

    // -----------------------------------------------------------------
    // Get roles for a particular tenant member
    // (GET /api/tenant/my/member/:userId/roles)
    // -----------------------------------------------------------------
    public async getMemberRoles(tenantId: string, userId: string) {
        const response = await this.app.getHttpServer()
            .get(`/api/tenant/my/member/${userId}/roles`)
            .set('Authorization', `Bearer ${this.accessToken}`)
            .set('Accept', 'application/json');

        console.log("Get Member Roles Response:", response.body);
        expect2xx(response);

        return response.body.roles;
    }

    // -----------------------------------------------------------------
    // Create a role in a tenant (POST /api/tenant/my/role/:name)
    // -----------------------------------------------------------------
    public async createRole(tenantId: string, name: string) {
        const response = await this.app.getHttpServer()
            .post(`/api/tenant/my/role/${name}`)
            .set('Authorization', `Bearer ${this.accessToken}`)
            .set('Accept', 'application/json');

        console.log("Create Role Response:", response.body);
        expect2xx(response);
        expect(response.status).toEqual(201);
        return response.body;
    }

    // -----------------------------------------------------------------
    // Delete a role from a tenant (DELETE /api/tenant/my/role/:name)
    // -----------------------------------------------------------------
    public async deleteRole(tenantId: string, name: string) {
        const response = await this.app.getHttpServer()
            .delete(`/api/tenant/my/role/${name}`)
            .set('Authorization', `Bearer ${this.accessToken}`)
            .set('Accept', 'application/json');

        console.log("Delete Role Response:", response.body);
        expect2xx(response);

        // The controller returns the deleted role object
        return response.body;
    }

    // -----------------------------------------------------------------
    // Retrieve all roles for a tenant (GET /api/tenant/my/roles)
    // -----------------------------------------------------------------
    public async getTenantRoles(tenantId: string) {
        const response = await this.app.getHttpServer()
            .get(`/api/tenant/my/roles`)
            .set('Authorization', `Bearer ${this.accessToken}`)
            .set('Accept', 'application/json');

        console.log("Get Tenant Roles Response:", response.body);
        expect2xx(response);

        return response.body;
    }

    // -----------------------------------------------------------------
    // Retrieve a single role by name (GET /api/tenant/my/role/:name)
    // -----------------------------------------------------------------
    public async getTenantRole(tenantId: string, name: string) {
        const response = await this.app.getHttpServer()
            .get(`/api/tenant/my/role/${name}`)
            .set('Authorization', `Bearer ${this.accessToken}`)
            .set('Accept', 'application/json');

        console.log("Get Tenant Role Response:", response.body);
        expect2xx(response);

        // The controller returns { role: role, users: users }
        return response.body;
    }

    public async getTenantDetails(tenantId?: string) {
        const response = await this.app.getHttpServer()
            .get(`/api/tenant/my/info`)
            .set('Authorization', `Bearer ${this.accessToken}`)
            .set('Accept', 'application/json');

        console.log("Get Tenant Details Response:", response.body);

        expect2xx(response);

        expect(response.body.id).toBeDefined();
        if (tenantId) {
            expect(response.body.id).toEqual(tenantId);
        }
        expect(response.body.name).toBeDefined();

        return response.body;
    }

    public async updateTenant(tenantId: string, name: string) {
        const response = await this.app.getHttpServer()
            .patch(`/api/tenant/my`)
            .send({name})
            .set('Authorization', `Bearer ${this.accessToken}`)
            .set('Accept', 'application/json');
        console.log("Update Tenant Response:", response.body);

        expect2xx(response);

        return response.body;
    }

    public async deleteTenant(tenantId: string) {
        const response = await this.app.getHttpServer()
            .delete(`/api/tenant/my`)
            .set('Authorization', `Bearer ${this.accessToken}`)
            .set('Accept', 'application/json');
        console.log("Delete Tenant Response:", response.body);
        expect2xx(response);

        return response.body;
    }

    public async getMyCredentials() {
        const response = await this.app.getHttpServer()
            .get('/api/tenant/my/credentials')
            .set('Authorization', `Bearer ${this.accessToken}`)
            .set('Accept', 'application/json');
        console.log("Get My Credentials Response:", response.body);
        expect2xx(response);

        return response.body;
    }

    public async getTenantCredentials(tenantId: string) {
        const response = await this.app.getHttpServer()
            .get(`/api/tenant/my/credentials`)
            .set('Authorization', `Bearer ${this.accessToken}`)
            .set('Accept', 'application/json');

        console.log("Get Tenant Credentials Response:", response.body);
        expect2xx(response);

        return response.body;
    }
}