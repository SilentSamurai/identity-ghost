import {expect2xx, HttpClient, TestFixture} from "./client";

/**
 * Test client for admin routes (api/admin/tenant/:tenantId/...).
 * Used by super-admin tokens to operate on arbitrary tenants.
 */
export class AdminTenantClient extends HttpClient {

    constructor(app: TestFixture, accessToken: string) {
        super(app, accessToken);
    }

    public async getAllTenants() {
        const response = await this.app.getHttpServer()
            .get(`/api/admin/tenant`)
            .set('Authorization', `Bearer ${this.accessToken}`)
            .set('Accept', 'application/json');
        expect2xx(response);
        return response.body;
    }

    public async getTenant(tenantId: string) {
        const response = await this.app.getHttpServer()
            .get(`/api/admin/tenant/${tenantId}`)
            .set('Authorization', `Bearer ${this.accessToken}`)
            .set('Accept', 'application/json');
        expect2xx(response);
        return response.body;
    }

    public async updateTenant(tenantId: string, body: { name?: string; allowSignUp?: boolean }) {
        const response = await this.app.getHttpServer()
            .patch(`/api/admin/tenant/${tenantId}`)
            .send(body)
            .set('Authorization', `Bearer ${this.accessToken}`)
            .set('Accept', 'application/json');
        expect2xx(response);
        return response.body;
    }

    public async deleteTenant(tenantId: string) {
        const response = await this.app.getHttpServer()
            .delete(`/api/admin/tenant/${tenantId}`)
            .set('Authorization', `Bearer ${this.accessToken}`)
            .set('Accept', 'application/json');
        expect2xx(response);
        return response.body;
    }

    public async getTenantCredentials(tenantId: string) {
        const response = await this.app.getHttpServer()
            .get(`/api/admin/tenant/${tenantId}/credentials`)
            .set('Authorization', `Bearer ${this.accessToken}`)
            .set('Accept', 'application/json');
        expect2xx(response);
        return response.body;
    }

    public async getTenantMembers(tenantId: string) {
        const response = await this.app.getHttpServer()
            .get(`/api/admin/tenant/${tenantId}/members`)
            .set('Authorization', `Bearer ${this.accessToken}`)
            .set('Accept', 'application/json');
        expect2xx(response);
        return response.body;
    }

    public async addMembers(tenantId: string, emails: string[]) {
        const response = await this.app.getHttpServer()
            .post(`/api/admin/tenant/${tenantId}/members/add`)
            .send({emails})
            .set('Authorization', `Bearer ${this.accessToken}`)
            .set('Accept', 'application/json');
        expect2xx(response);
        return response.body;
    }

    public async removeMembers(tenantId: string, emails: string[]) {
        const response = await this.app.getHttpServer()
            .delete(`/api/admin/tenant/${tenantId}/members/delete`)
            .send({emails})
            .set('Authorization', `Bearer ${this.accessToken}`)
            .set('Accept', 'application/json');
        expect2xx(response);
        return response.body;
    }

    public async updateMemberRoles(tenantId: string, userId: string, roles: string[]) {
        const response = await this.app.getHttpServer()
            .put(`/api/admin/tenant/${tenantId}/member/${userId}/roles`)
            .send({roles})
            .set('Authorization', `Bearer ${this.accessToken}`)
            .set('Accept', 'application/json');
        expect2xx(response);
        return response.body;
    }

    public async getMemberRoles(tenantId: string, userId: string) {
        const response = await this.app.getHttpServer()
            .get(`/api/admin/tenant/${tenantId}/member/${userId}/roles`)
            .set('Authorization', `Bearer ${this.accessToken}`)
            .set('Accept', 'application/json');
        expect2xx(response);
        return response.body.roles;
    }

    public async getTenantRoles(tenantId: string) {
        const response = await this.app.getHttpServer()
            .get(`/api/admin/tenant/${tenantId}/roles`)
            .set('Authorization', `Bearer ${this.accessToken}`)
            .set('Accept', 'application/json');
        expect2xx(response);
        return response.body;
    }

    public async createRole(tenantId: string, name: string) {
        const response = await this.app.getHttpServer()
            .post(`/api/admin/tenant/${tenantId}/role/${name}`)
            .set('Authorization', `Bearer ${this.accessToken}`)
            .set('Accept', 'application/json');
        expect2xx(response);
        return response.body;
    }

    public async deleteRole(tenantId: string, name: string) {
        const response = await this.app.getHttpServer()
            .delete(`/api/admin/tenant/${tenantId}/role/${name}`)
            .set('Authorization', `Bearer ${this.accessToken}`)
            .set('Accept', 'application/json');
        expect2xx(response);
        return response.body;
    }

    public async getTenantGroups(tenantId: string) {
        const response = await this.app.getHttpServer()
            .get(`/api/admin/tenant/${tenantId}/groups`)
            .set('Authorization', `Bearer ${this.accessToken}`)
            .set('Accept', 'application/json');
        expect2xx(response);
        return response.body;
    }

    public async getTenantClients(tenantId: string) {
        const response = await this.app.getHttpServer()
            .get(`/api/admin/tenant/${tenantId}/clients`)
            .set('Authorization', `Bearer ${this.accessToken}`)
            .set('Accept', 'application/json');
        expect2xx(response);
        return response.body;
    }

    public async subscribeToApp(tenantId: string, appId: string) {
        const response = await this.app.getHttpServer()
            .post(`/api/admin/tenant/${tenantId}/apps/${appId}/subscribe`)
            .set('Authorization', `Bearer ${this.accessToken}`)
            .set('Accept', 'application/json');
        expect2xx(response);
        return response.body;
    }

    public async unsubscribeFromApp(tenantId: string, appId: string) {
        const response = await this.app.getHttpServer()
            .post(`/api/admin/tenant/${tenantId}/apps/${appId}/unsubscribe`)
            .set('Authorization', `Bearer ${this.accessToken}`)
            .set('Accept', 'application/json');
        expect2xx(response);
        return response.body;
    }
}

