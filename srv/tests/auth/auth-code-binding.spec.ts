import {SharedTestFixture} from "../shared-test.fixture";
import {TokenFixture} from "../token.fixture";
import {expect2xx} from "../api-client/client";

/**
 * Integration tests for authorization code parameter binding at creation.
 *
 * Verifies that when an authorization code is created via the cookie-based
 * login → authorize flow, the server stores client_id, redirect_uri, scope,
 * and code_challenge in the auth_code record. Since SharedTestFixture has no
 * direct database access, we verify stored values indirectly: a successful
 * token exchange with matching parameters proves they were stored, and a
 * failed exchange with mismatched parameters proves binding is enforced.
 *
 * Requirements: 1.1, 1.2, 1.3, 1.4
 */
describe('auth code parameter binding at creation', () => {
    let app: SharedTestFixture;
    let tokenFixture: TokenFixture;

    const CLIENT_ID = 'auth.server.com';
    const EMAIL = 'admin@auth.server.com';
    const PASSWORD = 'admin9000';
    const REDIRECT_URI = 'http://localhost:3000/callback';

    beforeAll(async () => {
        app = new SharedTestFixture();
        tokenFixture = new TokenFixture(app);
    });

    afterAll(async () => {
        await app.close();
    });

    // Requirement 1.1: client_id is stored and verified at token exchange
    it('should store client_id — exchange with matching client_id succeeds', async () => {
        const challenge = 'binding-client-id-test-ABCDEFGHIJKLMNOPQRSTU';
        const code = await tokenFixture.fetchAuthCodeWithConsentFlow(EMAIL, PASSWORD, {
            clientId: CLIENT_ID,
            redirectUri: REDIRECT_URI,
            scope: 'openid profile email',
            state: 'test-state',
            codeChallenge: challenge,
            codeChallengeMethod: 'plain',
        });

        const response = await app.getHttpServer()
            .post('/api/oauth/token')
            .send({
                grant_type: 'authorization_code',
                code,
                code_verifier: challenge,
                client_id: CLIENT_ID,
                redirect_uri: REDIRECT_URI,
            })
            .set('Accept', 'application/json');

        expect2xx(response);
        expect(response.body.access_token).toBeDefined();
    });

    // Requirement 1.1: client_id binding is enforced — mismatched client_id is rejected
    it('should reject token exchange when client_id does not match stored value', async () => {
        const challenge = 'binding-client-mismatch-ABCDEFGHIJKLMNOPQRST';
        const code = await tokenFixture.fetchAuthCodeWithConsentFlow(EMAIL, PASSWORD, {
            clientId: CLIENT_ID,
            redirectUri: REDIRECT_URI,
            scope: 'openid profile email',
            state: 'test-state',
            codeChallenge: challenge,
            codeChallengeMethod: 'plain',
        });

        const response = await app.getHttpServer()
            .post('/api/oauth/token')
            .send({
                grant_type: 'authorization_code',
                code,
                code_verifier: challenge,
                client_id: 'wrong.client.com',
            })
            .set('Accept', 'application/json');

        expect(response.status).toEqual(400);
        expect(response.body.error).toEqual('invalid_grant');
    });

    // Requirement 1.2: redirect_uri is stored — exchange with matching redirect_uri succeeds
    it('should store redirect_uri — exchange with matching redirect_uri succeeds', async () => {
        const challenge = 'binding-redirect-uri-test-ABCDEFGHIJKLMNOPQR';
        const code = await tokenFixture.fetchAuthCodeWithConsentFlow(EMAIL, PASSWORD, {
            clientId: CLIENT_ID,
            redirectUri: REDIRECT_URI,
            scope: 'openid profile email',
            state: 'test-state',
            codeChallenge: challenge,
            codeChallengeMethod: 'plain',
        });

        const response = await app.getHttpServer()
            .post('/api/oauth/token')
            .send({
                grant_type: 'authorization_code',
                code,
                code_verifier: challenge,
                client_id: CLIENT_ID,
                redirect_uri: REDIRECT_URI,
            })
            .set('Accept', 'application/json');

        expect2xx(response);
        expect(response.body.access_token).toBeDefined();
    });

    // Requirement 1.2: redirect_uri binding is enforced — mismatched redirect_uri is rejected
    it('should reject token exchange when redirect_uri does not match stored value', async () => {
        const challenge = 'binding-redirect-mismatch-ABCDEFGHIJKLMNOPQR';
        const code = await tokenFixture.fetchAuthCodeWithConsentFlow(EMAIL, PASSWORD, {
            clientId: CLIENT_ID,
            redirectUri: REDIRECT_URI,
            scope: 'openid profile email',
            state: 'test-state',
            codeChallenge: challenge,
            codeChallengeMethod: 'plain',
        });

        const response = await app.getHttpServer()
            .post('/api/oauth/token')
            .send({
                grant_type: 'authorization_code',
                code,
                code_verifier: challenge,
                client_id: CLIENT_ID,
                redirect_uri: 'https://evil.example.com/steal',
            })
            .set('Accept', 'application/json');

        expect(response.status).toEqual(400);
        expect(response.body.error).toEqual('invalid_grant');
    });

    // Requirement 1.3: scope is stored — exchange succeeds when scope was provided at authorize
    it('should store scope — token exchange succeeds after authorize with scope', async () => {
        const challenge = 'binding-scope-test-ABCDEFGHIJKLMNOPQRSTUVWX';
        const code = await tokenFixture.fetchAuthCodeWithConsentFlow(EMAIL, PASSWORD, {
            clientId: CLIENT_ID,
            redirectUri: REDIRECT_URI,
            scope: 'openid profile',
            state: 'test-state',
            codeChallenge: challenge,
            codeChallengeMethod: 'plain',
        });

        const response = await app.getHttpServer()
            .post('/api/oauth/token')
            .send({
                grant_type: 'authorization_code',
                code,
                code_verifier: challenge,
                client_id: CLIENT_ID,
                redirect_uri: REDIRECT_URI,
            })
            .set('Accept', 'application/json');

        expect2xx(response);
        expect(response.body.access_token).toBeDefined();
    });

    // Requirement 1.4: code_challenge is stored — PKCE verification succeeds with matching verifier
    it('should store code_challenge — PKCE verification succeeds with matching verifier', async () => {
        const challenge = 'binding-pkce-verify-ABCDEFGHIJKLMNOPQRSTUVW';
        const code = await tokenFixture.fetchAuthCodeWithConsentFlow(EMAIL, PASSWORD, {
            clientId: CLIENT_ID,
            redirectUri: REDIRECT_URI,
            scope: 'openid profile email',
            state: 'test-state',
            codeChallenge: challenge,
            codeChallengeMethod: 'plain',
        });

        const response = await app.getHttpServer()
            .post('/api/oauth/token')
            .send({
                grant_type: 'authorization_code',
                code,
                code_verifier: challenge, // matches code_challenge since method is "plain"
                client_id: CLIENT_ID,
                redirect_uri: REDIRECT_URI,
            })
            .set('Accept', 'application/json');

        expect2xx(response);
        expect(response.body.access_token).toBeDefined();
    });

    // Requirement 1.4: code_challenge binding is enforced — wrong verifier is rejected
    it('should reject token exchange when code_verifier does not match stored code_challenge', async () => {
        const challenge = 'binding-pkce-mismatch-ABCDEFGHIJKLMNOPQRSTUV';
        const code = await tokenFixture.fetchAuthCodeWithConsentFlow(EMAIL, PASSWORD, {
            clientId: CLIENT_ID,
            redirectUri: REDIRECT_URI,
            scope: 'openid profile email',
            state: 'test-state',
            codeChallenge: challenge,
            codeChallengeMethod: 'plain',
        });

        const response = await app.getHttpServer()
            .post('/api/oauth/token')
            .send({
                grant_type: 'authorization_code',
                code,
                code_verifier: 'wrong-verifier-value-ABCDEFGHIJKLMNOPQRSTUVW',
                client_id: CLIENT_ID,
                redirect_uri: REDIRECT_URI,
            })
            .set('Accept', 'application/json');

        expect(response.status).toEqual(400);
        expect(response.body.error).toEqual('invalid_grant');
    });
});
