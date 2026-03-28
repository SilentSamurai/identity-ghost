import {expect2xx, HttpClient, TestFixture} from './client';

export class TenantBitsClient extends HttpClient {
    constructor(app: TestFixture, accessToken: string) {
        super(app, accessToken);
    }

    async addOrUpdate(tenantId: string, key: string, value: string) {
        const response = await this.app.getHttpServer()
            .post('/api/tenant-bits')
            .set('Authorization', `Bearer ${this.accessToken}`)
            .send({tenantId, key, value});
        expect2xx(response);
        return response.body;
    }

    async delete(tenantId: string, key: string) {
        const response = await this.app.getHttpServer()
            .delete('/api/tenant-bits')
            .set('Authorization', `Bearer ${this.accessToken}`)
            .send({tenantId, key});
        expect2xx(response);
        return response.body;
    }

    async exists(tenantId: string, key: string) {
        const response = await this.app.getHttpServer()
            .get('/api/tenant-bits/exists')
            .set('Authorization', `Bearer ${this.accessToken}`)
            .query({tenantId, key});
        expect2xx(response);
        return response.body.exists;
    }

    async getValue(tenantId: string, key: string) {
        const response = await this.app.getHttpServer()
            .get('/api/tenant-bits')
            .set('Authorization', `Bearer ${this.accessToken}`)
            .query({tenantId, key});
        expect2xx(response);
        return response.body.value;
    }
} 