import {SharedTestFixture} from "../shared-test.fixture";
import {TokenFixture} from "../token.fixture";

describe('e2e token exchange flow', () => {
    let app: SharedTestFixture;
    let superAdminToken = "";
    let clientId = "";
    let tenant = {
        id: ""
    };
    let clientSecret = "";
    let tenantDomain = "";

    beforeAll(async () => {
        app = new SharedTestFixture();

        // Obtain super admin token
        const tokenFixture = new TokenFixture(app);
        const response = await tokenFixture.fetchAccessTokenFlow(
            "admin@auth.server.com",
            "admin9000",
            "auth.server.com"
        );
        superAdminToken = response.accessToken;
        expect(response.jwt.tenant.domain).toEqual("auth.server.com");

        // Create tenant
        const uniqueDomain = `tok-exch-${Date.now()}.com`;
        const tenantResponse = await app.getHttpServer()
            .post('/api/tenant/create')
            .send({
                "name": "tenant-1",
                "domain": uniqueDomain
            })
            .set('Authorization', `Bearer ${superAdminToken}`)
            .set('Accept', 'application/json');

        expect(tenantResponse.status).toEqual(201);
        expect(tenantResponse.body.id).toBeDefined();
        expect(tenantResponse.body.name).toEqual("tenant-1");
        expect(tenantResponse.body.domain).toEqual(uniqueDomain);
        tenant = tenantResponse.body;
        tenantDomain = uniqueDomain;

        // Create confidential client for the new tenant
        const creds = await tokenFixture.createConfidentialClient(
            superAdminToken,
            tenant.id,
            "confidential-client",
            "client_credentials",
            "openid profile email"
        );
        clientId = creds.clientId;
        clientSecret = creds.clientSecret;
        expect(clientId).toBeDefined();
        expect(clientSecret).toBeDefined();
    });

    afterAll(async () => {
        await app.close();
    });

    it(`/POST Token Exchange`, async () => {
        const response = await app.getHttpServer()
            .post('/api/oauth/exchange')
            .send({
                "access_token": superAdminToken,
                "client_id": clientId,
                "client_secret": clientSecret
            })
            .set('Accept', 'application/json');

        expect(response.status).toEqual(201);
        expect(response.body.access_token).toBeDefined();
        expect(response.body.expires_in).toBeDefined();
        expect(response.body.token_type).toEqual('Bearer');
        expect(response.body.refresh_token).toBeDefined();

        let decode = app.jwtService().decode(response.body.access_token, {json: true}) as any;
        expect(decode.sub).toBeDefined();
        expect(decode.grant_type).toBeDefined();
        expect(decode.tenant.id).toBeDefined();
        expect(decode.tenant.name).toBeDefined();
        expect(decode.tenant.domain).toBeDefined();
        expect(decode.tenant.domain).toEqual(tenantDomain);
        // Profile data must not be in the JWT payload (RFC 9068 compliance)
        expect(decode.email).toBeUndefined();
        expect(decode.name).toBeUndefined();
    });

    it(`/POST Token Wrong Exchange`, async () => {
        const response = await app.getHttpServer()
            .post('/api/oauth/exchange')
            .send({
                "access_token": "wrong token",
                "client_id": clientId,
                "client_secret": clientSecret
            })
            .set('Accept', 'application/json');

        expect(response.status).toEqual(401);
    });

    it(`/POST Token Wrong client_id`, async () => {
        const response = await app.getHttpServer()
            .post('/api/oauth/exchange')
            .send({
                "access_token": superAdminToken,
                "client_id": "clientId",
                "client_secret": "clientSecret"
            })
            .set('Accept', 'application/json');

        expect(response.status).toEqual(401);
    });

    it(`/POST Token Wrong client_secret`, async () => {
        const response = await app.getHttpServer()
            .post('/api/oauth/exchange')
            .send({
                "access_token": superAdminToken,
                "client_id": clientId,
                "client_secret": "clientSecret"
            })
            .set('Accept', 'application/json');

        expect(response.status).toEqual(401);
    });


});

