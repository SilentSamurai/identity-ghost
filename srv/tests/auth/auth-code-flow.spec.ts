import {SharedTestFixture} from "../shared-test.fixture";
import {TokenFixture} from "../token.fixture";
import {expect2xx} from "../api-client/client";

describe('e2e positive auth code flow', () => {
    let app: SharedTestFixture;
    let tokenFixture: TokenFixture;
    let authentication_code = "";
    let accessToken = "";
    let clientId = "auth.server.com";
    const redirectUri = "http://localhost:3000/callback";
    const verifier = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopq";
    const challenge = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopq";

    beforeAll(async () => {
        app = new SharedTestFixture();
        tokenFixture = new TokenFixture(app);

        // Login to get an auth code via the new cookie-based flow
        authentication_code = await tokenFixture.fetchAuthCode(
            "admin@auth.server.com",
            "admin9000",
            clientId,
            redirectUri,
        );
    });

    afterAll(async () => {
        await app.close();
    });

    it(`/POST Fetch Access Token`, async () => {
        const response = await app.getHttpServer()
            .post('/api/oauth/token')
            .send({
                "grant_type": "authorization_code",
                "code": authentication_code,
                client_id: clientId,
                "code_verifier": verifier,
                "redirect_uri": redirectUri,
            })
            .set('Accept', 'application/json');

        console.log("Fetch Access Token:", response.body);
        expect2xx(response);

        expect(response.status).toEqual(200);
        expect(response.body.access_token).toBeDefined();
        expect(response.body.expires_in).toBeDefined();
        expect(response.body.token_type).toEqual('Bearer');
        expect(response.body.refresh_token).toBeDefined();

        accessToken = response.body.access_token;
    });


    it(`/POST Verify auth gen code`, async () => {
        // Get a fresh auth code since the previous one was consumed by token exchange
        const freshCode = await tokenFixture.fetchAuthCode(
            "admin@auth.server.com",
            "admin9000",
            clientId,
            redirectUri,
        );

        const response = await app.getHttpServer()
            .post('/api/oauth/verify-auth-code')
            .send({
                "auth_code": freshCode,
                "client_id": clientId,
            })
            .set('Accept', 'application/json');

        expect(response.status).toEqual(201);
        expect(response.body.authentication_code).toBeDefined();
        expect(response.body.status).toBeDefined();
        expect(response.body.email).toBeDefined();
        expect(response.body.status).toEqual(true);
        expect(response.body.email).toEqual("admin@auth.server.com");
    });
});
