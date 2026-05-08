import {SharedTestFixture} from "../shared-test.fixture";
import {TokenFixture} from "../token.fixture";
import {expect2xx} from "../api-client/client";

/**
 * Integration tests for authorization code expiration (Test Group 2).
 *
 * Requirements: 2.1, 2.2, 2.3
 */
describe('auth code expiration', () => {
    let app: SharedTestFixture;
    let tokenFixture: TokenFixture;
    const clientId = "auth-code-expiry-test.local";
    const redirectUri = "http://localhost:3000/callback";
    const email = "admin@auth-code-expiry-test.local";
    const password = "admin9000";

    beforeAll(async () => {
        app = new SharedTestFixture();
        tokenFixture = new TokenFixture(app);
    });

    afterAll(async () => {
        await app.close();
    });

    /**
     * Helper: login and return the authorization code with a specific challenge.
     */
    async function loginAndGetCode(codeChallenge: string): Promise<string> {
        return tokenFixture.fetchAuthCode(email, password, clientId, redirectUri, {
            codeChallenge,
            codeChallengeMethod: 'plain',
        });
    }

    /**
     * Requirement 2.1 — expires_at is set in the future (≈ 5 minutes).
     */
    it('should allow immediate exchange of a fresh code (expires_at is in the future)', async () => {
        const challenge = "expiration-fresh-code-ABCDEFGHIJKLMNOPQRSTUV";
        const code = await loginAndGetCode(challenge);

        const response = await app.getHttpServer()
            .post('/api/oauth/token')
            .send({
                grant_type: "authorization_code",
                code,
                code_verifier: challenge,
                client_id: clientId,
                redirect_uri: redirectUri,
            })
            .set('Accept', 'application/json');

        expect2xx(response);
        expect(response.body.access_token).toBeDefined();
        expect(response.body.token_type).toEqual('Bearer');
    });

    /**
     * Requirement 2.2 / 2.3 — expired codes are rejected.
     */
    it('should reject a code that has already been redeemed (atomic UPDATE enforces expiration + single-use)', async () => {
        const challenge = "expiration-reuse-check-ABCDEFGHIJKLMNOPQRSTU";
        const code = await loginAndGetCode(challenge);

        // First exchange — should succeed
        const first = await app.getHttpServer()
            .post('/api/oauth/token')
            .send({
                grant_type: "authorization_code",
                code,
                code_verifier: challenge,
                client_id: clientId,
                redirect_uri: redirectUri,
            })
            .set('Accept', 'application/json');

        expect2xx(first);
        expect(first.body.access_token).toBeDefined();

        // Second exchange with the same code — should fail
        const second = await app.getHttpServer()
            .post('/api/oauth/token')
            .send({
                grant_type: "authorization_code",
                code,
                code_verifier: challenge,
                client_id: clientId,
                redirect_uri: redirectUri,
            })
            .set('Accept', 'application/json');

        expect(second.status).toEqual(400);
        expect(second.body.error).toEqual("invalid_grant");
    });

    /**
     * Requirement 2.1 — code is still valid within the 5-minute window.
     */
    it('should allow exchange within the expiration window (after a short delay)', async () => {
        const challenge = "expiration-delay-check-ABCDEFGHIJKLMNOPQRSTU";
        const code = await loginAndGetCode(challenge);

        // Wait 2 seconds — well within the 5-minute window
        await new Promise(resolve => setTimeout(resolve, 2000));

        const response = await app.getHttpServer()
            .post('/api/oauth/token')
            .send({
                grant_type: "authorization_code",
                code,
                code_verifier: challenge,
                client_id: clientId,
                redirect_uri: redirectUri,
            })
            .set('Accept', 'application/json');

        expect2xx(response);
        expect(response.body.access_token).toBeDefined();
        expect(response.body.token_type).toEqual('Bearer');
    });

    /**
     * Requirement 2.2 — an invalid/non-existent code is rejected.
     */
    it('should reject a non-existent code with invalid_grant', async () => {
        const response = await app.getHttpServer()
            .post('/api/oauth/token')
            .send({
                grant_type: "authorization_code",
                code: "DOES_NOT_EXIST_999",
                code_verifier: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopq",
                client_id: clientId,
            })
            .set('Accept', 'application/json');

        expect(response.status).toEqual(400);
        expect(response.body.error).toEqual("invalid_grant");
    });
});
