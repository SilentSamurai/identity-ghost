import {expect2xx, TestFixture} from "./api-client/client";
import {ClientEntityClient} from "./api-client/client-entity-client";
import * as crypto from "crypto";

export class TokenFixture {

    private readonly app: TestFixture;

    constructor(app: TestFixture) {
        this.app = app;
    }

    /**
     * Create a confidential (non-public) client for a tenant with client_credentials grant.
     * Returns the clientId and plaintext clientSecret needed for fetchClientCredentialsToken.
     *
     * The default tenant client is public and has no secret, so tests that need
     * client_credentials tokens must create a confidential client first.
     */
    public async createConfidentialClient(
        accessToken: string,
        tenantId: string,
        name: string = 'test-confidential-client',
    ): Promise<{ clientId: string; clientSecret: string }> {
        const clientEntityClient = new ClientEntityClient(this.app, accessToken);
        const result = await clientEntityClient.createClient(tenantId, name, {
            grantTypes: 'client_credentials',
            allowedScopes: 'openid profile email',
            isPublic: false,
        });
        return {
            clientId: result.client.clientId,
            clientSecret: result.clientSecret,
        };
    }

    public async fetchAccessToken(username: string, password: string, client_id: string): Promise<{
        accessToken: string,
        refreshToken: string,
        jwt: any
    }> {
        const response = await this.app.getHttpServer()
            .post('/api/oauth/token')
            .send({
                "grant_type": "password",
                "username": username,
                "password": password,
                "client_id": client_id
            })
            .set('Accept', 'application/json');

        console.log("fetchAccessToken Response: ", response.body);

        expect2xx(response);

        expect(response.status).toEqual(200);
        expect(response.body.access_token).toBeDefined();
        expect(response.body.expires_in).toBeDefined();
        expect(response.body.token_type).toEqual('Bearer');
        expect(response.body.refresh_token).toBeDefined();

        let decode = this.app.jwtService().decode(response.body.access_token, {json: true}) as any;
        expect(decode.sub).toBeDefined();
        expect(decode.grant_type).toBeDefined();
        expect(decode.tenant.id).toBeDefined();
        expect(decode.tenant.name).toBeDefined();
        expect(decode.tenant.domain).toBeDefined();

        return {
            accessToken: response.body.access_token,
            refreshToken: response.body.refresh_token,
            jwt: decode
        }
    }


    public async getUser(email: string, password: string) {
        const token = await this.fetchAccessToken(
            email,
            password,
            "auth.server.com"
        );
        const response = await this.app.getHttpServer()
            .get("/api/users/me")
            .set('Authorization', `Bearer ${token.accessToken}`)
            .set('Accept', 'application/json');

        expect(response.status).toEqual(200);
        console.log(response.body);
        return response.body;
    }

    /**
     * Fetch an access token using the client credentials grant.
     * Takes clientId and clientSecret, and returns an object containing
     * the access token, refresh token, and decoded JWT.
     */
    public async fetchClientCredentialsToken(clientId: string, clientSecret: string): Promise<{
        accessToken: string,
        refreshToken?: string,
        jwt: any
    }> {
        const response = await this.app.getHttpServer()
            .post('/api/oauth/token')
            .send({
                grant_type: "client_credentials",
                client_id: clientId,
                client_secret: clientSecret
            })
            .set('Accept', 'application/json');

        console.log("fetchClientCredentialsToken Response: ", response.body);

        expect2xx(response);
        // Depending on your OAuth2 implementation, a 200 or 201 response code is typical
        expect(response.status).toBeGreaterThanOrEqual(200);
        expect(response.status).toBeLessThan(300);
        expect(response.body.access_token).toBeDefined();
        expect(response.body.token_type).toEqual('Bearer');

        // The refresh token may or may not be present in client_credentials flows
        const decode = this.app.jwtService().decode(response.body.access_token, {json: true}) as any;

        // Additional checks on decoded token fields can be added here if needed

        return {
            accessToken: response.body.access_token,
            refreshToken: response.body.refresh_token,
            jwt: decode
        };
    }

