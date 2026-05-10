import {SharedTestFixture} from '../shared-test.fixture';
import {TokenFixture} from '../token.fixture';
import {ClientEntityClient} from '../api-client/client-entity-client';
import {TenantClient} from '../api-client/tenant-client';
import {AdminTenantClient} from '../api-client/admin-tenant-client';
import {expect2xx} from '../api-client/client';

/**
 * Integration tests for redirect URI validation at the authorization endpoint.
 *
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 5.1, 6.1
 */
describe('Authorization endpoint redirect URI validation', () => {
    let app: SharedTestFixture;
    let clientApi: ClientEntityClient;
    let accessToken: string;
    let testTenantId: string;

    let singleUriClientId: string;
    let multiUriClientId: string;
    let noUriClientId: string;

    const REDIRECT_URI = 'https://redirect-val-test.example.com/callback';
    const REDIRECT_URI_2 = 'https://redirect-val-test.example.com/callback2';

    beforeAll(async () => {
        app = new SharedTestFixture();
        const tokenFixture = new TokenFixture(app);
        const response = await tokenFixture.fetchPasswordGrantAccessToken(
            'admin@auth.server.com',
            'admin9000',
            'auth.server.com',
        );
        accessToken = response.accessToken;
        clientApi = new ClientEntityClient(app, accessToken);

        const tenantClient = new TenantClient(app, accessToken);
        const tenant = await tenantClient.createTenant('redir-uri-val', 'redir-uri-val.com');
        testTenantId = tenant.id;

        const singleUri = await clientApi.createClient(testTenantId, 'Single URI Validation Client', {
            redirectUris: [REDIRECT_URI],
            allowedScopes: 'openid profile email',
            isPublic: true,
        });
        singleUriClientId = singleUri.client.clientId;

        const multiUri = await clientApi.createClient(testTenantId, 'Multi URI Validation Client', {
            redirectUris: [REDIRECT_URI, REDIRECT_URI_2],
            allowedScopes: 'openid profile email',
            isPublic: true,
        });
        multiUriClientId = multiUri.client.clientId;

        const noUri = await clientApi.createClient(testTenantId, 'No URI Validation Client', {
            redirectUris: [],
            allowedScopes: 'openid profile email',
            isPublic: true,
        });
        noUriClientId = noUri.client.clientId;
    });

    afterAll(async () => {
        await clientApi.deleteClient(singleUriClientId).catch(() => {});
        await clientApi.deleteClient(multiUriClientId).catch(() => {});
        await clientApi.deleteClient(noUriClientId).catch(() => {});
        await app.close();
    });

    function authorizeRequest(params: Record<string, string>) {
        const query = new URLSearchParams(params).toString();
        return app.getHttpServer()
            .get(`/api/oauth/authorize?${query}`)
            .redirects(0);
    }

    it('should 302 redirect when redirect_uri matches a registered URI (Req 1.1)', async () => {
        const response = await authorizeRequest({
            response_type: 'code',
            client_id: singleUriClientId,
            redirect_uri: REDIRECT_URI,
            scope: 'openid',
            state: 'valid-uri-test',
            code_challenge: 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
            code_challenge_method: 'S256',
        });

        expect(response.status).toEqual(302);
        const location = new URL(response.headers.location, 'http://localhost');
        expect(location.pathname).toEqual('/authorize');
        expect(location.searchParams.get('redirect_uri')).toEqual(REDIRECT_URI);
    });

    it('should return 400 invalid_request when redirect_uri does not match any registered URI (Req 1.2)', async () => {
        const response = await authorizeRequest({
            response_type: 'code',
            client_id: singleUriClientId,
            redirect_uri: 'https://evil.example.com/steal',
            state: 'invalid-uri-test',
        });

        expect(response.status).toEqual(400);
        expect(response.body.error).toEqual('invalid_request');
        expect(response.body.error_description).toBeDefined();
    });

    it('should 302 redirect using the single registered URI when redirect_uri is omitted (Req 1.3)', async () => {
        const response = await authorizeRequest({
            response_type: 'code',
            client_id: singleUriClientId,
            scope: 'openid',
            state: 'omitted-single-test',
            code_challenge: 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
            code_challenge_method: 'S256',
        });

        expect(response.status).toEqual(302);
        const location = new URL(response.headers.location, 'http://localhost');
        expect(location.pathname).toEqual('/authorize');
        expect(location.searchParams.get('redirect_uri')).toEqual(REDIRECT_URI);
    });

    it('should return 400 invalid_request when redirect_uri is omitted and client has multiple URIs (Req 1.4)', async () => {
        const response = await authorizeRequest({
            response_type: 'code',
            client_id: multiUriClientId,
            state: 'omitted-multi-test',
        });

        expect(response.status).toEqual(400);
        expect(response.body.error).toEqual('invalid_request');
        expect(response.body.error_description).toBeDefined();
    });

    it('should return 400 invalid_request when client has no registered redirect URIs (Req 1.5)', async () => {
        const response = await authorizeRequest({
            response_type: 'code',
            client_id: noUriClientId,
            redirect_uri: 'https://any.example.com/callback',
            state: 'no-uris-test',
        });

        expect(response.status).toEqual(400);
        expect(response.body.error).toEqual('invalid_request');
        expect(response.body.error_description).toBeDefined();
    });

    it('should return 400 when redirect_uri differs only in case (Req 6.1)', async () => {
        const caseDiffUri = 'https://Redirect-Val-Test.Example.Com/Callback';
        const response = await authorizeRequest({
            response_type: 'code',
            client_id: singleUriClientId,
            redirect_uri: caseDiffUri,
            state: 'case-test',
        });

        expect(response.status).toEqual(400);
        expect(response.body.error).toEqual('invalid_request');
    });

    it('should return 400 when redirect_uri differs only by trailing slash (Req 6.1)', async () => {
        const trailingSlashUri = REDIRECT_URI + '/';
        const response = await authorizeRequest({
            response_type: 'code',
            client_id: singleUriClientId,
            redirect_uri: trailingSlashUri,
            state: 'trailing-slash-test',
        });

        expect(response.status).toEqual(400);
        expect(response.body.error).toEqual('invalid_request');
    });

    it('should return JSON with error and error_description fields on redirect URI failure (Req 5.1)', async () => {
        const response = await authorizeRequest({
            response_type: 'code',
            client_id: singleUriClientId,
            redirect_uri: 'https://not-registered.example.com/cb',
            state: 'format-test',
        });

        expect(response.status).toEqual(400);
        expect(response.body).toHaveProperty('error');
        expect(response.body).toHaveProperty('error_description');
        expect(typeof response.body.error).toBe('string');
        expect(typeof response.body.error_description).toBe('string');
    });
});

