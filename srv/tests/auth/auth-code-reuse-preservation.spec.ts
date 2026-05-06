import {SharedTestFixture} from "../shared-test.fixture";
import {expect2xx} from "../api-client/client";

/**
 * Preservation Property Tests — Auth Code Reuse Fix
 *
 * Property 2: Preservation - Valid Codes Continue to Pass Verification
 *
 * These tests capture the EXISTING correct behavior for fresh, unused, non-expired
 * authorization codes. They are written and run BEFORE the fix is applied to establish
 * a baseline. After the fix, these tests must continue to pass — confirming no regressions.
 *
 * Observation-first methodology:
 * - Observe on UNFIXED code that fresh codes pass verify-auth-code
 * - Observe on UNFIXED code that fresh codes can be exchanged for tokens
 * - Observe on UNFIXED code that login always issues a fresh auth code
 *
 * Property assertions:
 *   FOR ALL codes WHERE NOT isBugCondition(code):
 *     verifyAuthCode(code, clientId) returns { status: true, email: "..." }
 *     redeemAuthCode(code) succeeds and returns tokens
 *     login() issues a fresh, valid auth code
 *
 * Validates: Requirements 3.1, 3.2, 3.3, 3.4
 */
describe('Preservation: valid codes continue to pass verification', () => {
    let app: SharedTestFixture;
    const clientId = "auth-code-reuse-test.local";
    const email = "admin@auth-code-reuse-test.local";
    const password = "admin9000";
    const challenge = "auth-code-reuse-preservation-challenge-ABCDE";
    const verifier = "auth-code-reuse-preservation-challenge-ABCDE";

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
     * Property: Login always issues a fresh, valid auth code
     *
     * Observation: On UNFIXED code, calling POST /api/oauth/login with valid
     * credentials returns a 201 with an `authentication_code` field containing
     * a non-empty string.
     *
     * This confirms the login flow issues new codes correctly — a behavior
     * that must be preserved after the fix.
     *
     * Validates: Requirement 3.2
     */
    it('login should issue a fresh authorization code', async () => {
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
        expect(typeof response.body.authentication_code).toEqual('string');
        expect(response.body.authentication_code.length).toBeGreaterThan(0);
    });

    /**
     * Property: Each login issues a unique code (not reusing previous codes)
     *
     * Observation: Two consecutive logins produce different authorization codes,
     * confirming the system generates fresh codes each time.
     *
     * Validates: Requirement 3.2
     */
    it('consecutive logins should issue distinct authorization codes', async () => {
        const code1 = await loginAndGetCode();
        const code2 = await loginAndGetCode();

        expect(code1).not.toEqual(code2);
    });

    /**
     * Property: For all fresh, unused, non-expired codes belonging to the correct
     * client, verify-auth-code returns { status: true } with the user's email
     *
     * Observation: On UNFIXED code, a freshly-issued code that has NOT been
     * exchanged passes verify-auth-code and returns status: true with the
     * correct email address.
     *
     * Validates: Requirements 3.1, 3.4
     */
    it('verify-auth-code should return status: true for a fresh unused code', async () => {
        const code = await loginAndGetCode();

        const verifyResponse = await app.getHttpServer()
            .post('/api/oauth/verify-auth-code')
            .send({
                auth_code: code,
                client_id: clientId,
            })
            .set('Accept', 'application/json');

        expect2xx(verifyResponse);
        expect(verifyResponse.body.status).toEqual(true);
        expect(verifyResponse.body.email).toEqual(email);
        expect(verifyResponse.body.authentication_code).toEqual(code);
    });

    /**
     * Property: verify-auth-code can be called multiple times on the same fresh code
     * and still returns status: true (verification is non-destructive)
     *
     * Observation: On UNFIXED code, calling verify-auth-code twice with the same
     * fresh code returns status: true both times — verification does not consume
     * the code.
     *
     * Validates: Requirement 3.1
     */
    it('verify-auth-code should be idempotent for fresh codes', async () => {
        const code = await loginAndGetCode();

        // First verification
        const verify1 = await app.getHttpServer()
            .post('/api/oauth/verify-auth-code')
            .send({
                auth_code: code,
                client_id: clientId,
            })
            .set('Accept', 'application/json');

        expect2xx(verify1);
        expect(verify1.body.status).toEqual(true);

        // Second verification — should still pass (non-destructive)
        const verify2 = await app.getHttpServer()
            .post('/api/oauth/verify-auth-code')
            .send({
                auth_code: code,
                client_id: clientId,
            })
            .set('Accept', 'application/json');

        expect2xx(verify2);
        expect(verify2.body.status).toEqual(true);
        expect(verify2.body.email).toEqual(email);
    });

    /**
     * Property: For all fresh codes, redeemAuthCode via token exchange succeeds
     * and returns tokens (access_token, refresh_token)
     *
     * Observation: On UNFIXED code, a freshly-issued code can be exchanged for
     * tokens via POST /api/oauth/token with grant_type=authorization_code.
     * The response contains access_token and token_type.
     *
     * Validates: Requirement 3.3
     */
    it('token exchange should succeed for a fresh unused code', async () => {
        const code = await loginAndGetCode();

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
        expect(tokenResponse.body.token_type).toEqual('Bearer');
    });

    /**
     * Property: Token exchange returns a valid JWT access token containing
     * expected claims (sub, tenant context)
     *
     * Observation: On UNFIXED code, the access_token from a successful exchange
     * is a valid JWT that can be decoded and contains the user's sub and tenant info.
     *
     * Validates: Requirement 3.3
     */
    it('token exchange should return a valid JWT with user claims', async () => {
        const code = await loginAndGetCode();

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

        // Decode the access token (without verification — just checking structure)
        const jwt = app.jwtService();
        const decoded = jwt.decode(tokenResponse.body.access_token) as any;

        expect(decoded).toBeDefined();
        expect(decoded.sub).toBeDefined();
        expect(decoded.tenant).toBeDefined();
        expect(decoded.tenant.domain).toEqual(clientId);
    });

    /**
     * Property: The full flow (login → verify → exchange) works end-to-end
     * for a fresh code
     *
     * Observation: On UNFIXED code, a code that passes verify-auth-code can
     * subsequently be exchanged for tokens. The verify step does not interfere
     * with the exchange step.
     *
     * Validates: Requirements 3.1, 3.3, 3.4
     */
    it('verify then exchange should both succeed for a fresh code', async () => {
        const code = await loginAndGetCode();

        // Step 1: Verify the code
        const verifyResponse = await app.getHttpServer()
            .post('/api/oauth/verify-auth-code')
            .send({
                auth_code: code,
                client_id: clientId,
            })
            .set('Accept', 'application/json');

        expect2xx(verifyResponse);
        expect(verifyResponse.body.status).toEqual(true);
        expect(verifyResponse.body.email).toEqual(email);

        // Step 2: Exchange the code for tokens (verify did not consume it)
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
        expect(tokenResponse.body.token_type).toEqual('Bearer');
    });

    /**
     * Property: verify-auth-code rejects codes that don't belong to the
     * specified client (tenant mismatch)
     *
     * Observation: On UNFIXED code, calling verify-auth-code with a valid code
     * but a different client_id returns an error. This cross-tenant isolation
     * must be preserved.
     *
     * Validates: Requirement 3.4
     */
    it('verify-auth-code should reject a code with wrong client_id', async () => {
        const code = await loginAndGetCode();

        // Use a different client_id that doesn't match the code's tenant
        const verifyResponse = await app.getHttpServer()
            .post('/api/oauth/verify-auth-code')
            .send({
                auth_code: code,
                client_id: "auth.server.com",
            })
            .set('Accept', 'application/json');

        // Should fail — code belongs to auth-code-reuse-test.local, not auth.server.com
        expect(verifyResponse.body.status).not.toEqual(true);
    });
});
