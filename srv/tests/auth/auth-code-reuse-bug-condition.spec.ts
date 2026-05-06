import {SharedTestFixture} from "../shared-test.fixture";
import {expect2xx} from "../api-client/client";

/**
 * Bug Condition Exploration Test — Auth Code Reuse
 *
 * Property 1: Bug Condition - Used/Expired Codes Pass Verification
 *
 * This test demonstrates that `POST /api/oauth/verify-auth-code` incorrectly
 * accepts authorization codes that have already been redeemed (used = true)
 * or have expired (expiresAt < NOW()).
 *
 * Per RFC 6749 §4.1.2 and the bug analysis, the verify-auth-code endpoint
 * should reject used/expired codes. On UNFIXED code, these tests are EXPECTED
 * TO FAIL — failure confirms the bug exists.
 *
 * Property assertion:
 *   FOR ALL codes WHERE isBugCondition(code): verifyAuthCode(code, clientId) raises error
 *
 * Where isBugCondition(code) = code.used === true OR code.expiresAt < NOW()
 *
 * Validates: Requirements 1.3, 1.4, 2.3, 2.4
 */
describe('Bug Condition: verify-auth-code accepts used/expired codes', () => {
    let app: SharedTestFixture;
    const clientId = "auth-code-reuse-test.local";
    const email = "admin@auth-code-reuse-test.local";
    const password = "admin9000";
    const challenge = "auth-code-reuse-test-challenge-ABCDEFGHIJKLMNO";
    const verifier = "auth-code-reuse-test-challenge-ABCDEFGHIJKLMNO";

    beforeAll(async () => {
        app = new SharedTestFixture();
    });

    afterAll(async () => {
        await app.close();
    });

    /**
     * Helper: login and return the authorization code.
     */
    async function loginAndGetCode(): Promise<string> {
        const response = await app.getHttpServer()
            .post('/api/oauth/login')
            .send({
                email,
                password,
                client_id: clientId,
                code_challenge: challenge,
                code_challenge_method: "plain",
            })
            .set('Accept', 'application/json');

        expect(response.status).toEqual(201);
        expect(response.body.authentication_code).toBeDefined();
        return response.body.authentication_code;
    }

    /**
     * Test case 1: Used code should be rejected by verify-auth-code
     *
     * Steps:
     * 1. Login to get a fresh auth code
     * 2. Redeem it via /api/oauth/token (marks used = true)
     * 3. Call POST /api/oauth/verify-auth-code with the used code
     * 4. Assert it returns an error (not status: true)
     *
     * Bug condition: code.used === true
     * Expected on UNFIXED code: FAILS (verify-auth-code returns status: true)
     */
    it('should reject a code that has been redeemed (used = true)', async () => {
        // Step 1: Login to get a fresh code
        const code = await loginAndGetCode();

        // Step 2: Redeem the code via token exchange (marks used = true)
        const tokenResponse = await app.getHttpServer()
            .post('/api/oauth/token')
            .send({
                grant_type: "authorization_code",
                code,
                code_verifier: verifier,
                client_id: clientId,
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
        // The endpoint should reject used codes with an error status
        expect(verifyResponse.body.status).not.toEqual(true);
    });

    /**
     * Test case 2: Expired code should be rejected by verify-auth-code
     *
     * Steps:
     * 1. Login to get a fresh auth code
     * 2. Force-expire the code via test-utils endpoint
     * 3. Call POST /api/oauth/verify-auth-code with the expired code
     * 4. Assert it returns an error (not status: true)
     *
     * Bug condition: code.expiresAt < NOW()
     * Expected on UNFIXED code: FAILS (verify-auth-code returns status: true)
     */
    it('should reject a code that has expired (expiresAt < NOW())', async () => {
        // Step 1: Login to get a fresh code
        const code = await loginAndGetCode();

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
     *
     * Steps:
     * 1. Login to get a fresh auth code
     * 2. Redeem it via /api/oauth/token (marks used = true)
     * 3. Force-expire the code via test-utils endpoint
     * 4. Call POST /api/oauth/verify-auth-code with the used+expired code
     * 5. Assert it returns an error (not status: true)
     *
     * Bug condition: code.used === true AND code.expiresAt < NOW()
     * Expected on UNFIXED code: FAILS (verify-auth-code returns status: true)
     */
    it('should reject a code that is both used AND expired', async () => {
        // Step 1: Login to get a fresh code
        const code = await loginAndGetCode();

        // Step 2: Redeem the code (marks used = true)
        const tokenResponse = await app.getHttpServer()
            .post('/api/oauth/token')
            .send({
                grant_type: "authorization_code",
                code,
                code_verifier: verifier,
                client_id: clientId,
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