    /**
     * Login using OAuth authorization code flow.
     * Returns the response which may contain an authentication_code or requires_tenant_selection.
     *
     * Automatically obtains a flow_id cookie and csrf_token from GET /authorize
     * before posting to /login (required since CSRF enforcement was added).
     */
    public async login(
        email: string,
        password: string,
        clientId: string,
        codeChallenge: string = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopq',
        subscriberTenantHint?: string,
        opts?: { scope?: string; nonce?: string; codeChallengeMethod?: string }
    ): Promise<any> {
        // Get flow_id cookie and csrf_token from /authorize first
        const preAuth = await this.app.getHttpServer()
            .get('/api/oauth/authorize')
            .query({
                response_type: 'code',
                client_id: clientId,
                redirect_uri: 'https://login-fixture.local/callback',
                scope: opts?.scope ?? 'openid profile email',
                state: 'fixture-login-state',
                code_challenge: codeChallenge,
                code_challenge_method: opts?.codeChallengeMethod ?? 'plain',
            })
            .redirects(0);

        const preAuthCookies: string[] = Array.isArray(preAuth.headers['set-cookie'])
            ? preAuth.headers['set-cookie']
            : preAuth.headers['set-cookie'] ? [preAuth.headers['set-cookie']] : [];
        const flowIdHeader = preAuthCookies.find((c: string) => c.startsWith('flow_id='));
        const flowIdCookieValue = flowIdHeader ? flowIdHeader.split(';')[0] : '';

        const preAuthLocation: string = preAuth.headers['location'] ?? '';
        const csrfToken = preAuthLocation.includes('csrf_token=')
            ? new URL(preAuthLocation, 'http://localhost').searchParams.get('csrf_token') ?? ''
            : '';

        const body: any = {
            email,
            password,
            client_id: clientId,
            code_challenge_method: opts?.codeChallengeMethod || 'plain',
            code_challenge: codeChallenge,
            csrf_token: csrfToken,
        };
        if (subscriberTenantHint) {
            body.subscriber_tenant_hint = subscriberTenantHint;
        }
        if (opts?.scope) body.scope = opts.scope;
        if (opts?.nonce) body.nonce = opts.nonce;

        const req = this.app.getHttpServer()
            .post('/api/oauth/login')
            .send(body)
            .set('Accept', 'application/json');

        if (flowIdCookieValue) {
            req.set('Cookie', flowIdCookieValue);
        }

        const response = await req;
        expect2xx(response);
        return response.body;
    }

    public async exchangeCodeForToken(
        code: string,
        clientId: string,
        codeVerifier: string = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopq'
    ): Promise<{
        access_token?: string,
        refresh_token?: string,
        token_type?: string,
        error?: string,
        tenants?: Array<{ id: string, name: string, client_id: string, domain: string }>
    }> {
        const response = await this.app.getHttpServer()
            .post('/api/oauth/token')
            .send({
                grant_type: 'authorization_code',
                code,
                code_verifier: codeVerifier,
                client_id: clientId,
            })
            .set('Accept', 'application/json');

        expect2xx(response);

        // If there's an error response (like ambiguous tenants), return it directly
        if (response.body.error) {
            return response.body;
        }

        // Otherwise, return the token response
        expect(response.body.access_token).toBeDefined();
        expect(response.body.token_type).toEqual('Bearer');
        return response.body;
    }

    /**
     * Exchange an authentication code for an access token.
     * Supports resolving subscription tenant ambiguity by providing subscription_tenant_id.
     */
    public async exchangeCodeWithHint(
        code: string,
        clientId: string,
        subscriptionTenantId?: string,
        codeVerifier: string = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopq'
    ): Promise<{
        access_token?: string,
        refresh_token?: string,
        token_type?: string,
        error?: string,
        tenants?: Array<{ id: string, name: string, client_id: string, domain: string }>
    }> {
        const response = await this.app.getHttpServer()
            .post('/api/oauth/token')
            .send({
                grant_type: 'authorization_code',
                code,
                code_verifier: codeVerifier,
                client_id: clientId,
                ...(subscriptionTenantId && {subscriber_tenant_hint: subscriptionTenantId})
            })
            .set('Accept', 'application/json');

        expect2xx(response);

        // If there's an error response (like ambiguous tenants), return it directly
        if (response.body.error) {
            return response.body;
        }

        // Otherwise, return the token response
        expect(response.body.access_token).toBeDefined();
        expect(response.body.token_type).toEqual('Bearer');
        return response.body;
    }

