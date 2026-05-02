import {SharedTestFixture} from "../shared-test.fixture";
import {TokenFixture} from "../token.fixture";

describe('e2e positive token flow', () => {
    let app: SharedTestFixture;
    let refreshToken = "";
    let accessToken = "";
    // Default public client's UUID — matches the client that issued the refresh token
    let defaultClientId = "";
    // Confidential client for client_credentials and verify flows
    let confidentialClientId = "";
    let confidentialClientSecret = "";

    beforeAll(async () => {
        app = new SharedTestFixture();
        const tokenFixture = new TokenFixture(app);

        // Get access token via password grant (binds refresh token to default public client)
        const response = await tokenFixture.fetchAccessToken(
            "admin@auth.server.com",
            "admin9000",
            "auth.server.com"
        );
        refreshToken = response.refreshToken;
        accessToken = response.accessToken;

        // Get the default public client's UUID for refresh grants
        const creds = await app.getHttpServer()
            .get('/api/tenant/my/credentials')
            .set('Authorization', `Bearer ${accessToken}`)
            .set('Accept', 'application/json');
        defaultClientId = creds.body.clientId;

        // Create a confidential client for client_credentials and verify flows
        const decoded = app.jwtService().decode(accessToken, {json: true}) as any;
        const confCreds = await tokenFixture.createConfidentialClient(accessToken, decoded.tenant.id);
        confidentialClientId = confCreds.clientId;
        confidentialClientSecret = confCreds.clientSecret;
    });

    afterAll(async () => {
        await app.close();
    });

    it(`/POST Refresh Token`, async () => {
        // Refresh using the default public client (same client that issued the token).
        // Public clients don't need a secret per RFC 6749 §6.
        const response = await app.getHttpServer()
            .post('/api/oauth/token')
            .send({
                "grant_type": "refresh_token",
                "refresh_token": refreshToken,
                "client_id": defaultClientId,
            })
            .set('Accept', 'application/json');

        expect(response.status).toEqual(200);
        expect(response.body.access_token).toBeDefined();
        expect(response.body.expires_in).toBeDefined();
        expect(response.body.token_type).toEqual('Bearer');
        expect(response.body.refresh_token).toBeDefined();
    });

    it(`/POST Client Credentials`, async () => {
        const response = await app.getHttpServer()
            .post('/api/oauth/token')
            .send({
                "grant_type": "client_credentials",
                "client_id": confidentialClientId,
                "client_secret": confidentialClientSecret
            })
            .set('Accept', 'application/json');

        expect(response.status).toEqual(200);
        expect(response.body.access_token).toBeDefined();
        expect(response.body.expires_in).toBeDefined();
        expect(response.body.token_type).toEqual('Bearer');
    });

    it(`/POST Verify Token`, async () => {
        const response = await app.getHttpServer()
            .post('/api/oauth/verify')
            .send({
                "access_token": accessToken,
                "client_id": confidentialClientId,
                "client_secret": confidentialClientSecret
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
