import {SharedTestFixture} from "../shared-test.fixture";
import {TokenFixture} from "../token.fixture";
import {expect2xx} from "../api-client/client";

/**
 * Integration tests for concurrency safety of authorization code redemption.
 *
 * The atomic UPDATE ... WHERE used = false pattern ensures that when two concurrent
 * token exchange requests present the same authorization code, exactly one succeeds
 * and the other receives an invalid_grant error.
 *
 * Validates: Requirements 6.1, 6.2
 */
describe('auth code concurrency safety', () => {
    let app: SharedTestFixture;
    let tokenFixture: TokenFixture;
    const clientId = "auth.server.com";
    const redirectUri = "http://localhost:3000/callback";
    const verifier = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopq";
    const email = "admin@auth.server.com";
    const password = "admin9000";

    beforeAll(async () => {
        app = new SharedTestFixture();
        tokenFixture = new TokenFixture(app);
    });

    afterAll(async () => {
        await app.close();
    });

    it('should allow exactly one of two concurrent token exchanges to succeed', async () => {
        const code = await tokenFixture.fetchAuthCode(email, password, clientId, redirectUri);

        const tokenPayload = {
            grant_type: "authorization_code",
            code,
            client_id: clientId,
            code_verifier: verifier,
            redirect_uri: redirectUri,
        };

        // Fire two concurrent requests with the same auth code
        const [res1, res2] = await Promise.all([
            app.getHttpServer()
                .post('/api/oauth/token')
                .send(tokenPayload)
                .set('Accept', 'application/json'),
            app.getHttpServer()
                .post('/api/oauth/token')
                .send(tokenPayload)
                .set('Accept', 'application/json'),
        ]);

        // Sort by status so we can assert deterministically
        const sorted = [res1, res2].sort((a, b) => a.status - b.status);
        const success = sorted[0];
        const failure = sorted[1];

        // Exactly one should succeed with a token
        expect(success.status).toEqual(200);
        expect(success.body.access_token).toBeDefined();

        // Exactly one should fail with invalid_grant
        expect(failure.status).toEqual(400);
        expect(failure.body.error).toEqual("invalid_grant");
    });
});