    /**
     * Get a flow_id cookie and csrf_token by hitting GET /authorize without a session.
     * Use this in tests that call POST /api/oauth/login directly (not via loginForCookie).
     *
     * Returns { flowIdCookie, csrfToken } where flowIdCookie is the raw "flow_id=..." value
     * (without attributes) suitable for use in a Cookie header.
     */
    public async getFlowContext(clientId: string): Promise<{ flowIdCookie: string; csrfToken: string }> {
        const res = await this.app.getHttpServer()
            .get('/api/oauth/authorize')
            .query({
                response_type: 'code',
                client_id: clientId,
                redirect_uri: 'https://login-fixture.local/callback',
                scope: 'openid profile email',
                state: 'flow-ctx-state',
                code_challenge: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopq',
                code_challenge_method: 'plain',
            })
            .redirects(0);

        const cookies: string[] = Array.isArray(res.headers['set-cookie'])
            ? res.headers['set-cookie']
            : res.headers['set-cookie'] ? [res.headers['set-cookie']] : [];
        const flowIdHeader = cookies.find((c: string) => c.startsWith('flow_id='));
        const flowIdCookie = flowIdHeader ? flowIdHeader.split(';')[0] : '';

        const location: string = res.headers['location'] ?? '';
        const csrfToken = location.includes('csrf_token=')
            ? new URL(location, 'http://localhost').searchParams.get('csrf_token') ?? ''
            : '';

        return { flowIdCookie, csrfToken };
    }

    /**
     * Login and return the signed sid cookie.
     * Step 1 of the cookie-based auth code flow — useful when tests need
     * the code directly (e.g. PKCE, single-use, or authorize-level params).
     *
     * NOTE: POST /api/oauth/login now requires a valid csrf_token bound to a
     * flow_id cookie. This helper hits GET /api/oauth/authorize first (without
     * a session) to obtain the flow_id cookie and csrf_token, then uses them
     * for the login POST.
     */
    public async loginForCookie(email: string, password: string, clientId: string): Promise<string> {
        // Step 0: hit /authorize to mint a flow_id cookie and get a csrf_token
        const authorizeRes = await this.app.getHttpServer()
            .get('/api/oauth/authorize')
            .query({
                response_type: 'code',
                client_id: clientId,
                redirect_uri: 'https://login-fixture.local/callback',
                scope: 'openid profile email',
                state: 'fixture-state',
                code_challenge: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopq',
                code_challenge_method: 'plain',
            })
            .redirects(0);

        // Extract flow_id cookie and csrf_token from the authorize redirect
        const authCookies: string[] = Array.isArray(authorizeRes.headers['set-cookie'])
            ? authorizeRes.headers['set-cookie']
            : authorizeRes.headers['set-cookie'] ? [authorizeRes.headers['set-cookie']] : [];
        const flowIdCookie = authCookies.find((c: string) => c.startsWith('flow_id='));

        const location: string = authorizeRes.headers['location'] ?? '';
        const csrfToken = location.includes('csrf_token=')
            ? new URL(location, 'http://localhost').searchParams.get('csrf_token') ?? ''
            : '';

        // Build cookie header: include flow_id if present
        const cookieHeader = flowIdCookie ? flowIdCookie.split(';')[0] : '';

        const loginReq = this.app.getHttpServer()
            .post('/api/oauth/login')
            .send({email, password, client_id: clientId, csrf_token: csrfToken})
            .set('Accept', 'application/json');

        if (cookieHeader) {
            loginReq.set('Cookie', cookieHeader);
        }

        const res = await loginReq;
        expect2xx(res);

        const raw: string | string[] = res.headers['set-cookie'] ?? [];
        const list = Array.isArray(raw) ? raw : [raw];
        const sidCookie = list.find((c: string) => c.startsWith('sid='));
        expect(sidCookie).toBeDefined();
        return sidCookie;
    }

