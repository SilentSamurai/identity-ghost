import {SharedTestFixture} from "../shared-test.fixture";
import {TokenFixture, AuthorizeParams} from "../token.fixture";

describe('e2e positive auth code flow', () => {
    let app: SharedTestFixture;
    let tokenFixture: TokenFixture;
    let authentication_code = "";
    let accessToken = "";
    const clientId = "auth.server.com";
    const redirectUri = "http://localhost:3000/callback";
    const verifier = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopq";

    const authorizeParams: AuthorizeParams = {
        clientId,
        redirectUri,
        scope: 'openid profile email',
        state: 'test-state',
        codeChallenge: verifier,
        codeChallengeMethod: 'plain',
    };

    beforeAll(async () => {
        app = new SharedTestFixture();
        tokenFixture = new TokenFixture(app);

        authentication_code = await tokenFixture.fetchAuthCodeWithConsentFlow(
            "admin@auth.server.com",
            "admin9000",
            authorizeParams,
        );
    });

    afterAll(async () => {
        await app.close();
    });

    it(`/POST Fetch Access Token`, async () => {
        const tokens = await tokenFixture.exchangeAuthorizationCode(
            authentication_code,
            clientId,
            verifier,
            redirectUri,
        );

        expect(tokens.access_token).toBeDefined();
        expect(tokens.expires_in).toBeDefined();
        expect(tokens.token_type).toEqual('Bearer');
        expect(tokens.refresh_token).toBeDefined();

        accessToken = tokens.access_token;
    });

    it(`/POST Verify auth gen code`, async () => {
        const freshCode = await tokenFixture.fetchAuthCodeWithConsentFlow(
            "admin@auth.server.com",
            "admin9000",
            authorizeParams,
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
