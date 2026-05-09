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
     */
    public async login(
        email: string,
        password: string,
        clientId: string,
        codeChallenge: string = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopq',
        subscriberTenantHint?: string,
        opts?: { scope?: string; nonce?: string; codeChallengeMethod?: string }
    ): Promise<any> {
        const body: any = {
            email,
            password,
            client_id: clientId,
            code_challenge_method: opts?.codeChallengeMethod || 'plain',
            code_challenge: codeChallenge
        };
        if (subscriberTenantHint) {
            body.subscriber_tenant_hint = subscriberTenantHint;
        }
        if (opts?.scope) body.scope = opts.scope;
        if (opts?.nonce) body.nonce = opts.nonce;
        const response = await this.app.getHttpServer()
            .post('/api/oauth/login')
            .send(body)
            .set('Accept', 'application/json');

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
     * Login and return the signed sid cookie.
     * Step 1 of the cookie-based auth code flow — useful when tests need
     * the code directly (e.g. PKCE, single-use, or authorize-level params).
     */
    public async loginForCookie(email: string, password: string, clientId: string): Promise<string> {
        const res = await this.app.getHttpServer()
            .post('/api/oauth/login')
            .send({email, password, client_id: clientId})
            .set('Accept', 'application/json');

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
     * Computes the CSRF token from the sid using the dev cookie secret,
     * then POSTs to /api/oauth/consent with decision=grant.
     */
    public async preGrantConsent(
        email: string,
        password: string,
        clientId: string,
        redirectUri: string,
        scope: string = 'openid profile email',
    ): Promise<void> {
        const sidCookie = await this.loginForCookie(email, password, clientId);

        // Extract the raw sid value from the signed cookie string
        // Cookie format: "sid=s%3A<value>.<signature>; Path=..."
        const cookieValue = sidCookie.split(';')[0].split('=').slice(1).join('=');
        // Decode URI component and strip the "s:" prefix added by cookie-parser
        const decoded = decodeURIComponent(cookieValue).replace(/^s:/, '');
        const sid = decoded.split('.')[0];

        // Compute CSRF token: HMAC-SHA256(sid, COOKIE_SECRET)
        const crypto = require('crypto');
        const csrfToken = crypto
            .createHmac('sha256', 'dev-cookie-secret-do-not-use-in-prod')
            .update(sid)
            .digest('hex');

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
            .set('Cookie', sidCookie)
            .redirects(0);

        // Consent redirects to /api/oauth/authorize (302) — that's success
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

        // Step 1: Login — creates session, sets signed sid cookie
        const loginRes = await this.app.getHttpServer()
            .post('/api/oauth/login')
            .send({email, password, client_id: clientId})
            .set('Accept', 'application/json');

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
