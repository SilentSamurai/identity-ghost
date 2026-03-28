import {expect2xx, HttpClient, TestFixture} from "./client";
import {Action, Effect} from "../../src/casl/actions.enum";


export class PolicyClient extends HttpClient {


    constructor(app: TestFixture, accessToken: string) {
        super(app, accessToken);
    }

    public async createAuthorization(
        role: string,
        effect: string,
        action: string,
        subject: string,
        conditions: object = {}
    ) {
        const response = await this.app.getHttpServer()
            .post('/api/v1/policy/create')
            .set('Authorization', `Bearer ${this.accessToken}`)
            .set('Accept', 'application/json')
            .send({
                role,
                effect,
                action,
                subject,
                conditions
            });

        console.log("Create Authorization Response:", response.body);
        expect2xx(response);
        return response.body;
    }

    public async getRoleAuthorizations(roleId: string) {
        const response = await this.app.getHttpServer()
            .get(`/api/v1/policy/byRole/${roleId}`)
            .set('Authorization', `Bearer ${this.accessToken}`)
            .set('Accept', 'application/json');

        console.log("Get Role Authorizations Response:", response.body);
        expect2xx(response);
        return response.body;
    }

    public async getAuthorization(id: string) {
        const response = await this.get(`/api/v1/policy/${id}`);

        console.log("Get Authorization Response:", response.body);
        expect2xx(response);
        return response.body;
    }

    public async updateAuthorization(
        id: string,
        updateData: {
            effect?: Effect;
            action?: Action;
            subject?: string;
            conditions?: object;
        }
    ) {
        const response = await this.patch(`/api/v1/policy/${id}`)
            .set('Authorization', `Bearer ${this.accessToken}`)
            .set('Accept', 'application/json')
            .send(updateData);

        console.log("Update Authorization Response:", response.body);
        expect2xx(response);
        return response.body;
    }

    /**
     * Delete an policy
     * @param id - The ID of the policy to delete
     */
    public async deleteAuthorization(id: string) {
        const response = await this.app.getHttpServer()
            .delete(`/api/v1/policy/${id}`)
            .set('Authorization', `Bearer ${this.accessToken}`)
            .set('Accept', 'application/json');

        console.log("Delete Authorization Response:", response.body);
        expect2xx(response);
        return response.body;
    }

    async getMyPermission() {
        const response = await this.get("/api/v1/my/permissions")

        console.log("My Permission Response:", response.body);
        expect2xx(response);
        return response.body;
    }

    async getTenantPermissions(email: string) {
        const response = await this.post("/api/v1/tenant-user/permissions")
            .send({email})


        console.log("Tenant Permission Response:", response.body);
        expect2xx(response);
        return response.body;
    }
}