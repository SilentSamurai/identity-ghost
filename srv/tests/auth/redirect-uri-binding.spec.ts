import {SharedTestFixture} from "../shared-test.fixture";
import {expect2xx} from "../api-client/client";

/**
 * Integration tests for redirect_uri binding in the authorization code flow (RFC 6749 §4.1.3).
 *
 * When a redirect_uri is provided during the /login (authorize) step, the server stores it
 * alongside the authorization code. During the token exchange (/token), the server enforces
 * that the same redirect_uri is presented — preventing an attacker from intercepting a code
 * and exchanging it at a different endpoint.
 */
describe('redirect_uri binding in authorization code flow', () => {
    let app: SharedTestFixture;
    const clientId = "auth.server.com";
    const verifier = "challenge-ABCD";
    const challenge = "challenge-ABCD";
    const email = "admin@auth.server.com";
    const password = "admin9000";

    beforeAll(async () => {
        app = new SharedTestFixture();
    });

    afterAll(async () => {
        await app.close();
    });

    /**
     * Helper: performs a login request with PKCE and an optional redirect_uri.
     * Returns the authorization code issued by the server.
     * If redirectUri is provided, it gets stored with the auth code in the database.
     */
    async function loginAndGetCode(redirectUri?: string): Promise<string> {
        const payload: any = {
            code_challenge: challenge,
            email,
            password,
            client_id: clientId,
            code_challenge_method: "plain",
        };
        if (redirectUri) {
            payload.redirect_uri = redirectUri;
        }
        const response = await app.getHttpServer()
            .post('/api/oauth/login')
            .send(payload)
            .set('Accept', 'application/json');
        expect(response.status).toEqual(201);
        expect(response.body.authentication_code).toBeDefined();
        return response.body.authentication_code;
    }

    // Happy path: login with a redirect_uri, then exchange the code with the same redirect_uri.
    // The server should accept the request and return an access token.
    it('should succeed when redirect_uri matches the stored value', async () => {
        const redirectUri = "https://myapp.example.com/callback";
        const code = await loginAndGetCode(redirectUri);

        const response = await app.getHttpServer()
            .post('/api/oauth/token')
            .send({
                grant_type: "authorization_code",
                code,
                code_verifier: verifier,
                client_id: clientId,
                redirect_uri: redirectUri,
            })
            .set('Accept', 'application/json');

        expect2xx(response);
        expect(response.body.access_token).toBeDefined();
    });

    // Attack scenario: login with a legitimate redirect_uri, but attempt to exchange the code
    // with a different (malicious) redirect_uri. The server must reject this with invalid_grant.
    it('should return invalid_grant when redirect_uri does not match', async () => {
        const redirectUri = "https://myapp.example.com/callback";
        const code = await loginAndGetCode(redirectUri);

        const response = await app.getHttpServer()
            .post('/api/oauth/token')
            .send({
                grant_type: "authorization_code",
                code,
                code_verifier: verifier,
                client_id: clientId,
                redirect_uri: "https://evil.example.com/steal",
            })
            .set('Accept', 'application/json');

        expect(response.status).toEqual(400);
        expect(response.body.error).toEqual("invalid_grant");
        expect(response.body.error_description).toEqual("redirect_uri does not match");
    });

    // Omission attack: login with a redirect_uri stored on the code, but omit it entirely
    // during the token exchange. The server must still reject — if a redirect_uri was bound
    // to the code, it must be presented during exchange.
    it('should return invalid_grant when redirect_uri was stored but omitted in token request', async () => {
        const redirectUri = "https://myapp.example.com/callback";
        const code = await loginAndGetCode(redirectUri);

        const response = await app.getHttpServer()
            .post('/api/oauth/token')
            .send({
                grant_type: "authorization_code",
                code,
                code_verifier: verifier,
                client_id: clientId,
                // redirect_uri intentionally omitted
            })
            .set('Accept', 'application/json');

        expect(response.status).toEqual(400);
        expect(response.body.error).toEqual("invalid_grant");
        expect(response.body.error_description).toEqual("redirect_uri does not match");
    });

    // Backward compatibility: when no redirect_uri was provided during login, the server
    // should not require one during token exchange. This preserves existing behavior for
    // clients that don't use redirect_uri in the code flow.
    it('should succeed when no redirect_uri was stored and none provided in token request', async () => {
        const code = await loginAndGetCode(); // no redirect_uri

        const response = await app.getHttpServer()
            .post('/api/oauth/token')
            .send({
                grant_type: "authorization_code",
                code,
                code_verifier: verifier,
                client_id: clientId,
            })
            .set('Accept', 'application/json');

        expect2xx(response);
        expect(response.body.access_token).toBeDefined();
    });
});
