import {SharedTestFixture} from "../shared-test.fixture";
import {TokenFixture} from "../token.fixture";
import {expect2xx} from "../api-client/client";

/**
 * Preservation Property Tests — Auth Code Reuse Fix
 *
 * Property 2: Preservation - Valid Codes Continue to Pass Verification
 *
 * Validates: Requirements 3.1, 3.2, 3.3, 3.4
 */
describe('Preservation: valid codes continue to pass verification', () => {
    let app: SharedTestFixture;
    let tokenFixture: TokenFixture;
    const clientId = "auth-code-reuse-test.local";
    const redirectUri = "http://localhost:3000/callback";
    const email = "admin@auth-code-reuse-test.local";
    const password = "admin9000";
    const challenge = "auth-code-reuse-preservation-challenge-ABCDE";
    const verifier = "auth-code-reuse-preservation-challenge-ABCDE";

    beforeAll(async () => {
        app = new SharedTestFixture();
        tokenFixture = new TokenFixture(app);
    });

    afterAll(async () => {
        await app.close();
    });

    /**
     * Property: Login always issues a fresh, valid auth code
     * Validates: Requirement 3.2
     */
    it('login should issue a fresh authorization code', async () => {
        const code = await tokenFixture.fetchAuthCodeWithConsentFlow(email, password, {
            clientId,
            redirectUri,
            scope: 'openid profile email',
            state: 'test-state',
            codeChallenge: challenge,
            codeChallengeMethod: 'plain',
        });

        expect(typeof code).toEqual('string');
        expect(code.length).toBeGreaterThan(0);
    });

    /**
     * Property: Each login issues a unique code (not reusing previous codes)
     * Validates: Requirement 3.2
     */
    it('consecutive logins should issue distinct authorization codes', async () => {
        const code1 = await tokenFixture.fetchAuthCodeWithConsentFlow(email, password, {
            clientId,
            redirectUri,
            scope: 'openid profile email',
            state: 'test-state',
            codeChallenge: challenge,
            codeChallengeMethod: 'plain',
        });
        const code2 = await tokenFixture.fetchAuthCodeWithConsentFlow(email, password, {
            clientId,
            redirectUri,
            scope: 'openid profile email',
            state: 'test-state',
            codeChallenge: challenge,
            codeChallengeMethod: 'plain',
        });

        expect(code1).not.toEqual(code2);
    });

    /**
     * Property: verify-auth-code returns status: true for a fresh unused code
     * Validates: Requirements 3.1, 3.4
     */
    it('verify-auth-code should return status: true for a fresh unused code', async () => {
        const code = await tokenFixture.fetchAuthCodeWithConsentFlow(email, password, {
            clientId,
            redirectUri,
            scope: 'openid profile email',
            state: 'test-state',
            codeChallenge: challenge,
            codeChallengeMethod: 'plain',
        });

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
     * Validates: Requirement 3.1
     */
    it('verify-auth-code should be idempotent for fresh codes', async () => {
        const code = await tokenFixture.fetchAuthCodeWithConsentFlow(email, password, {
            clientId,
            redirectUri,
            scope: 'openid profile email',
            state: 'test-state',
            codeChallenge: challenge,
            codeChallengeMethod: 'plain',
        });

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
     * Property: token exchange should succeed for a fresh unused code
     * Validates: Requirement 3.3
     */
    it('token exchange should succeed for a fresh unused code', async () => {
        const code = await tokenFixture.fetchAuthCodeWithConsentFlow(email, password, {
            clientId,
            redirectUri,
            scope: 'openid profile email',
            state: 'test-state',
            codeChallenge: challenge,
            codeChallengeMethod: 'plain',
        });

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
        expect(tokenResponse.body.token_type).toEqual('Bearer');
    });

    /**
     * Property: Token exchange returns a valid JWT access token containing expected claims
     * Validates: Requirement 3.3
     */
    it('token exchange should return a valid JWT with user claims', async () => {
        const code = await tokenFixture.fetchAuthCodeWithConsentFlow(email, password, {
            clientId,
            redirectUri,
            scope: 'openid profile email',
            state: 'test-state',
            codeChallenge: challenge,
            codeChallengeMethod: 'plain',
        });

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

        const jwt = app.jwtService();
        const decoded = jwt.decode(tokenResponse.body.access_token) as any;

        expect(decoded).toBeDefined();
        expect(decoded.sub).toBeDefined();
        expect(decoded.tenant).toBeDefined();
        expect(decoded.tenant.domain).toEqual(clientId);
    });

    /**
     * Property: The full flow (login → verify → exchange) works end-to-end
     * Validates: Requirements 3.1, 3.3, 3.4
     */
    it('verify then exchange should both succeed for a fresh code', async () => {
        const code = await tokenFixture.fetchAuthCodeWithConsentFlow(email, password, {
            clientId,
            redirectUri,
            scope: 'openid profile email',
            state: 'test-state',
            codeChallenge: challenge,
            codeChallengeMethod: 'plain',
        });

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
                redirect_uri: redirectUri,
            })
            .set('Accept', 'application/json');

        expect2xx(tokenResponse);
        expect(tokenResponse.body.access_token).toBeDefined();
        expect(tokenResponse.body.token_type).toEqual('Bearer');
    });

    /**
     * Property: verify-auth-code rejects codes that don't belong to the specified client
     * Validates: Requirement 3.4
     */
    it('verify-auth-code should reject a code with wrong client_id', async () => {
        const code = await tokenFixture.fetchAuthCodeWithConsentFlow(email, password, {
            clientId,
            redirectUri,
            scope: 'openid profile email',
            state: 'test-state',
            codeChallenge: challenge,
            codeChallengeMethod: 'plain',
        });

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
