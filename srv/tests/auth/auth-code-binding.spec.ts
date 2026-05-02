import {SharedTestFixture} from "../shared-test.fixture";
import {expect2xx} from "../api-client/client";

/**
 * Integration tests for authorization code parameter binding at creation.
 *
 * Verifies that when an authorization code is created via POST /api/oauth/login,
 * the server stores client_id, redirect_uri, scope, and code_challenge in the
 * auth_code record. Since SharedTestFixture has no direct database access, we
 * verify stored values indirectly: a successful token exchange with matching
 * parameters proves they were stored, and a failed exchange with mismatched
 * parameters proves binding is enforced.
 *
 * Requirements: 1.1, 1.2, 1.3, 1.4
 */
describe('auth code parameter binding at creation', () => {
    let app: SharedTestFixture;
    const clientId = "auth.server.com";
    const email = "admin@auth.server.com";
    const password = "admin9000";

    beforeAll(async () => {
        app = new SharedTestFixture();
    });

    afterAll(async () => {
        await app.close();
    });

    /**
     * Helper: login with the given parameters and return the auth code.
     */
    async function loginAndGetCode(params: {
        codeChallenge: string;
        redirectUri?: string;
        scope?: string;
    }): Promise<string> {
        const payload: any = {
            email,
            password,
            client_id: clientId,
            code_challenge: params.codeChallenge,
            code_challenge_method: "plain",
        };
        if (params.redirectUri) {
            payload.redirect_uri = params.redirectUri;
        }
        if (params.scope) {
            payload.scope = params.scope;
        }
        const response = await app.getHttpServer()
            .post('/api/oauth/login')
            .send(payload)
            .set('Accept', 'application/json');
        expect(response.status).toEqual(201);
        expect(response.body.authentication_code).toBeDefined();
        return response.body.authentication_code;
    }

    // Requirement 1.1: client_id is stored and verified at token exchange
    it('should store client_id — exchange with matching client_id succeeds', async () => {
        const challenge = "binding-client-id-test-ABCDEFGHIJKLMNOPQRSTU";
        const code = await loginAndGetCode({codeChallenge: challenge});

        const response = await app.getHttpServer()
            .post('/api/oauth/token')
            .send({
                grant_type: "authorization_code",
                code,
                code_verifier: challenge,
                client_id: clientId,
            })
            .set('Accept', 'application/json');

        expect2xx(response);
        expect(response.body.access_token).toBeDefined();
    });

    // Requirement 1.1: client_id binding is enforced — mismatched client_id is rejected
    it('should reject token exchange when client_id does not match stored value', async () => {
        const challenge = "binding-client-mismatch-ABCDEFGHIJKLMNOPQRST";
        const code = await loginAndGetCode({codeChallenge: challenge});

        const response = await app.getHttpServer()
            .post('/api/oauth/token')
            .send({
                grant_type: "authorization_code",
                code,
                code_verifier: challenge,
                client_id: "wrong.client.com",
            })
            .set('Accept', 'application/json');

        expect(response.status).toEqual(400);
        expect(response.body.error).toEqual("invalid_grant");
    });

    // Requirement 1.2: redirect_uri is stored — exchange with matching redirect_uri succeeds
    it('should store redirect_uri — exchange with matching redirect_uri succeeds', async () => {
        const challenge = "binding-redirect-uri-test-ABCDEFGHIJKLMNOPQR";
        const redirectUri = "https://app.example.com/callback";
        const code = await loginAndGetCode({codeChallenge: challenge, redirectUri});

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
    });

    // Requirement 1.2: redirect_uri binding is enforced — mismatched redirect_uri is rejected
    it('should reject token exchange when redirect_uri does not match stored value', async () => {
        const challenge = "binding-redirect-mismatch-ABCDEFGHIJKLMNOPQR";
        const redirectUri = "https://app.example.com/callback";
        const code = await loginAndGetCode({codeChallenge: challenge, redirectUri});

        const response = await app.getHttpServer()
            .post('/api/oauth/token')
            .send({
                grant_type: "authorization_code",
                code,
                code_verifier: challenge,
                client_id: clientId,
                redirect_uri: "https://evil.example.com/steal",
            })
            .set('Accept', 'application/json');

        expect(response.status).toEqual(400);
        expect(response.body.error).toEqual("invalid_grant");
    });

    // Requirement 1.3: scope is stored — exchange succeeds when scope was provided at login
    it('should store scope — token exchange succeeds after login with scope', async () => {
        const challenge = "binding-scope-test-ABCDEFGHIJKLMNOPQRSTUVWX";
        const code = await loginAndGetCode({codeChallenge: challenge, scope: "openid profile"});

        const response = await app.getHttpServer()
            .post('/api/oauth/token')
            .send({
                grant_type: "authorization_code",
                code,
                code_verifier: challenge,
                client_id: clientId,
            })
            .set('Accept', 'application/json');

        expect2xx(response);
        expect(response.body.access_token).toBeDefined();
    });

    // Requirement 1.4: code_challenge is stored — PKCE verification succeeds with matching verifier
    it('should store code_challenge — PKCE verification succeeds with matching verifier', async () => {
        const challenge = "binding-pkce-verify-ABCDEFGHIJKLMNOPQRSTUVW";
        const code = await loginAndGetCode({codeChallenge: challenge});

        const response = await app.getHttpServer()
            .post('/api/oauth/token')
            .send({
                grant_type: "authorization_code",
                code,
                code_verifier: challenge, // matches code_challenge since method is "plain"
                client_id: clientId,
            })
            .set('Accept', 'application/json');

        expect2xx(response);
        expect(response.body.access_token).toBeDefined();
    });

    // Requirement 1.4: code_challenge binding is enforced — wrong verifier is rejected
    it('should reject token exchange when code_verifier does not match stored code_challenge', async () => {
        const challenge = "binding-pkce-mismatch-ABCDEFGHIJKLMNOPQRSTUV";
        const code = await loginAndGetCode({codeChallenge: challenge});

        const response = await app.getHttpServer()
            .post('/api/oauth/token')
            .send({
                grant_type: "authorization_code",
                code,
                code_verifier: "wrong-verifier-value-ABCDEFGHIJKLMNOPQRSTUVW",
                client_id: clientId,
            })
            .set('Accept', 'application/json');

        expect(response.status).toEqual(400);
        expect(response.body.error).toEqual("invalid_grant");
    });
});