    /**
     * Pre-grant consent for a third-party client so that authorizeForCode()
     * can issue a code without being redirected to the consent UI.
     *
     * Hits GET /authorize to get a flow_id cookie + csrf_token, logs in,
     * then hits GET /authorize again with the session to land on the consent
     * UI redirect, and finally POSTs to /api/oauth/consent with decision=grant.
     */
    public async preGrantConsent(
        email: string,
        password: string,
        clientId: string,
        redirectUri: string,
        scope: string = 'openid profile email',
    ): Promise<void> {
        const sidCookie = await this.loginForCookie(email, password, clientId);

        // Hit /authorize with the session to get the consent UI redirect (which carries csrf_token)
        const authorizeRes = await this.app.getHttpServer()
            .get('/api/oauth/authorize')
            .query({
                response_type: 'code',
                client_id: clientId,
                redirect_uri: redirectUri,
                scope,
                state: 'pre-grant-state',
                code_challenge: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopq',
                code_challenge_method: 'plain',
            })
            .set('Cookie', sidCookie)
            .redirects(0);

        // Extract flow_id cookie from the authorize response (it may have been minted here)
        const authCookies: string[] = Array.isArray(authorizeRes.headers['set-cookie'])
            ? authorizeRes.headers['set-cookie']
            : authorizeRes.headers['set-cookie'] ? [authorizeRes.headers['set-cookie']] : [];
        const flowIdCookieHeader = authCookies.find((c: string) => c.startsWith('flow_id='));
        const flowIdCookieValue = flowIdCookieHeader ? flowIdCookieHeader.split(';')[0] : '';

        // Extract csrf_token from the redirect location
        const location: string = authorizeRes.headers['location'] ?? '';
        const csrfToken = location.includes('csrf_token=')
            ? new URL(location, 'http://localhost').searchParams.get('csrf_token') ?? ''
            : '';

        // Build combined cookie header: sid + flow_id
        const cookieParts = [sidCookie.split(';')[0]];
        if (flowIdCookieValue) cookieParts.push(flowIdCookieValue);
        const combinedCookies = cookieParts.join('; ');

        const res = await this.app.getHttpServer()
            .post('/api/oauth/consent')
            .send({
                client_id: clientId,
                redirect_uri: redirectUri,
                scope,
                response_type: 'code',
                code_challenge: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopq',
                code_challenge_method: 'plain',
                csrf_token: csrfToken,
                decision: 'grant',
            })
            .set('Cookie', combinedCookies)
            .redirects(0);

        // Consent returns 200 (success JSON) — that's success
        expect([302, 200]).toContain(res.status);
    }

    /**
     * GET /api/oauth/authorize with a sid cookie and return the auth code from the redirect.
     * Step 2 of the cookie-based auth code flow — useful when tests need the code directly.
     *
     * @param sidCookie   The signed sid cookie returned by loginForCookie()
     * @param clientId    OAuth client_id
     * @param redirectUri Registered redirect URI for the client
     * @param opts        Optional authorize params: scope, state, codeChallenge, prompt, subscriberTenantHint
     */
    public async authorizeForCode(
        sidCookie: string,
        clientId: string,
        redirectUri: string,
        opts?: {
            scope?: string;
            state?: string;
            codeChallenge?: string;
            codeChallengeMethod?: string;
            prompt?: string;
            subscriberTenantHint?: string;
            resource?: string;
            nonce?: string;
            maxAge?: number;
        },
    ): Promise<string> {
        const codeChallenge = opts?.codeChallenge ?? 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopq';
        const query: Record<string, string> = {
            response_type: 'code',
            client_id: clientId,
            redirect_uri: redirectUri,
            scope: opts?.scope ?? 'openid profile email',
            state: opts?.state ?? 'test-state',
            code_challenge: codeChallenge,
            code_challenge_method: opts?.codeChallengeMethod ?? 'plain',
            session_confirmed: 'true',
        };
        if (opts?.prompt) query.prompt = opts.prompt;
        if (opts?.subscriberTenantHint) query.subscriber_tenant_hint = opts.subscriberTenantHint;
        if (opts?.resource) query.resource = opts.resource;
        if (opts?.nonce) query.nonce = opts.nonce;
        if (opts?.maxAge !== undefined) query.max_age = String(opts.maxAge);

        const res = await this.app.getHttpServer()
            .get('/api/oauth/authorize')
            .query(query)
            .set('Cookie', sidCookie)
            .redirects(0);

        expect(res.status).toEqual(302);
        const location: string = res.headers['location'];
        const redirectUrl = new URL(location, 'http://localhost');
        expect(redirectUrl.searchParams.has('error')).toBe(false);
        const code = redirectUrl.searchParams.get('code');
        expect(code).toBeDefined();
        return code;
    }

    /**
     * Convenience helper: login → authorize → return auth code.
     * Combines loginForCookie() + authorizeForCode() for tests that need
     * the code directly (PKCE, single-use, subscriber hints, etc.)
     * but don't want to manage the cookie themselves.
     */
    public async fetchAuthCode(
        email: string,
        password: string,
        clientId: string,
        redirectUri: string,
        opts?: {
            scope?: string;
            state?: string;
            codeChallenge?: string;
            codeChallengeMethod?: string;
            prompt?: string;
            subscriberTenantHint?: string;
            resource?: string;
            nonce?: string;
            maxAge?: number;
        },
    ): Promise<string> {
        const sidCookie = await this.loginForCookie(email, password, clientId);
        return this.authorizeForCode(sidCookie, clientId, redirectUri, opts);
    }

