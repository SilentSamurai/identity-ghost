import {SharedTestFixture} from '../shared-test.fixture';
import {CryptUtil} from '../../src/util/crypt.util';

/**
 * Integration test: S256 end-to-end verification
 *
 * Validates the full PKCE round-trip through the login and token endpoints:
 * - Login with S256 challenge, exchange with correct verifier → success
 * - Login with S256 challenge, exchange with wrong verifier → invalid_grant
 * - Login with plain challenge, exchange with matching verifier → success
 *
 * Validates: Requirements 2.1, 2.2, 2.3
 */
describe('S256 end-to-end verification', () => {
    let app: SharedTestFixture;

    const clientId = 'auth.server.com';
    const email = 'admin@auth.server.com';
    const password = 'admin9000';

    // Valid PKCE verifier (43-128 chars, unreserved charset)
    const verifier = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopq';
    const wrongVerifier = 'ZYXWVUTSRQPONMLKJIHGFEDCBAzyxwvutsrqponmlkj';

    // Compute S256 challenge from the verifier
    const s256Challenge = CryptUtil.generateCodeChallenge(verifier, 'S256');

    beforeAll(async () => {
        app = new SharedTestFixture();
    });

    afterAll(async () => {
        await app.close();
    });

    /** Helper: login and obtain an auth code with a given challenge and method */
    async function loginWithChallenge(challenge: string, method: string): Promise<string> {
        const response = await app.getHttpServer()
            .post('/api/oauth/login')
            .send({
                email,
                password,
                client_id: clientId,
                code_challenge: challenge,
                code_challenge_method: method,
            })
            .set('Accept', 'application/json');

        expect(response.status).toEqual(201);
        expect(response.body.authentication_code).toBeDefined();
        return response.body.authentication_code;
    }

    /** Helper: exchange an auth code for tokens */
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

    it('succeeds when S256 challenge is verified with the correct verifier', async () => {
        const code = await loginWithChallenge(s256Challenge, 'S256');
        const response = await exchangeToken(code, verifier);

        expect(response.status).toEqual(201);
        expect(response.body.access_token).toBeDefined();
        expect(response.body.token_type).toEqual('Bearer');
    });

    it('fails with invalid_grant when S256 challenge is verified with a wrong verifier', async () => {
        const code = await loginWithChallenge(s256Challenge, 'S256');
        const response = await exchangeToken(code, wrongVerifier);

        expect(response.status).toEqual(400);
        expect(response.body.error).toEqual('invalid_grant');
    });

    it('succeeds when plain challenge is verified with the matching verifier', async () => {
        const code = await loginWithChallenge(verifier, 'plain');
        const response = await exchangeToken(code, verifier);

        expect(response.status).toEqual(201);
        expect(response.body.access_token).toBeDefined();
        expect(response.body.token_type).toEqual('Bearer');
    });
});
