import {TestAppFixture} from "../test-app.fixture";
import {expect2xx, HttpClient} from "./client";

export class ClientEntityClient extends HttpClient {

    constructor(app: TestAppFixture, accessToken: string) {
        super(app, accessToken);
    }

    public async createClient(tenantId: string, name: string, opts: {
        redirectUris?: string[];
        allowedScopes?: string;
        grantTypes?: string;
        responseTypes?: string;
        tokenEndpointAuthMethod?: string;
        isPublic?: boolean;
        requirePkce?: boolean;
        allowPasswordGrant?: boolean;
        allowRefreshToken?: boolean;
    } = {}) {
        const response = await this.post('/api/clients/create')
            .send({tenantId, name, ...opts});

        console.log("Create Client Response:", response.body);
        expect2xx(response);
        return response.body;
    }

    public async getClient(clientId: string) {
        const response = await this.get(`/api/clients/${clientId}`);
        console.log("Get Client Response:", response.body);
        expect2xx(response);
        return response.body;
    }

    public async getClientsByTenant(tenantId: string) {
        const response = await this.get(`/api/clients/tenant/${tenantId}`);
        console.log("Get Clients By Tenant Response:", response.body);
        expect2xx(response);
        return response.body;
    }

    public async rotateSecret(clientId: string) {
        const response = await this.post(`/api/clients/${clientId}/rotate-secret`).send({});
        console.log("Rotate Secret Response:", response.body);
        expect2xx(response);
        return response.body;
    }

    public async deleteClient(clientId: string) {
        const response = await this.app.getHttpServer()
            .delete(`/api/clients/${clientId}`)
            .set('Authorization', `Bearer ${this.accessToken}`)
            .set('Accept', 'application/json');

        console.log("Delete Client Response:", response.body);
        expect2xx(response);
        return response.body;
    }

    public async getClientRaw(clientId: string) {
        return this.app.getHttpServer()
            .get(`/api/clients/${clientId}`)
            .set('Authorization', `Bearer ${this.accessToken}`)
            .set('Accept', 'application/json');
    }
}