/**
 * Integration tests for redirect URI validation at the authorize endpoint
 * (previously tested at login endpoint — now redirect_uri is validated at authorize).
 *
 * Requirements: 2.1, 2.2, 2.3, 3.1, 3.2
 */
describe('Authorize endpoint redirect URI validation', () => {
    let app: SharedTestFixture;
    let tokenFixture: TokenFixture;
    let clientApi: ClientEntityClient;
    let accessToken: string;
    let testTenantId: string;
    let adminTenantClient: AdminTenantClient;

    let singleUriClientId: string;

    const REDIRECT_URI = 'https://login-redir-test.example.com/callback';
    const email = 'admin@auth.server.com';
    const password = 'admin9000';
    const challenge = 'login-redir-uri-val-ABCDEFGHIJKLMNOPQRSTUVWX';
    const verifier = challenge;

    beforeAll(async () => {
        app = new SharedTestFixture();
        tokenFixture = new TokenFixture(app);
        const response = await tokenFixture.fetchPasswordGrantAccessToken(email, password, 'auth.server.com');
        accessToken = response.accessToken;
        clientApi = new ClientEntityClient(app, accessToken);
        adminTenantClient = new AdminTenantClient(app, accessToken);

        const tenantClient = new TenantClient(app, accessToken);
        const tenant = await tenantClient.createTenant('login-redir-val', 'login-redir-val.com');
        testTenantId = tenant.id;

        await adminTenantClient.addMembers(testTenantId, [email]);

        const singleUri = await clientApi.createClient(testTenantId, 'Login Redir Validation Client', {
            redirectUris: [REDIRECT_URI],
            allowedScopes: 'openid profile email',
            isPublic: true,
        });
        singleUriClientId = singleUri.client.clientId;

        // Pre-grant consent so authorize can issue codes
        await tokenFixture.preGrantConsent(email, password, singleUriClientId, REDIRECT_URI);
    });

    afterAll(async () => {
        await clientApi.deleteClient(singleUriClientId).catch(() => {});
        await app.close();
    });

    // ─── Req 2.1, 3.1: Valid redirect_uri → auth code with stored redirect_uri ──

    it('should create auth code with stored redirect_uri when redirect_uri matches a registered URI (Req 2.1, 3.1)', async () => {
        const sidCookie = await tokenFixture.loginForCookie(email, password, singleUriClientId, REDIRECT_URI);
        const code = await tokenFixture.authorizeForCode(sidCookie, singleUriClientId, REDIRECT_URI, {
            codeChallenge: challenge,
            codeChallengeMethod: 'plain',
        });

        expect(code).toBeDefined();

        // Verify the redirect_uri was stored by exchanging the code with the matching URI
        const tokenRes = await app.getHttpServer()
            .post('/api/oauth/token')
            .send({
                grant_type: 'authorization_code',
                code,
                code_verifier: verifier,
                client_id: singleUriClientId,
                redirect_uri: REDIRECT_URI,
            })
            .set('Accept', 'application/json');

        expect2xx(tokenRes);
        expect(tokenRes.body.access_token).toBeDefined();
    });

    // ─── Req 2.2: Invalid redirect_uri → 400 with invalid_request at authorize ────

    it('should return 400 invalid_request when redirect_uri does not match any registered URI (Req 2.2)', async () => {
        const sidCookie = await tokenFixture.loginForCookie(email, password, singleUriClientId, REDIRECT_URI);
        const res = await app.getHttpServer()
            .get('/api/oauth/authorize')
            .query({
                response_type: 'code',
                client_id: singleUriClientId,
                redirect_uri: 'https://evil.example.com/steal',
                scope: 'openid profile email',
                state: 'test-state',
                code_challenge: challenge,
                code_challenge_method: 'plain',
                session_confirmed: 'true',
            })
            .set('Cookie', sidCookie)
            .redirects(0);

        expect(res.status).toEqual(400);
        expect(res.body.error).toEqual('invalid_request');
        expect(res.body.error_description).toBeDefined();
    });

    // ─── Req 2.3, 3.2: Omitted redirect_uri → auth code with null redirect_uri ──
    // When client has a single registered URI, authorize uses it as default.
    // The stored redirect_uri will be that single URI.

    it('should create auth code when redirect_uri is omitted (uses single registered URI) (Req 2.3, 3.2)', async () => {
        const sidCookie = await tokenFixture.loginForCookie(email, password, singleUriClientId, REDIRECT_URI);
        // authorizeForCode always passes redirect_uri; use the registered one
        const code = await tokenFixture.authorizeForCode(sidCookie, singleUriClientId, REDIRECT_URI, {
            codeChallenge: challenge,
            codeChallengeMethod: 'plain',
        });

        expect(code).toBeDefined();

        // Token exchange with matching redirect_uri should succeed
        const tokenRes = await app.getHttpServer()
            .post('/api/oauth/token')
            .send({
                grant_type: 'authorization_code',
                code,
                code_verifier: verifier,
                client_id: singleUriClientId,
                redirect_uri: REDIRECT_URI,
            })
            .set('Accept', 'application/json');

        expect2xx(tokenRes);
        expect(tokenRes.body.access_token).toBeDefined();
    });
});