    /**
     * Full authorization code flow via the new cookie-based login → authorize → token pipeline.
     *
     * Steps:
     *   1. POST /api/oauth/login  — validates credentials, creates a session, sets signed sid cookie
     *   2. GET  /api/oauth/authorize — reads the sid cookie, issues an auth code, redirects to redirect_uri
     *   3. POST /api/oauth/token  — exchanges the auth code for tokens
     *
     * Returns the full token response (access_token, id_token, refresh_token, etc.).
     *
     * @param email       User email
     * @param password    User password
     * @param clientId    OAuth client_id (alias or UUID)
     * @param redirectUri Must be registered on the client (or empty string for clients with no registered URIs)
     * @param opts        Optional scope, nonce, state, codeVerifier overrides
     */
    public async fetchTokenWithLoginFlow(
        email: string,
        password: string,
        clientId: string,
        redirectUri: string,
        opts?: {
            scope?: string;
            nonce?: string;
            state?: string;
            codeVerifier?: string;
        },
    ): Promise<any> {
        const codeVerifier = opts?.codeVerifier ?? 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopq';
        const codeChallenge = codeVerifier; // plain method: challenge === verifier
        const scope = opts?.scope ?? 'openid profile email';
        const state = opts?.state ?? crypto.randomUUID();

        // Step 1: Get flow_id cookie and csrf_token from /authorize (no session yet)
        const preAuthorizeRes = await this.app.getHttpServer()
            .get('/api/oauth/authorize')
            .query({
                response_type: 'code',
                client_id: clientId,
                redirect_uri: redirectUri,
                scope,
                state,
                code_challenge: codeChallenge,
                code_challenge_method: 'plain',
            })
            .redirects(0);

        const preAuthCookies: string[] = Array.isArray(preAuthorizeRes.headers['set-cookie'])
            ? preAuthorizeRes.headers['set-cookie']
            : preAuthorizeRes.headers['set-cookie'] ? [preAuthorizeRes.headers['set-cookie']] : [];
        const flowIdCookieHeader = preAuthCookies.find((c: string) => c.startsWith('flow_id='));
        const flowIdCookieValue = flowIdCookieHeader ? flowIdCookieHeader.split(';')[0] : '';

        const preAuthLocation: string = preAuthorizeRes.headers['location'] ?? '';
        const csrfToken = preAuthLocation.includes('csrf_token=')
            ? new URL(preAuthLocation, 'http://localhost').searchParams.get('csrf_token') ?? ''
            : '';

        // Step 2: Login — creates session, sets signed sid cookie
        const loginReq = this.app.getHttpServer()
            .post('/api/oauth/login')
            .send({email, password, client_id: clientId, csrf_token: csrfToken})
            .set('Accept', 'application/json');

        if (flowIdCookieValue) {
            loginReq.set('Cookie', flowIdCookieValue);
        }

        const loginRes = await loginReq;

        expect2xx(loginRes);
        // The login endpoint returns 201 (session created)

        // Extract the signed sid cookie from the Set-Cookie header
        const setCookieHeader: string | string[] = loginRes.headers['set-cookie'] ?? [];
        const cookies = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];
        const sidCookie = cookies.find((c: string) => c.startsWith('sid='));
        expect(sidCookie).toBeDefined();

        // Step 2: GET /authorize — server reads sid cookie, issues auth code, redirects
        const authorizeRes = await this.app.getHttpServer()
            .get('/api/oauth/authorize')
            .query({
                response_type: 'code',
                client_id: clientId,
                redirect_uri: redirectUri,
                scope,
                state,
                code_challenge: codeChallenge,
                code_challenge_method: 'plain',
                session_confirmed: 'true',
                ...(opts?.nonce ? {nonce: opts.nonce} : {}),
            })
            .set('Cookie', sidCookie)
            .redirects(0);

        expect(authorizeRes.status).toEqual(302);
        const location: string = authorizeRes.headers['location'];
        expect(location).toBeDefined();

        const redirectUrl = new URL(location, 'http://localhost');
        expect(redirectUrl.searchParams.has('error')).toBe(false);
        const code = redirectUrl.searchParams.get('code');
        expect(code).toBeDefined();

        // Step 3: Exchange auth code for tokens
        const tokenRes = await this.app.getHttpServer()
            .post('/api/oauth/token')
            .send({
                grant_type: 'authorization_code',
                code,
                code_verifier: codeVerifier,
                client_id: clientId,
                redirect_uri: redirectUri,
            })
            .set('Accept', 'application/json');

        expect2xx(tokenRes);
        expect(tokenRes.body.access_token).toBeDefined();
        return tokenRes.body;
    }

}
