import {SharedTestFixture} from '../shared-test.fixture';

/**
 * Integration test: PKCE format validation at token endpoint
 *
 * Validates that the CodeGrantSchema rejects code_verifier values that
 * violate RFC 7636 §4.1 format constraints (length and charset) with
 * an invalid_request error, and accepts valid verifiers past format
 * validation.
 *
 * Validates: Requirements 1.1, 1.2, 1.3, 1.4
 */
describe('PKCE format validation at token endpoint', () => {
    let app: SharedTestFixture;

    const clientId = 'auth.server.com';
    const email = 'admin@auth.server.com';
    const password = 'admin9000';

    // A valid verifier (exactly 43 chars, unreserved charset) used as the
    // plain challenge during login. Token exchange will fail with
    // invalid_grant for non-matching verifiers, but NOT with invalid_request.
    const validChallenge = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopq';

    beforeAll(async () => {
        app = new SharedTestFixture();
    });

    afterAll(async () => {
        await app.close();
    });

    /** Helper: obtain a fresh single-use auth code via the login endpoint */
    async function getAuthCode(): Promise<string> {
        const response = await app.getHttpServer()
            .post('/api/oauth/login')
            .send({
                email,
                password,
                client_id: clientId,
                code_challenge: validChallenge,
                code_challenge_method: 'plain',
            })
            .set('Accept', 'application/json');

        expect(response.status).toEqual(201);
        expect(response.body.authentication_code).toBeDefined();
        return response.body.authentication_code;
    }

    /** Helper: attempt token exchange with a given code_verifier */
    async function exchangeToken(code: string, codeVerifier: string) {
        return app.getHttpServer()
            .post('/api/oauth/token')
            .send({
                grant_type: 'authorization_code',
                code,
                client_id: clientId,
                code_verifier: codeVerifier,
            })
            .set('Accept', 'application/json');
    }

    it('rejects code_verifier shorter than 43 characters', async () => {
        const code = await getAuthCode();
        const shortVerifier = 'A'.repeat(42);
        const response = await exchangeToken(code, shortVerifier);

        expect(response.status).toEqual(400);
        expect(response.body.error).toEqual('invalid_request');
    });

    it('rejects code_verifier of length 1', async () => {
        const code = await getAuthCode();
        const response = await exchangeToken(code, 'A');

        expect(response.status).toEqual(400);
        expect(response.body.error).toEqual('invalid_request');
    });

    it('rejects code_verifier longer than 128 characters', async () => {
        const code = await getAuthCode();
        const longVerifier = 'A'.repeat(129);
        const response = await exchangeToken(code, longVerifier);

        expect(response.status).toEqual(400);
        expect(response.body.error).toEqual('invalid_request');
    });

    it('rejects code_verifier with spaces', async () => {
        const code = await getAuthCode();
        const verifierWithSpaces = 'A'.repeat(42) + ' valid';
        const response = await exchangeToken(code, verifierWithSpaces);

        expect(response.status).toEqual(400);
        expect(response.body.error).toEqual('invalid_request');
    });

    it('rejects code_verifier with unicode characters', async () => {
        const code = await getAuthCode();
        const verifierWithUnicode = 'A'.repeat(42) + 'é';
        const response = await exchangeToken(code, verifierWithUnicode);

        expect(response.status).toEqual(400);
        expect(response.body.error).toEqual('invalid_request');
    });

    it('rejects code_verifier with special chars @#$', async () => {
        const code = await getAuthCode();
        const verifierWithSpecial = 'A'.repeat(40) + '@#$';
        const response = await exchangeToken(code, verifierWithSpecial);

        expect(response.status).toEqual(400);
        expect(response.body.error).toEqual('invalid_request');
    });

    it('accepts valid verifier (43 chars, unreserved charset) past format validation', async () => {
        const code = await getAuthCode();
        // Valid format but won't match the challenge → expect invalid_grant, NOT invalid_request
        const validVerifier = 'B'.repeat(43);
        const response = await exchangeToken(code, validVerifier);

        // Should NOT be invalid_request (format is fine)
        expect(response.body.error).not.toEqual('invalid_request');
    });

    it('accepts valid verifier (128 chars, unreserved charset) past format validation', async () => {
        const code = await getAuthCode();
        const validVerifier = 'abcdefghijklmnopqrstuvwxyz0123456789-._~ABCD'.repeat(3).slice(0, 128);
        const response = await exchangeToken(code, validVerifier);

        // Should NOT be invalid_request (format is fine)
        expect(response.body.error).not.toEqual('invalid_request');
    });

    it('accepts valid verifier with all unreserved chars past format validation', async () => {
        const code = await getAuthCode();
        // Use all unreserved chars: A-Z, a-z, 0-9, -, ., _, ~
        const validVerifier = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~'.slice(0, 66);
        const response = await exchangeToken(code, validVerifier);

        // Should NOT be invalid_request (format is fine)
        expect(response.body.error).not.toEqual('invalid_request');
    });
});
