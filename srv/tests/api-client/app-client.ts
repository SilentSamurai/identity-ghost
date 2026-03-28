import {expect2xx, HttpClient, TestFixture} from "./client";

export class AppClient extends HttpClient {
    constructor(app: TestFixture, accessToken: string) {
        super(app, accessToken);
    }

    /**
     * Create a new app for a tenant
     */
    public async createApp(tenantId: string, name: string, appUrl: string, description?: string) {
        const response = await this.app.getHttpServer()
            .post('/api/apps/create')
            .send({
                tenantId,
                name,
                appUrl,
                description
            })
            .set('Authorization', `Bearer ${this.accessToken}`)
            .set('Accept', 'application/json');

        console.log("Create App Response:", response.body);
        expect2xx(response);
        expect(response.status).toEqual(201);
        expect(response.body.id).toBeDefined();
        expect(response.body.name).toEqual(name);
        expect(response.body.appUrl).toEqual(appUrl);
        expect(response.body.isPublic).toEqual(false);
        if (description) {
            expect(response.body.description).toEqual(description);
        }

        return response.body;
    }

    public async deleteApp(tenantId: string, name: string) {
        const response = await this.app.getHttpServer()
            .delete(`/api/apps/${tenantId}`)
            .set('Authorization', `Bearer ${this.accessToken}`)
            .set('Accept', 'application/json');
        console.log("Delete App Response:", response.body);
        expect2xx(response);
        // expect(response.body.status).toEqual('success');
        return response.body;
    }

    public async updateApp(appId: string, name: string, appUrl: string, description?: string) {
        const response = await this.app.getHttpServer()
            .patch(`/api/apps/${appId}`)
            .send({
                name,
                appUrl,
                description
            })
            .set("Authorization", `Bearer ${this.accessToken}`)
            .set('Accept', 'application/json');

        console.log("Update App Response:", response.body);
        expect2xx(response);
        expect(response.status).toEqual(201);

        return response.body;
    }

    /**
     * Subscribe an app
     */
    public async subscribeApp(appId: string, tenantId: string) {
        const response = await this.app.getHttpServer()
            .post(`/api/apps/${appId}/my/subscribe`)
            .set('Authorization', `Bearer ${this.accessToken}`)
            .set('Accept', 'application/json');

        console.log("Subscribe to App Response:", response.body);
        expect2xx(response);
        expect(response.status).toEqual(201);
        expect(response.body.status).toBeDefined();
        expect(response.body.status).toBe("success");

        return response.body;
    }

    /**
     * Unsubscribe from an app
     */
    public async unsubscribeApp(appId: string, tenantId: string) {
        const response = await this.app.getHttpServer()
            .post(`/api/apps/${appId}/my/unsubscribe`)
            .set('Authorization', `Bearer ${this.accessToken}`)
            .set('Accept', 'application/json');

        console.log("Unsubscribe from App Response:", response.body);
        expect2xx(response);
        expect(response.body.status).toBeDefined();
        expect(response.body.status).toEqual("success");

        return response.body;
    }

    /**
     * Get app details by ID
     */
    public async getAppDetails(appId: string) {
        const response = await this.app.getHttpServer()
            .get(`/api/apps/${appId}`)
            .set('Authorization', `Bearer ${this.accessToken}`)
            .set('Accept', 'application/json');

        console.log("Get App Details Response:", response.body);
        expect2xx(response);
        expect(response.body.id).toEqual(appId);
        expect(response.body.name).toBeDefined();
        expect(response.body.appUrl).toBeDefined();
        expect(response.body.owner).toBeDefined();

        return response.body;
    }

    /**
     * Get all apps created by tenant
     */
    public async getAppCreatedByTenant(tenantId: string) {
        const response = await this.app.getHttpServer()
            .get(`/api/apps/my/created`)
            .set('Authorization', `Bearer ${this.accessToken}`)
            .set('Accept', 'application/json');

        console.log("Get Tenant Apps Response:", response.body);
        expect2xx(response);
        expect(Array.isArray(response.body)).toBe(true);

        return response.body;
    }

    /**
     * Get all subscriptions for a tenant
     */
    public async getTenantSubscriptions(tenantId: string) {
        const response = await this.app.getHttpServer()
            .get(`/api/apps/my/subscriptions`)
            .set('Authorization', `Bearer ${this.accessToken}`)
            .set('Accept', 'application/json');

        console.log("Get Tenant Subscriptions Response:", response.body);
        expect2xx(response);
        expect(Array.isArray(response.body)).toBe(true);

        return response.body;
    }

    public async getAppSubscriptions(appId: string) {
        const response = await this.app.getHttpServer()
            .get(`/api/apps/subscriptions/${appId}`)
            .set('Authorization', `Bearer ${this.accessToken}`)
            .set('Accept', 'application/json');

        console.log("Get App Subscriptions Response:", response.body);
        expect2xx(response);
        expect(Array.isArray(response.body)).toBe(true);

        return response.body;
    }

    public async getAppsAvailableForSubscription(tenantId: string) {
        const response = await this.app.getHttpServer()
            .post(`/api/apps/my/available`)
            .set('Authorization', `Bearer ${this.accessToken}`)
            .set('Accept', 'application/json');

        console.log("Get Available Apps Response:", response.body);
        expect2xx(response);
        expect(Array.isArray(response.body)).toBe(true);
        return response.body;
    }

    public async publishApp(appId: string) {
        const response = await this.app.getHttpServer()
            .patch(`/api/apps/${appId}/publish`)
            .set('Authorization', `Bearer ${this.accessToken}`)
            .set('Accept', 'application/json');
        expect2xx(response);
        return response.body;
    }

    public async getAvailableApps(tenantId: string) {
        const response = await this.app.getHttpServer()
            .get(`/api/apps/my/available`)
            .set('Authorization', `Bearer ${this.accessToken}`)
            .set('Accept', 'application/json');
        expect2xx(response);
        expect(Array.isArray(response.body)).toBe(true);
        return response.body;
    }

} 