import {SharedTestFixture} from "../shared-test.fixture";
import {TokenFixture} from "../token.fixture";
import {expect2xx} from "../api-client/client";

/**
 * Integration tests for redirect_uri binding in the authorization code flow (RFC 6749 §4.1.3).
 *
 * When a redirect_uri is provided during the authorize step, the server stores it
 * alongside the authorization code. During the token exchange (/token), the server enforces
 * that the same redirect_uri is presented — preventing an attacker from intercepting a code
 * and exchanging it at a different endpoint.
 */
describe('redirect_uri binding in authorization code flow', () => {
    let app: SharedTestFixture;
    let tokenFixture: TokenFixture;
    const clientId = "redirect-uri-test.local";
    const registeredRedirectUri = "https://myapp.example.com/callback";
    const verifier = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopq";
    const email = "admin@redirect-uri-test.local";
    const password = "admin9000";

    beforeAll(async () => {
        app = new SharedTestFixture();
        tokenFixture = new TokenFixture(app);
    });

    afterAll(async () => {
        await app.close();
    });

    /**
     * Helper: performs login + authorize with an optional redirect_uri.
     * Returns the authorization code issued by the server.
     * If redirectUri is provided, it gets stored with the auth code in the database.
     */
    async function loginAndGetCode(redirectUri?: string): Promise<string> {
        const sidCookie = await tokenFixture.loginForCookie(email, password, clientId);
        return tokenFixture.authorizeForCode(sidCookie, clientId, redirectUri ?? registeredRedirectUri, {
            codeChallenge: verifier,
            codeChallengeMethod: 'plain',
        });
    }

    // Happy path: authorize with a redirect_uri, then exchange the code with the same redirect_uri.
    it('should succeed when redirect_uri matches the stored value', async () => {
        const code = await loginAndGetCode(registeredRedirectUri);

        const response = await app.getHttpServer()
            .post('/api/oauth/token')
            .send({
                grant_type: "authorization_code",
                code,
                code_verifier: verifier,
                client_id: clientId,
                redirect_uri: registeredRedirectUri,
            })
            .set('Accept', 'application/json');

        expect2xx(response);
        expect(response.body.access_token).toBeDefined();
    });

    // Attack scenario: authorize with a legitimate redirect_uri, but attempt to exchange the code
    // with a different (malicious) redirect_uri.
    it('should return invalid_grant when redirect_uri does not match', async () => {
        const code = await loginAndGetCode(registeredRedirectUri);

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
        expect(response.body.error_description).toEqual("The redirect_uri does not match the value used in the authorization request");
    });

    // Omission attack: authorize with a redirect_uri stored on the code, but omit it entirely
    // during the token exchange.
    it('should return invalid_grant when redirect_uri was stored but omitted in token request', async () => {
        const code = await loginAndGetCode(registeredRedirectUri);

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
        expect(response.body.error_description).toEqual("The redirect_uri parameter is required when it was included in the authorization request");
    });

    // Backward compatibility: when no redirect_uri was provided during authorize, the server
    // should not require one during token exchange.
    // Note: authorizeForCode always passes a redirect_uri (required by authorize endpoint),
    // so this test verifies that when the same URI is used in both places, it works.
    it('should succeed when redirect_uri matches in both authorize and token request', async () => {
        const code = await loginAndGetCode(registeredRedirectUri);

        const response = await app.getHttpServer()
            .post('/api/oauth/token')
            .send({
                grant_type: "authorization_code",
                code,
                code_verifier: verifier,
                client_id: clientId,
                redirect_uri: registeredRedirectUri,
            })
            .set('Accept', 'application/json');

        expect2xx(response);
        expect(response.body.access_token).toBeDefined();
    });
});