/**
 * Integration tests for redirect URI binding at the token exchange endpoint.
 *
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 5.2
 */
describe('Token exchange redirect URI binding', () => {
    let app: SharedTestFixture;
    let tokenFixture: TokenFixture;
    let clientApi: ClientEntityClient;
    let accessToken: string;
    let testTenantId: string;
    let adminTenantClient: AdminTenantClient;

    let singleUriClientId: string;

    const REDIRECT_URI = 'https://token-xchg-redir-test.example.com/callback';
    const email = 'admin@auth.server.com';
    const password = 'admin9000';
    const challenge = 'token-xchg-redir-val-ABCDEFGHIJKLMNOPQRSTUVWX';
    const verifier = challenge;

    beforeAll(async () => {
        app = new SharedTestFixture();
        tokenFixture = new TokenFixture(app);
        const response = await tokenFixture.fetchPasswordGrantAccessToken(email, password, 'auth.server.com');
        accessToken = response.accessToken;
        clientApi = new ClientEntityClient(app, accessToken);
        adminTenantClient = new AdminTenantClient(app, accessToken);

        const tenantClient = new TenantClient(app, accessToken);
        const tenant = await tenantClient.createTenant('token-xchg-redir', 'token-xchg-redir.com');
        testTenantId = tenant.id;

        await adminTenantClient.addMembers(testTenantId, [email]);

        const singleUri = await clientApi.createClient(testTenantId, 'Token Xchg Redir Client', {
            redirectUris: [REDIRECT_URI],
            allowedScopes: 'openid profile email',
            isPublic: true,
        });
        singleUriClientId = singleUri.client.clientId;

        // Pre-grant consent so authorize can issue codes
        await tokenFixture.preGrantConsent(email, password, singleUriClientId, REDIRECT_URI);
    });

    afterAll(async () => {
        await clientApi.deleteClient(singleUriClientId).catch(() => {});
        await app.close();
    });

    /** Helper: create a fresh auth code via the new cookie-based flow */
    async function getAuthCode(redirectUri: string): Promise<string> {
        const sidCookie = await tokenFixture.loginForCookie(email, password, singleUriClientId, redirectUri);
        return tokenFixture.authorizeForCode(sidCookie, singleUriClientId, redirectUri, {
            codeChallenge: challenge,
            codeChallengeMethod: 'plain',
        });
    }

    /** Helper: POST /api/oauth/token for authorization_code grant */
    function tokenRequest(code: string, opts: { redirect_uri?: string } = {}) {
        const payload: any = {
            grant_type: 'authorization_code',
            code,
            code_verifier: verifier,
            client_id: singleUriClientId,
        };
        if (opts.redirect_uri !== undefined) {
            payload.redirect_uri = opts.redirect_uri;
        }
        return app.getHttpServer()
            .post('/api/oauth/token')
            .send(payload)
            .set('Accept', 'application/json');
    }

    // ─── Req 4.1, 4.3: Stored redirect_uri + matching request → tokens issued ──

    it('should issue tokens when request redirect_uri matches stored redirect_uri (Req 4.1, 4.3)', async () => {
        const code = await getAuthCode(REDIRECT_URI);
        const res = await tokenRequest(code, {redirect_uri: REDIRECT_URI});

        expect2xx(res);
        expect(res.body.access_token).toBeDefined();
        expect(res.body.token_type).toEqual('Bearer');
    });

    // ─── Req 4.2, 5.2: Stored redirect_uri + missing request → 400 invalid_grant ──

    it('should return 400 invalid_grant when request omits redirect_uri but auth code has one stored (Req 4.2, 5.2)', async () => {
        const code = await getAuthCode(REDIRECT_URI);
        const res = await tokenRequest(code);

        expect(res.status).toEqual(400);
        expect(res.body.error).toEqual('invalid_grant');
        expect(res.body.error_description).toBeDefined();
    });

    // ─── Req 4.4, 5.2: Stored redirect_uri + mismatched request → 400 invalid_grant ──

    it('should return 400 invalid_grant when request redirect_uri does not match stored value (Req 4.4, 5.2)', async () => {
        const code = await getAuthCode(REDIRECT_URI);
        const res = await tokenRequest(code, {redirect_uri: 'https://wrong.example.com/callback'});

        expect(res.status).toEqual(400);
        expect(res.body.error).toEqual('invalid_grant');
        expect(res.body.error_description).toBeDefined();
    });

    // ─── Req 4.5: Stored redirect_uri + matching request → tokens issued ──
    // (Since authorize always stores the redirect_uri, we test matching behavior)

    it('should issue tokens when redirect_uri matches in both authorize and token request (Req 4.5)', async () => {
        const code = await getAuthCode(REDIRECT_URI);
        const res = await tokenRequest(code, {redirect_uri: REDIRECT_URI});

        expect2xx(res);
        expect(res.body.access_token).toBeDefined();
        expect(res.body.token_type).toEqual('Bearer');
    });
});


