import {expect2xx, HttpClient, TestFixture} from "./client";

export class GroupClient extends HttpClient {

    constructor(app: TestFixture, accessToken: string) {
        super(app, accessToken);
    }

    public async createGroup(name: string, tenantId: string) {
        const response = await this.app.getHttpServer()
            .post('/api/group/create')
            .set('Authorization', `Bearer ${this.accessToken}`)
            .set('Accept', 'application/json')
            .send({name, tenantId});

        console.log("Response (createGroup): ", response.body);
        expect2xx(response);
        expect(response.status).toEqual(201);
        expect(response.body.id).toBeDefined();
        expect(response.body.name).toEqual(name);
        expect(response.body.tenantId).toEqual(tenantId);

        return response.body;
    }

    public async getAllTenantGroups(tenantId: string) {
        const response = await this.app.getHttpServer()
            .get(`/api/tenant/my/groups`)
            .set('Authorization', `Bearer ${this.accessToken}`)
            .set('Accept', 'application/json');

        console.log("Response (getAllTenantGroups): ", response.body);
        expect2xx(response);
        expect(response.status).toEqual(200);
        expect(Array.isArray(response.body)).toBeTruthy();
        expect(response.body.length).toBeGreaterThanOrEqual(0);

        for (const group of response.body) {
            expect(group.tenantId).toBeDefined();
            expect(group.tenantId).toEqual(tenantId);
        }
        return response.body;
    }

    public async getGroup(groupId: string) {
        const response = await this.app.getHttpServer()
            .get(`/api/group/${groupId}`)
            .set('Authorization', `Bearer ${this.accessToken}`)
            .set('Accept', 'application/json');

        console.log("Response (getGroup): ", response.body);
        expect2xx(response);
        expect(response.status).toEqual(200);

        expect(response.body.group).toBeDefined();
        expect(response.body.group.id).toBeDefined();
        expect(response.body.group.name).toBeDefined();
        expect(response.body.group.tenant).toBeDefined();
        expect(response.body.users).toBeDefined();
        expect(response.body.roles).toBeDefined();

        return response.body;
    }

    public async addRole(groupId: string, roles: string[]) {
        const response = await this.app.getHttpServer()
            .post(`/api/group/${groupId}/add-roles`)
            .set('Authorization', `Bearer ${this.accessToken}`)
            .set('Accept', 'application/json')
            .send({roles});

        console.log("Response (addRole): ", response.body);
        expect2xx(response);
        expect(response.status).toEqual(201);

        expect(response.body.group).toBeDefined();
        expect(response.body.group.name).toBeDefined();
        expect(response.body.group.tenantId).toBeDefined();
        expect(response.body.roles).toBeDefined();
        expect(response.body.roles.length).toBeGreaterThanOrEqual(roles.length);

        return response.body;
    }

    public async removeRoles(groupId: string, roles: string[]) {
        const response = await this.app.getHttpServer()
            .post(`/api/group/${groupId}/remove-roles`)
            .set('Authorization', `Bearer ${this.accessToken}`)
            .set('Accept', 'application/json')
            .send({roles});

        console.log("Response (removeRoles): ", response.body);
        expect2xx(response);
        expect(response.status).toEqual(201);

        expect(response.body.group).toBeDefined();
        expect(response.body.group.name).toBeDefined();
        expect(response.body.group.tenantId).toBeDefined();
        expect(response.body.roles).toBeDefined();

        return response.body;
    }

    public async addUser(groupId: string, users: string[]) {
        const response = await this.app.getHttpServer()
            .post(`/api/group/${groupId}/add-users`)
            .set('Authorization', `Bearer ${this.accessToken}`)
            .set('Accept', 'application/json')
            .send({users});

        console.log("Response (addUser): ", response.body);
        expect2xx(response);
        expect(response.status).toEqual(201);

        expect(response.body.group).toBeDefined();
        expect(response.body.group.name).toBeDefined();
        expect(response.body.group.tenantId).toBeDefined();
        expect(response.body.users).toBeDefined();
        expect(response.body.users.length).toBeGreaterThanOrEqual(users.length);

        return response.body;
    }

    public async removeUser(groupId: string, users: string[]) {
        const response = await this.app.getHttpServer()
            .post(`/api/group/${groupId}/remove-users`)
            .set('Authorization', `Bearer ${this.accessToken}`)
            .set('Accept', 'application/json')
            .send({users});

        console.log("Response (removeUser): ", response.body);
        expect2xx(response);
        expect(response.status).toEqual(201);

        expect(response.body.group).toBeDefined();
        expect(response.body.group.name).toBeDefined();
        expect(response.body.group.tenantId).toBeDefined();
        expect(response.body.users).toBeDefined();
        expect(response.body.users.length).toBeGreaterThanOrEqual(0);
    }
}