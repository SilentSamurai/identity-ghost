import {SharedTestFixture} from "../shared-test.fixture";
import {TokenFixture} from "../token.fixture";
import {expect2xx} from "../api-client/client";

/**
 * Bug Condition Exploration Test — Auth Code Reuse
 *
 * Validates: Requirements 1.3, 1.4, 2.3, 2.4
 */
describe('Bug Condition: verify-auth-code accepts used/expired codes', () => {
    let app: SharedTestFixture;
    let tokenFixture: TokenFixture;
    const clientId = "auth-code-reuse-test.local";
    const redirectUri = "http://localhost:3000/callback";
    const email = "admin@auth-code-reuse-test.local";
    const password = "admin9000";
    const challenge = "auth-code-reuse-test-challenge-ABCDEFGHIJKLMNO";
    const verifier = "auth-code-reuse-test-challenge-ABCDEFGHIJKLMNO";

    beforeAll(async () => {
        app = new SharedTestFixture();
        tokenFixture = new TokenFixture(app);
    });

    afterAll(async () => {
        await app.close();
    });

    /**
     * Test case 1: Used code should be rejected by verify-auth-code
     */
    it('should reject a code that has been redeemed (used = true)', async () => {
        // Step 1: Get a fresh code
        const code = await tokenFixture.fetchAuthCode(email, password, clientId, redirectUri, {
            codeChallenge: challenge,
            codeChallengeMethod: 'plain',
        });

        // Step 2: Redeem the code via token exchange (marks used = true)
        const tokenResponse = await app.getHttpServer()
            .post('/api/oauth/token')
            .send({
                grant_type: "authorization_code",
                code,
                code_verifier: verifier,
                client_id: clientId,
                redirect_uri: redirectUri,
            })
            .set('Accept', 'application/json');

        expect2xx(tokenResponse);
        expect(tokenResponse.body.access_token).toBeDefined();

        // Step 3: Call verify-auth-code with the used code
        const verifyResponse = await app.getHttpServer()
            .post('/api/oauth/verify-auth-code')
            .send({
                auth_code: code,
                client_id: clientId,
            })
            .set('Accept', 'application/json');

        // Step 4: Assert it returns an error (not status: true)
        expect(verifyResponse.body.status).not.toEqual(true);
    });

    /**
     * Test case 2: Expired code should be rejected by verify-auth-code
     */
    it('should reject a code that has expired (expiresAt < NOW())', async () => {
        // Step 1: Get a fresh code
        const code = await tokenFixture.fetchAuthCode(email, password, clientId, redirectUri, {
            codeChallenge: challenge,
            codeChallengeMethod: 'plain',
        });

        // Step 2: Force-expire the code via test-utils
        const expireResponse = await app.getHttpServer()
            .post(`/api/test-utils/auth-codes/${code}/expire`)
            .set('Accept', 'application/json');

        expect(expireResponse.status).toEqual(204);

        // Step 3: Call verify-auth-code with the expired code
        const verifyResponse = await app.getHttpServer()
            .post('/api/oauth/verify-auth-code')
            .send({
                auth_code: code,
                client_id: clientId,
            })
            .set('Accept', 'application/json');

        // Step 4: Assert it returns an error (not status: true)
        expect(verifyResponse.body.status).not.toEqual(true);
    });

    /**
     * Test case 3: Code that is both used AND expired should be rejected
     */
    it('should reject a code that is both used AND expired', async () => {
        // Step 1: Get a fresh code
        const code = await tokenFixture.fetchAuthCode(email, password, clientId, redirectUri, {
            codeChallenge: challenge,
            codeChallengeMethod: 'plain',
        });

        // Step 2: Redeem the code (marks used = true)
        const tokenResponse = await app.getHttpServer()
            .post('/api/oauth/token')
            .send({
                grant_type: "authorization_code",
                code,
                code_verifier: verifier,
                client_id: clientId,
                redirect_uri: redirectUri,
            })
            .set('Accept', 'application/json');

        expect2xx(tokenResponse);

        // Step 3: Force-expire the code
        const expireResponse = await app.getHttpServer()
            .post(`/api/test-utils/auth-codes/${code}/expire`)
            .set('Accept', 'application/json');

        expect(expireResponse.status).toEqual(204);

        // Step 4: Call verify-auth-code with the used+expired code
        const verifyResponse = await app.getHttpServer()
            .post('/api/oauth/verify-auth-code')
            .send({
                auth_code: code,
                client_id: clientId,
            })
            .set('Accept', 'application/json');

        // Step 5: Assert it returns an error (not status: true)
        expect(verifyResponse.body.status).not.toEqual(true);
    });
});
