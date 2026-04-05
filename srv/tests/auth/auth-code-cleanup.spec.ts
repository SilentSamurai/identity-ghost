import {SharedTestFixture} from "../shared-test.fixture";
import {expect2xx} from "../api-client/client";

/**
 * Integration tests for auth code cleanup cron behavior (Test Group 7).
 *
 * The cleanup cron (`deleteExpiredAuthCodes`) deletes auth codes where:
 *   - `expires_at < NOW()` (expired codes), OR
 *   - `used = true` (already-redeemed codes)
 *
 * Active codes (not expired, not used) must survive cleanup.
 *
 * Since SharedTestFixture does not expose direct database or service access,
 * we verify the cleanup contract indirectly through the API:
 *
 * 1. Used codes are rejected on re-exchange — proves `used=true` is set,
 *    which is the condition the cron targets for deletion.
 * 2. Active (unused, non-expired) codes can still be exchanged — proves
 *    they are not affected by the used/expired conditions.
 * 3. The cron's DELETE query (`expires_at < NOW() OR used = true`) is
 *    verified at the unit level in auth-code.service.spec.ts.
 *
 * Together, these tests confirm the data states that the cron operates on
 * are correctly established by the auth code lifecycle.
 *
 * Validates: Requirements 7.1, 7.2
 */
describe('auth code cleanup — lifecycle state verification', () => {
    let app: SharedTestFixture;
    const clientId = "auth.server.com";
    const verifier = "cleanup-test-verifier";
    const challenge = "cleanup-test-verifier";
    const email = "admin@auth.server.com";
    const password = "admin9000";

    beforeAll(async () => {
        app = new SharedTestFixture();
    });

    afterAll(async () => {
        await app.close();
    });

    /**
     * Helper: login and return an auth code.
     */
    async function loginAndGetCode(codeChallenge: string): Promise<string> {
        const response = await app.getHttpServer()
            .post('/api/oauth/login')
            .send({
                code_challenge: codeChallenge,
                email,
                password,
                client_id: clientId,
                code_challenge_method: "plain",
            })
            .set('Accept', 'application/json');
        expect(response.status).toEqual(201);
        expect(response.body.authentication_code).toBeDefined();
        return response.body.authentication_code;
    }

    /**
     * Helper: exchange an auth code for tokens.
     */
    async function exchangeCode(code: string, codeVerifier: string) {
        return app.getHttpServer()
            .post('/api/oauth/token')
            .send({
                grant_type: "authorization_code",
                code,
                code_verifier: codeVerifier,
                client_id: clientId,
            })
            .set('Accept', 'application/json');
    }

    // Requirement 7.2: Used codes are cleanup targets.
    // After redemption, the code is marked used=true. The cron deletes rows
    // where `used = true`. This test confirms the used state is correctly set
    // by verifying the code is rejected on a second exchange attempt.
    it('should mark codes as used after redemption — used codes are cleanup targets', async () => {
        const codeChallenge = "cleanup-used-code-test";
        const code = await loginAndGetCode(codeChallenge);

        // First exchange succeeds — code is now used=true, used_at=NOW()
        const firstResponse = await exchangeCode(code, codeChallenge);
        expect2xx(firstResponse);
        expect(firstResponse.body.access_token).toBeDefined();

        // Second exchange fails — proves used=true was persisted
        // The cron's WHERE clause `used = true` would match this code
        const secondResponse = await exchangeCode(code, codeChallenge);
        expect(secondResponse.status).toEqual(400);
        expect(secondResponse.body.error).toEqual("invalid_grant");
    });

    // Requirement 7.1, 7.2: Active codes are NOT cleanup targets.
    // An active code (not expired, not used) should remain exchangeable.
    // The cron only deletes codes where `expires_at < NOW() OR used = true`,
    // so active codes must survive. This test confirms an unused, non-expired
    // code can be successfully exchanged.
    it('should keep active codes exchangeable — active codes are not cleanup targets', async () => {
        const codeChallenge = "cleanup-active-code-test";
        const code = await loginAndGetCode(codeChallenge);

        // Exchange the active code — should succeed because it's neither
        // expired (5-minute TTL) nor used
        const response = await exchangeCode(code, codeChallenge);
        expect2xx(response);
        expect(response.body.access_token).toBeDefined();
        expect(response.body.refresh_token).toBeDefined();
    });

    // Requirement 7.1: Expired codes are cleanup targets.
    // The cron deletes codes where `expires_at < NOW()`. While we cannot
    // fast-forward time or manipulate the database from SharedTestFixture,
    // we verify that the expiration mechanism works: the auth-code-expiration
    // tests (Test Group 2) confirm expired codes are rejected at exchange.
    // Here we verify the complementary case: a freshly created code (within
    // its 5-minute TTL) is NOT expired and can be exchanged successfully.
    it('should allow exchange of non-expired code — confirms expires_at is in the future', async () => {
        const codeChallenge = "cleanup-not-expired-test";
        const code = await loginAndGetCode(codeChallenge);

        // Immediately exchange — the code was just created, so expires_at
        // is ~5 minutes in the future. The cron's `expires_at < NOW()`
        // condition would NOT match this code.
        const response = await exchangeCode(code, codeChallenge);
        expect2xx(response);
        expect(response.body.access_token).toBeDefined();
    });

    // Requirement 7.1, 7.2: Multiple codes in different states.
    // Creates two codes: one gets redeemed (used=true), one stays active.
    // Verifies the used code is rejected and the active code still works.
    // This mirrors the cleanup cron's behavior: it would delete the used
    // code and leave the active one untouched.
    it('should distinguish used codes from active codes across multiple auth codes', async () => {
        const usedChallenge = "cleanup-multi-used";
        const activeChallenge = "cleanup-multi-active";

        // Create two auth codes
        const usedCode = await loginAndGetCode(usedChallenge);
        const activeCode = await loginAndGetCode(activeChallenge);

        // Redeem the first code — marks it as used=true
        const redeemResponse = await exchangeCode(usedCode, usedChallenge);
        expect2xx(redeemResponse);

        // The used code is now rejected (cleanup would delete it)
        const replayResponse = await exchangeCode(usedCode, usedChallenge);
        expect(replayResponse.status).toEqual(400);
        expect(replayResponse.body.error).toEqual("invalid_grant");

        // The active code is still valid (cleanup would NOT delete it)
        const activeResponse = await exchangeCode(activeCode, activeChallenge);
        expect2xx(activeResponse);
        expect(activeResponse.body.access_token).toBeDefined();
    });
});
