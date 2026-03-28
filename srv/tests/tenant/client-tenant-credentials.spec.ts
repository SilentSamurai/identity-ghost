import {SharedTestFixture} from "../shared-test.fixture";
import {TokenFixture} from "../token.fixture";
import {expect2xx} from "../api-client/client";

describe('e2e tenant technical credential', () => {
    let app: SharedTestFixture;
    let tenant = {
        id: "",
        clientId: "",
        clientSecret: ""
    };
    let technicalAccessToken = "";
    let adminAccessToken = "";
    let tenantDomain = "";

    beforeAll(async () => {
        app = new SharedTestFixture();
    });

    afterAll(async () => {
        await app.close();
    });

    it(`/POST Fetch Access Token`, async () => {
        let tokenFixture = new TokenFixture(app);
        let response = await tokenFixture.fetchAccessToken(
            "admin@auth.server.com",
            "admin9000",
            "auth.server.com"
        );
        adminAccessToken = response.accessToken;
    });

    it(`/POST Create Tenant`, async () => {
        const uniqueDomain = `cli-cred-${Date.now()}.com`;
        const response = await app.getHttpServer()
            .post('/api/tenant/create')
            .send({
                "name": "tenant-1",
                "domain": uniqueDomain
            })
            .set('Authorization', `Bearer ${adminAccessToken}`)
            .set('Accept', 'application/json');

        console.log(response.body);

        expect(response.status).toEqual(201);
        expect(response.body.id).toBeDefined();
        expect(response.body.name).toEqual("tenant-1");
        expect(response.body.domain).toEqual(uniqueDomain);
        expect(response.body.clientId).toBeDefined();
        tenant = response.body;
        tenantDomain = uniqueDomain;
    });

    it(`/GET Tenant Credentials with admin token`, async () => {
        const response = await app.getHttpServer()
            .get(`/api/admin/tenant/${tenant.id}/credentials`)
            .set('Authorization', `Bearer ${adminAccessToken}`)
            .set('Accept', 'application/json');

        expect(response.status).toEqual(200);
        console.log(response.body);

        expect(response.body.id).toBeDefined();
        expect(response.body.clientId).toBeDefined();
        expect(response.body.clientSecret).toBeDefined();
        expect(response.body.publicKey).toBeDefined();
        tenant.clientSecret = response.body.clientSecret;
    });

    it(`/POST Client Credentials`, async () => {
        const response = await app.getHttpServer()
            .post('/api/oauth/token')
            .send({
                "grant_type": "client_credentials",
                "client_id": tenant.clientId,
                "client_secret": tenant.clientSecret
            })
            .set('Accept', 'application/json');

        expect(response.status).toEqual(201);
        expect(response.body.access_token).toBeDefined();
        expect(response.body.expires_in).toBeDefined();
        expect(response.body.token_type).toEqual('Bearer');
        technicalAccessToken = response.body.access_token;
    });

    it(`/POST Wrong Client Credentials`, async () => {
        const response = await app.getHttpServer()
            .post('/api/oauth/token')
            .send({
                "grant_type": "client_credentials",
                "client_id": tenant.clientId,
                "client_secret": "dsgsdg"
            })
            .set('Accept', 'application/json');

        expect(response.status).toEqual(401);
    });

    it(`/GET Tenant Credentials`, async () => {

        const response = await app.getHttpServer()
            .get(`/api/tenant/my/credentials`)
            .set('Authorization', `Bearer ${technicalAccessToken}`)
            .set('Accept', 'application/json');

        console.log(" Tenant Credentials", response.body);
        expect2xx(response);


        expect(response.body.id).toBeDefined();
        expect(response.body.clientId).toBeDefined();
        expect(response.body.clientSecret).toBeDefined();
        expect(response.body.publicKey).toBeDefined();
    });

    it(`/GET Tenant Details`, async () => {
        const response = await app.getHttpServer()
            .get(`/api/tenant/my/info`)
            .set('Authorization', `Bearer ${technicalAccessToken}`)
            .set('Accept', 'application/json');

        if (response.status !== 200) {
            console.log(response);
        }
        expect(response.status).toEqual(200);

        expect(response.body.id).toBeDefined();
        expect(response.body.name).toEqual("tenant-1");
        expect(response.body.domain).toEqual(tenantDomain);
        expect(response.body.clientId).toBeDefined();
    });

    it(`/GET Tenant Members`, async () => {
        const response = await app.getHttpServer()
            .get(`/api/tenant/my/members`)
            .set('Authorization', `Bearer ${technicalAccessToken}`)
            .set('Accept', 'application/json');

        if (response.status !== 200) {
            console.log(response);
        }
        expect(response.status).toEqual(200);


        expect(response.body).toBeInstanceOf(Array);
        expect(response.body).toHaveLength(1);
        expect(response.body[0].id).toBeDefined();
        expect(response.body[0].name).toBeDefined();

    });

    it(`/GET Tenant Roles`, async () => {
        const response = await app.getHttpServer()
            .get(`/api/tenant/my/roles`)
            .set('Authorization', `Bearer ${technicalAccessToken}`)
            .set('Accept', 'application/json');

        if (response.status !== 200) {
            console.log(response);
        }

        expect(response.status).toEqual(200);

        expect(response.body).toBeInstanceOf(Array);
        expect(response.body.length).toBeGreaterThanOrEqual(2);
        for (let role of response.body) {
            expect(role.name).toMatch(/TENANT_ADMIN|TENANT_VIEWER/);
        }
    });

    it(`/PATCH Update Tenant`, async () => {
        const response = await app.getHttpServer()
            .patch(`/api/tenant/my`)
            .set('Authorization', `Bearer ${technicalAccessToken}`)
            .send({
                domain: "updated-test-wesite.com",
                name: "updated-tenant-1"
            })
            .set('Accept', 'application/json');

        console.log(response.body);
        expect(response.status).toEqual(403);
    });

    it(`/POST Create Role`, async () => {
        const name = "auditor";
        const response = await app.getHttpServer()
            .post(`/api/tenant/my/role/${name}`)
            .set('Authorization', `Bearer ${technicalAccessToken}`)
            .set('Accept', 'application/json');

        console.log(response.body);
        expect(response.status).toEqual(403);
    });

    it(`/POST Add Members`, async () => {
        const response = await app.getHttpServer()
            .post(`/api/tenant/my/members/add`)
            .set('Authorization', `Bearer ${technicalAccessToken}`)
            .set('Accept', 'application/json')
            .send({
                emails: [
                    'legolas@mail.com',
                ]
            });

        console.log(response.body);
        expect(response.status).toEqual(403);
    });


    it(`/PUT Update Member Role`, async () => {
        const email = "legolas@mail.com";
        const response = await app.getHttpServer()
            .put(`/api/tenant/my/member/${email}/roles`)
            .set('Authorization', `Bearer ${technicalAccessToken}`)
            .send({
                "roles": ["TENANT_VIEWER", "auditor"]
            })
            .set('Accept', 'application/json');

        console.log(response.body);
        expect(response.status).toEqual(403);
    });


    it(`/DELETE Remove Members`, async () => {
        const response = await app.getHttpServer()
            .delete(`/api/tenant/my/members/delete`)
            .set('Authorization', `Bearer ${technicalAccessToken}`)
            .set('Accept', 'application/json')
            .send({
                emails: [
                    'legolas@mail.com',
                ]
            });

        console.log(response.body);
        expect(response.status).toEqual(403);

    });

    it(`/DELETE Remove Role`, async () => {
        const name = "auditor";
        const response = await app.getHttpServer()
            .delete(`/api/tenant/my/role/${name}`)
            .set('Authorization', `Bearer ${technicalAccessToken}`)
            .set('Accept', 'application/json');

        console.log(response.body);
        expect(response.status).toEqual(403);

    });

    it(`/DELETE Remove Tenant`, async () => {
        const response = await app.getHttpServer()
            .delete(`/api/tenant/my`)
            .set('Authorization', `Bearer ${technicalAccessToken}`)
            .set('Accept', 'application/json');

        console.log(response.body);
        expect(response.status).toEqual(403);

    });

});

