import {SharedTestFixture} from "../shared-test.fixture";
import {TokenFixture} from "../token.fixture";

describe('e2e positive token flow', () => {
    let app: SharedTestFixture;
    let refreshToken = "";
    let accessToken = "";
    let clientId = "";
    let clientSecret = "";

    beforeAll(async () => {
        app = new SharedTestFixture();
    });

    afterAll(async () => {
        await app.close();
    });

    it(`/POST Access Token`, async () => {
        let tokenFixture = new TokenFixture(app);
        let response = await tokenFixture.fetchAccessToken(
            "admin@auth.server.com",
            "admin9000",
            "auth.server.com"
        );
        refreshToken = response.refreshToken;
        accessToken = response.accessToken;
    });

    it(`/POST Refresh Token`, async () => {
        const response = await app.getHttpServer()
            .post('/api/oauth/token')
            .send({
                "grant_type": "refresh_token",
                "refresh_token": refreshToken,
            })
            .set('Accept', 'application/json');

        expect(response.status).toEqual(201);
        expect(response.body.access_token).toBeDefined();
        expect(response.body.expires_in).toBeDefined();
        expect(response.body.token_type).toEqual('Bearer');
        expect(response.body.refresh_token).toBeDefined();
    });

    it(`/GET Global Tenant Credentials`, async () => {
        const creds = await app.getHttpServer()
            .get("/api/tenant/my/credentials")
            .set('Authorization', `Bearer ${accessToken}`);

        expect(creds.status).toEqual(200);
        expect(creds.body.clientId).toBeDefined();
        expect(creds.body.clientSecret).toBeDefined();
        expect(creds.body.publicKey).toBeDefined();

        clientId = creds.body.clientId;
        clientSecret = creds.body.clientSecret;
    });

    it(`/POST Client Credentials`, async () => {
        const response = await app.getHttpServer()
            .post('/api/oauth/token')
            .send({
                "grant_type": "client_credentials",
                "client_id": clientId,
                "client_secret": clientSecret
            })
            .set('Accept', 'application/json');

        expect(response.status).toEqual(201);
        expect(response.body.access_token).toBeDefined();
        expect(response.body.expires_in).toBeDefined();
        expect(response.body.token_type).toEqual('Bearer');
    });

    it(`/POST Verify Token`, async () => {
        const response = await app.getHttpServer()
            .post('/api/oauth/verify')
            .send({
                "access_token": accessToken,
                "client_id": clientId,
                "client_secret": clientSecret
            })
            .set('Accept', 'application/json');

        console.log("Response: ", response.body);
        expect(response.status).toEqual(201);
        expect(response.body.email).toBeDefined();
        expect(response.body.name).toBeDefined();
        expect(response.body.grant_type).toEqual('password');
        expect(response.body.scopes).toBeDefined();
    });
});

