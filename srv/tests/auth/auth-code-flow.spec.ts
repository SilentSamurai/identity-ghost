import {SharedTestFixture} from "../shared-test.fixture";
import {expect2xx} from "../api-client/client";

describe('e2e positive auth code flow', () => {
    let app: SharedTestFixture;
    let authentication_code = "";
    let accessToken = "";
    let clientId = "auth.server.com";
    let clientSecret = "";
    const verifier = "challenge-ABCD";
    const challenge = "challenge-ABCD";

    beforeAll(async () => {
        app = new SharedTestFixture();
    });

    afterAll(async () => {
        await app.close();
    });

    it(`/POST login `, async () => {
        const response = await app.getHttpServer()
            .post('/api/oauth/login')
            .send({
                "code_challenge": challenge,
                "email": "admin@auth.server.com",
                "password": "admin9000",
                "client_id": clientId,
                "code_challenge_method": "plain"
            })
            .set('Accept', 'application/json');
        // console.log(JSON.stringify(response));
        expect(response.status).toEqual(201);
        expect(response.body.authentication_code).toBeDefined();
        authentication_code = response.body.authentication_code;
    });

    it(`/POST Fetch Access Token`, async () => {
        const response = await app.getHttpServer()
            .post('/api/oauth/token')
            .send({
                "grant_type": "authorization_code",
                "code": authentication_code,
                client_id: clientId,
                "code_verifier": verifier
            })
            .set('Accept', 'application/json');

        console.log("Fetch Access Token:", response.body);
        expect2xx(response);

        expect(response.status).toEqual(201);
        expect(response.body.access_token).toBeDefined();
        expect(response.body.expires_in).toBeDefined();
        expect(response.body.token_type).toEqual('Bearer');
        expect(response.body.refresh_token).toBeDefined();

        accessToken = response.body.access_token;
    });


    it(`/POST Verify auth gen code`, async () => {
        const response = await app.getHttpServer()
            .post('/api/oauth/verify-auth-code')
            .send({
                "auth_code": authentication_code,
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

