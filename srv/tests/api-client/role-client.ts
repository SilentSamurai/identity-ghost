import {expect2xx, HttpClient, TestFixture} from "./client";

export class RoleClient extends HttpClient {

    constructor(app: TestFixture, accessToken: string) {
        super(app, accessToken);
    }

    public async createRole(name: string, tenantId: string) {
        const response = await this.app.getHttpServer()
            .post(`/api/tenant/my/role/${name}`)
            .set('Authorization', `Bearer ${this.accessToken}`)
            .set('Accept', 'application/json');

        console.log(response.body);
        expect2xx(response);
        return response.body;
    }
}
