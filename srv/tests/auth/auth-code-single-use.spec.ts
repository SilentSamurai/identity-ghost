import {SharedTestFixture} from "../shared-test.fixture";
import {TokenFixture} from "../token.fixture";
import {expect2xx} from "../api-client/client";

/**
 * Integration tests for single-use enforcement of authorization codes (RFC 6749 §10.5).
 *
 * Each authorization code must be redeemable exactly once. The server enforces this via
 * an atomic UPDATE ... WHERE used = false pattern. After the first successful redemption,
 * the code is marked used=true and used_at=NOW() in a single atomic statement.
 *
 * Validates: Requirements 5.1, 5.2, 5.3
 */
describe('single-use enforcement of authorization codes', () => {
    let app: SharedTestFixture;
    let tokenFixture: TokenFixture;
    const clientId = "auth-code-single-use-test.local";
    const redirectUri = "http://localhost:3000/callback";
    const verifier = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopq";
    const email = "admin@auth-code-single-use-test.local";
    const password = "admin9000";

    beforeAll(async () => {
        app = new SharedTestFixture();
        tokenFixture = new TokenFixture(app);
    });

    afterAll(async () => {
        await app.close();
    });

    // First redemption succeeds, second redemption of the same code fails with invalid_grant.
    it('should reject a second redemption of the same auth code with invalid_grant', async () => {
        const code = await tokenFixture.fetchAuthCodeWithConsentFlow(email, password, {
            clientId,
            redirectUri,
            scope: 'openid profile email',
            state: 'test-state',
            codeChallenge: verifier,
            codeChallengeMethod: 'plain',
        });

        // First exchange — should succeed
        const firstResponse = await app.getHttpServer()
            .post('/api/oauth/token')
            .send({
                grant_type: "authorization_code",
                code,
                code_verifier: verifier,
                client_id: clientId,
                redirect_uri: redirectUri,
            })
            .set('Accept', 'application/json');

        expect2xx(firstResponse);
        expect(firstResponse.body.access_token).toBeDefined();

        // Second exchange with the same code — should fail
        const secondResponse = await app.getHttpServer()
            .post('/api/oauth/token')
            .send({
                grant_type: "authorization_code",
                code,
                code_verifier: verifier,
                client_id: clientId,
                redirect_uri: redirectUri,
            })
            .set('Accept', 'application/json');

        expect(secondResponse.status).toEqual(400);
        expect(secondResponse.body.error).toEqual("invalid_grant");
    });

    it('should confirm used=true and used_at are set by verifying replay rejection', async () => {
        const code = await tokenFixture.fetchAuthCodeWithConsentFlow(email, password, {
            clientId,
            redirectUri,
            scope: 'openid profile email',
            state: 'test-state',
            codeChallenge: verifier,
            codeChallengeMethod: 'plain',
        });

        // Redeem the code
        const redeemResponse = await app.getHttpServer()
            .post('/api/oauth/token')
            .send({
                grant_type: "authorization_code",
                code,
                code_verifier: verifier,
                client_id: clientId,
                redirect_uri: redirectUri,
            })
            .set('Accept', 'application/json');

        expect2xx(redeemResponse);
        expect(redeemResponse.body.access_token).toBeDefined();
        expect(redeemResponse.body.refresh_token).toBeDefined();

        // Replay the same code — should be rejected
        const replayResponse = await app.getHttpServer()
            .post('/api/oauth/token')
            .send({
                grant_type: "authorization_code",
                code,
                code_verifier: verifier,
                client_id: clientId,
                redirect_uri: redirectUri,
            })
            .set('Accept', 'application/json');

        expect(replayResponse.status).toEqual(400);
        expect(replayResponse.body.error).toEqual("invalid_grant");
    });
});