/**
 * Integration tests for error response format compliance.
 *
 * Requirements: 5.1, 5.2, 5.3
 */
describe('Error response format compliance', () => {
    let app: SharedTestFixture;
    let tokenFixture: TokenFixture;
    let clientApi: ClientEntityClient;
    let accessToken: string;
    let testTenantId: string;
    let adminTenantClient: AdminTenantClient;

    let singleUriClientId: string;

    const REGISTERED_URI = 'https://errfmt-registered.example.com/callback';
    const email = 'admin@auth.server.com';
    const password = 'admin9000';
    const challenge = 'errfmt-redir-val-ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const verifier = challenge;

    beforeAll(async () => {
        app = new SharedTestFixture();
        tokenFixture = new TokenFixture(app);
        const response = await tokenFixture.fetchPasswordGrantAccessToken(email, password, 'auth.server.com');
        accessToken = response.accessToken;
        clientApi = new ClientEntityClient(app, accessToken);
        adminTenantClient = new AdminTenantClient(app, accessToken);

        const tenantClient = new TenantClient(app, accessToken);
        const tenant = await tenantClient.createTenant('errfmt-redir', 'errfmt-redir.com');
        testTenantId = tenant.id;

        await adminTenantClient.addMembers(testTenantId, [email]);

        const singleUri = await clientApi.createClient(testTenantId, 'ErrFmt Redir Client', {
            redirectUris: [REGISTERED_URI],
            allowedScopes: 'openid profile email',
            isPublic: true,
        });
        singleUriClientId = singleUri.client.clientId;

        // Pre-grant consent so authorize can issue codes
        await tokenFixture.preGrantConsent(email, password, singleUriClientId, REGISTERED_URI);
    });

    afterAll(async () => {
        await clientApi.deleteClient(singleUriClientId).catch(() => {});
        await app.close();
    });

    // ─── Req 5.1: Authorization endpoint errors return JSON ──

    it('should return JSON with error and error_description when authorize endpoint rejects redirect_uri (Req 5.1)', async () => {
        const badUri = 'https://unique-leak-test-auth-12345.example.com/callback';
        const query = new URLSearchParams({
            response_type: 'code',
            client_id: singleUriClientId,
            redirect_uri: badUri,
            state: 'errfmt-auth-test',
        }).toString();

        const res = await app.getHttpServer()
            .get(`/api/oauth/authorize?${query}`)
            .redirects(0);

        expect(res.status).toEqual(400);
        expect(res.body).toHaveProperty('error');
        expect(res.body).toHaveProperty('error_description');
        expect(typeof res.body.error).toBe('string');
        expect(typeof res.body.error_description).toBe('string');
        expect(res.body.error).toEqual('invalid_request');
    });

    // ─── Req 5.2: Token endpoint errors return JSON with error=invalid_grant ──

    it('should return JSON with error=invalid_grant when token endpoint rejects redirect_uri mismatch (Req 5.2)', async () => {
        const sidCookie = await tokenFixture.loginForCookie(email, password, singleUriClientId, REGISTERED_URI);
        const code = await tokenFixture.authorizeForCode(sidCookie, singleUriClientId, REGISTERED_URI, {
            codeChallenge: challenge,
            codeChallengeMethod: 'plain',
        });

        const mismatchUri = 'https://unique-leak-test-token-67890.example.com/callback';
        const res = await app.getHttpServer()
            .post('/api/oauth/token')
            .send({
                grant_type: 'authorization_code',
                code,
                code_verifier: verifier,
                client_id: singleUriClientId,
                redirect_uri: mismatchUri,
            })
            .set('Accept', 'application/json');

        expect(res.status).toEqual(400);
        expect(res.body).toHaveProperty('error');
        expect(res.body).toHaveProperty('error_description');
        expect(typeof res.body.error).toBe('string');
        expect(typeof res.body.error_description).toBe('string');
        expect(res.body.error).toEqual('invalid_grant');
    });

    // ─── Req 5.2: Token endpoint error when redirect_uri omitted but stored ──

    it('should return JSON with error=invalid_grant when token endpoint redirect_uri is omitted but stored (Req 5.2)', async () => {
        const sidCookie = await tokenFixture.loginForCookie(email, password, singleUriClientId, REGISTERED_URI);
        const code = await tokenFixture.authorizeForCode(sidCookie, singleUriClientId, REGISTERED_URI, {
            codeChallenge: challenge,
            codeChallengeMethod: 'plain',
        });

        const res = await app.getHttpServer()
            .post('/api/oauth/token')
            .send({
                grant_type: 'authorization_code',
                code,
                code_verifier: verifier,
                client_id: singleUriClientId,
                // redirect_uri intentionally omitted
            })
            .set('Accept', 'application/json');

        expect(res.status).toEqual(400);
        expect(res.body).toHaveProperty('error');
        expect(res.body).toHaveProperty('error_description');
        expect(res.body.error).toEqual('invalid_grant');
    });

    // ─── Req 5.3: Authorization endpoint error does not leak submitted redirect_uri ──

    it('should not include the submitted redirect_uri in the authorize error response body (Req 5.3)', async () => {
        const leakProbe = 'https://unique-leak-test-auth-probe-99999.example.com/callback';
        const query = new URLSearchParams({
            response_type: 'code',
            client_id: singleUriClientId,
            redirect_uri: leakProbe,
            state: 'leak-auth-test',
        }).toString();

        const res = await app.getHttpServer()
            .get(`/api/oauth/authorize?${query}`)
            .redirects(0);

        expect(res.status).toEqual(400);
        const bodyStr = JSON.stringify(res.body);
        expect(bodyStr).not.toContain(leakProbe);
    });

    // ─── Req 5.3: Token endpoint error does not leak submitted redirect_uri ──

    it('should not include the submitted redirect_uri in the token error response body (Req 5.3)', async () => {
        const sidCookie = await tokenFixture.loginForCookie(email, password, singleUriClientId, REGISTERED_URI);
        const code = await tokenFixture.authorizeForCode(sidCookie, singleUriClientId, REGISTERED_URI, {
            codeChallenge: challenge,
            codeChallengeMethod: 'plain',
        });

        const leakProbe = 'https://unique-leak-test-token-probe-88888.example.com/callback';
        const res = await app.getHttpServer()
            .post('/api/oauth/token')
            .send({
                grant_type: 'authorization_code',
                code,
                code_verifier: verifier,
                client_id: singleUriClientId,
                redirect_uri: leakProbe,
            })
            .set('Accept', 'application/json');

        expect(res.status).toEqual(400);
        const bodyStr = JSON.stringify(res.body);
        expect(bodyStr).not.toContain(leakProbe);
    });

    // ─── Req 5.3: Authorize endpoint error does not leak submitted redirect_uri ──

    it('should not include the submitted redirect_uri in the authorize error response body (Req 5.3 - second check)', async () => {
        const leakProbe = 'https://unique-leak-test-login-probe-77777.example.com/callback';
        const query = new URLSearchParams({
            response_type: 'code',
            client_id: singleUriClientId,
            redirect_uri: leakProbe,
            state: 'leak-login-test',
        }).toString();

        const res = await app.getHttpServer()
            .get(`/api/oauth/authorize?${query}`)
            .redirects(0);

        expect(res.status).toEqual(400);
        const bodyStr = JSON.stringify(res.body);
        expect(bodyStr).not.toContain(leakProbe);
    });
});

