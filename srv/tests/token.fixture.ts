import {expect2xx, TestFixture} from "./api-client/client";
import {ClientEntityClient} from "./api-client/client-entity-client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface JwtPayload {
    sub: string;
    grant_type: string;
    tenant: {
        id: string;
        name: string;
        domain: string;
    };
    scopes?: string[];
    scope?: string;
    roles?: string[];
    client_id?: string;
    aud?: string | string[];
    jti?: string;
    [key: string]: any;
}

interface TokenResponse {
    access_token: string;
    refresh_token?: string;
    id_token?: string;
    token_type: string;
    expires_in: number;
}

interface CsrfContext {
    flowIdCookie: string;
    csrfToken: string;
}

export interface AuthorizeParams {
    clientId: string;
    redirectUri?: string;
    scope: string;
    state: string;
    codeChallenge: string;
    codeChallengeMethod: string;
    prompt?: string;
    subscriberTenantHint?: string;
    resource?: string;
    nonce?: string;
    maxAge?: number;
}

// ---------------------------------------------------------------------------
// Helper utilities
// ---------------------------------------------------------------------------

/**
 * Extract a specific cookie from Set-Cookie headers.
 * Returns the full cookie string (name=value) without attributes.
 */
function extractCookie(headers: any, name: string): string {
    const raw: string | string[] = headers['set-cookie'] ?? [];
    const list = Array.isArray(raw) ? raw : [raw];
    const cookie = list.find((c: string) => c.startsWith(`${name}=`));
    return cookie ? cookie.split(';')[0] : '';
}

/**
 * Combine multiple cookie strings into a single Cookie header value.
 */
function combineCookies(...cookies: string[]): string {
    return cookies.filter(Boolean).join('; ');
}

// ---------------------------------------------------------------------------
// TokenFixture — Composable OAuth flow builder
// ---------------------------------------------------------------------------
export class TokenFixture {
    private readonly app: TestFixture;

    constructor(app: TestFixture) {
        this.app = app;
    }

    // -----------------------------------------------------------------------
    // Atomic OAuth flow steps (building blocks)
    // -----------------------------------------------------------------------

    /**
     * Step 0: Hit GET /authorize without a session to obtain flow_id cookie and csrf_token.
     * This is required before calling POST /login due to CSRF protection.
     */
    public async initializeFlow(params: AuthorizeParams): Promise<CsrfContext> {
        const query: Record<string, string> = {
            response_type: 'code',
            client_id: params.clientId,
            scope: params.scope,
            state: params.state,
            code_challenge: params.codeChallenge,
            code_challenge_method: params.codeChallengeMethod,
        };
        if (params.redirectUri) query.redirect_uri = params.redirectUri;
        if (params.prompt) query.prompt = params.prompt;
        if (params.subscriberTenantHint) query.subscriber_tenant_hint = params.subscriberTenantHint;
        if (params.resource) query.resource = params.resource;
        if (params.nonce) query.nonce = params.nonce;
        if (params.maxAge !== undefined) query.max_age = String(params.maxAge);

        const res = await this.app.getHttpServer()
            .get('/api/oauth/authorize')
            .query(query)
            .redirects(0);

        const flowIdCookie = extractCookie(res.headers, 'flow_id');
        const location: string = res.headers['location'] ?? '';
        const csrfToken = location.includes('csrf_token=')
            ? new URL(location, 'http://localhost').searchParams.get('csrf_token') ?? ''
            : '';

        return { flowIdCookie, csrfToken };
    }

    /**
     * Step 1: POST /login with credentials to create a session.
     * Returns the signed sid cookie.
     */
    public async login(
        email: string,
        password: string,
        clientId: string,
        csrfContext: CsrfContext,
        subscriberTenantHint?: string,
    ): Promise<string> {
        const body: any = {
            email,
            password,
            client_id: clientId,
            csrf_token: csrfContext.csrfToken,
        };
        if (subscriberTenantHint) {
            body.subscriber_tenant_hint = subscriberTenantHint;
        }

        const req = this.app.getHttpServer()
            .post('/api/oauth/login')
            .send(body)
            .set('Accept', 'application/json');

        if (csrfContext.flowIdCookie) {
            req.set('Cookie', csrfContext.flowIdCookie);
        }

        const res = await req;
        expect2xx(res);

        const sidCookie = extractCookie(res.headers, 'sid');
        expect(sidCookie).toBeDefined();
        return sidCookie;
    }

    /**
     * Step 2a: GET /authorize with session to check if consent is required.
     * Returns the redirect location and any updated cookies.
     */
    public async checkAuthorize(
        params: AuthorizeParams,
        sidCookie: string,
        flowIdCookie: string,
    ): Promise<{ location: string; flowIdCookie: string }> {
        const query: Record<string, string> = {
            response_type: 'code',
            client_id: params.clientId,
            scope: params.scope,
            state: params.state,
            code_challenge: params.codeChallenge,
            code_challenge_method: params.codeChallengeMethod,
            session_confirmed: 'true',
        };
        if (params.redirectUri) query.redirect_uri = params.redirectUri;
        if (params.prompt) query.prompt = params.prompt;
        if (params.subscriberTenantHint) query.subscriber_tenant_hint = params.subscriberTenantHint;
        if (params.resource) query.resource = params.resource;
        if (params.nonce) query.nonce = params.nonce;
        if (params.maxAge !== undefined) query.max_age = String(params.maxAge);

        const res = await this.app.getHttpServer()
            .get('/api/oauth/authorize')
            .query(query)
            .set('Cookie', combineCookies(sidCookie, flowIdCookie))
            .redirects(0);

        const location: string = res.headers['location'] ?? '';
        const updatedFlowId = extractCookie(res.headers, 'flow_id') || flowIdCookie;

        return { location, flowIdCookie: updatedFlowId };
    }

    /**
     * Step 2b: POST /consent to grant consent for a third-party client.
     * Only needed if checkAuthorize() returns a location with view=consent.
     */
    public async grantConsent(
        params: AuthorizeParams,
        sidCookie: string,
        flowIdCookie: string,
        csrfToken: string,
    ): Promise<void> {
        const res = await this.app.getHttpServer()
            .post('/api/oauth/consent')
            .send({
                client_id: params.clientId,
                redirect_uri: params.redirectUri,
                scope: params.scope,
                response_type: 'code',
                code_challenge: params.codeChallenge,
                code_challenge_method: params.codeChallengeMethod,
                csrf_token: csrfToken,
                decision: 'grant',
            })
            .set('Cookie', combineCookies(sidCookie, flowIdCookie))
            .redirects(0);

        expect([200, 201, 302]).toContain(res.status);
    }

    /**
     * Step 3: GET /authorize with session_confirmed=true to obtain the authorization code.
     * Assumes consent has been granted (if required).
     */
    public async getAuthorizationCode(
        params: AuthorizeParams,
        sidCookie: string,
        flowIdCookie: string,
    ): Promise<string> {
        const { location } = await this.checkAuthorize(params, sidCookie, flowIdCookie);

        expect(location).toBeDefined();
        const redirectUrl = new URL(location, 'http://localhost');
        expect(redirectUrl.searchParams.has('error')).toBe(false);

        const code = redirectUrl.searchParams.get('code');
        expect(code).toBeDefined();
        return code!;
    }

    /**
     * Step 4: POST /token to exchange authorization code for tokens.
     */
    public async exchangeAuthorizationCode(
        code: string,
        clientId: string,
        codeVerifier: string,
        redirectUri?: string,
        subscriptionTenantId?: string,
    ): Promise<TokenResponse> {
        const body: any = {
            grant_type: 'authorization_code',
            code,
            code_verifier: codeVerifier,
            client_id: clientId,
        };
        if (redirectUri) body.redirect_uri = redirectUri;
        if (subscriptionTenantId) body.subscriber_tenant_hint = subscriptionTenantId;

        const res = await this.app.getHttpServer()
            .post('/api/oauth/token')
            .send(body)
            .set('Accept', 'application/json');

        expect2xx(res);

        // Handle ambiguous tenant error
        if (res.body.error) {
            return res.body;
        }

        expect(res.body.access_token).toBeDefined();
        expect(res.body.token_type).toEqual('Bearer');
        return res.body;
    }

    // -----------------------------------------------------------------------
    // Partial flows (stop at specific stages)
    // -----------------------------------------------------------------------

    /**
     * Partial flow: Initialize + Login → returns sid cookie.
     * Use when you need to test authorize/consent/code steps independently.
     */
    public async fetchSidCookieFlow(
        email: string,
        password: string,
        params: AuthorizeParams,
        subscriberTenantHint?: string,
    ): Promise<string> {
        const csrfContext = await this.initializeFlow(params);
        return this.login(email, password, params.clientId, csrfContext, subscriberTenantHint);
    }

    /**
     * Partial flow: Initialize + Login + Authorize → returns authorization code.
     * Use when you need to test token exchange independently.
     */
    public async fetchAuthCodeFlow(
        email: string,
        password: string,
        params: AuthorizeParams,
    ): Promise<string> {
        const csrfContext = await this.initializeFlow(params);
        const sidCookie = await this.login(email, password, params.clientId, csrfContext);
        return this.getAuthorizationCode(params, sidCookie, csrfContext.flowIdCookie);
    }

    /**
     * Partial flow: Initialize + Login + Consent (if needed) + Authorize → returns authorization code.
     * Use when testing third-party client flows that require consent.
     */
    public async fetchAuthCodeWithConsentFlow(
        email: string,
        password: string,
        params: AuthorizeParams,
    ): Promise<string> {
        const csrfContext = await this.initializeFlow(params);
        const sidCookie = await this.login(email, password, params.clientId, csrfContext);

        // Check if consent is required
        const { location, flowIdCookie } = await this.checkAuthorize(params, sidCookie, csrfContext.flowIdCookie);

        if (location.includes('view=consent')) {
            const csrfToken = new URL(location, 'http://localhost').searchParams.get('csrf_token') ?? '';
            await this.grantConsent(params, sidCookie, flowIdCookie, csrfToken);
        }

        return this.getAuthorizationCode(params, sidCookie, flowIdCookie);
    }

    // -----------------------------------------------------------------------
    // Full flows (end-to-end)
    // -----------------------------------------------------------------------

    /**
     * Full OAuth authorization code flow: Initialize → Login → Authorize → Exchange.
     * Returns the complete token response.
     */
    public async fetchTokenWithAuthCodeFlow(
        email: string,
        password: string,
        params: AuthorizeParams,
        codeVerifier: string,
    ): Promise<TokenResponse> {
        const code = await this.fetchAuthCodeFlow(email, password, params);
        return this.exchangeAuthorizationCode(code, params.clientId, codeVerifier, params.redirectUri);
    }

    /**
     * Full OAuth authorization code flow with consent handling.
     * Automatically grants consent if required by a third-party client.
     */
    public async fetchTokenWithAuthCodeFlowAndConsent(
        email: string,
        password: string,
        params: AuthorizeParams,
        codeVerifier: string,
    ): Promise<TokenResponse> {
        const code = await this.fetchAuthCodeWithConsentFlow(email, password, params);
        return this.exchangeAuthorizationCode(code, params.clientId, codeVerifier, params.redirectUri);
    }

    // -----------------------------------------------------------------------
    // Legacy password grant (deprecated but still used in tests)
    // -----------------------------------------------------------------------

    /**
     * Legacy: Fetch access token using password grant (deprecated OAuth 2.0 flow).
     * Use authorization code flow for new tests.
     */
    public async fetchAccessTokenFlow(
        username: string,
        password: string,
        clientId: string,
    ): Promise<{ accessToken: string; refreshToken: string; jwt: JwtPayload }> {
        const res = await this.app.getHttpServer()
            .post('/api/oauth/token')
            .send({
                grant_type: "password",
                username,
                password,
                client_id: clientId,
            })
            .set('Accept', 'application/json');

        expect2xx(res);
        expect(res.status).toEqual(200);
        expect(res.body.access_token).toBeDefined();
        expect(res.body.refresh_token).toBeDefined();
        expect(res.body.token_type).toEqual('Bearer');

        const jwt = this.app.jwtService().decode(res.body.access_token, { json: true }) as JwtPayload;
        expect(jwt.sub).toBeDefined();
        expect(jwt.tenant.id).toBeDefined();

        return {
            accessToken: res.body.access_token,
            refreshToken: res.body.refresh_token,
            jwt,
        };
    }

    // -----------------------------------------------------------------------
    // Client credentials grant
    // -----------------------------------------------------------------------

    /**
     * Create a confidential (non-public) client for client_credentials grant.
     * Returns clientId and plaintext clientSecret.
     */
    public async createConfidentialClient(
        accessToken: string,
        tenantId: string,
        name: string = 'Confidential Client',
        grantTypes: string = 'client_credentials',
        allowedScopes: string = 'openid profile email',
    ): Promise<{ clientId: string; clientSecret: string }> {
        const clientEntityClient = new ClientEntityClient(this.app, accessToken);
        const result = await clientEntityClient.createClient(tenantId, name, {
            grantTypes,
            allowedScopes,
            isPublic: false,
        });
        return {
            clientId: result.client.clientId,
            clientSecret: result.clientSecret,
        };
    }

    /**
     * Fetch access token using client credentials grant.
     */
    public async fetchClientCredentialsTokenFlow(
        clientId: string,
        clientSecret: string,
    ): Promise<{ accessToken: string; refreshToken?: string; jwt: JwtPayload }> {
        const res = await this.app.getHttpServer()
            .post('/api/oauth/token')
            .send({
                grant_type: "client_credentials",
                client_id: clientId,
                client_secret: clientSecret,
            })
            .set('Accept', 'application/json');

        expect2xx(res);
        expect(res.body.access_token).toBeDefined();
        expect(res.body.token_type).toEqual('Bearer');

        const jwt = this.app.jwtService().decode(res.body.access_token, { json: true }) as JwtPayload;

        return {
            accessToken: res.body.access_token,
            refreshToken: res.body.refresh_token,
            jwt,
        };
    }

    // -----------------------------------------------------------------------
    // Utility methods
    // -----------------------------------------------------------------------

    /**
     * Get the current user profile using an access token.
     * This is a flow because it calls fetchAccessTokenFlow internally.
     */
    public async getUserFlow(email: string, password: string): Promise<any> {
        const { accessToken } = await this.fetchAccessTokenFlow(email, password, "auth.server.com");
        const res = await this.app.getHttpServer()
            .get("/api/users/me")
            .set('Authorization', `Bearer ${accessToken}`)
            .set('Accept', 'application/json');

        expect(res.status).toEqual(200);
        return res.body;
    }

    /**
     * Pre-grant consent for a third-party client.
     * Use this to set up test state before running authorize flows.
     * This is a flow because it calls initializeFlow internally.
     */
    public async preGrantConsentFlow(
        email: string,
        password: string,
        params: AuthorizeParams,
    ): Promise<void> {
        const csrfContext = await this.initializeFlow(params);
        const sidCookie = await this.login(email, password, params.clientId, csrfContext);

        // Hit /authorize to get consent redirect
        const { location, flowIdCookie } = await this.checkAuthorize(params, sidCookie, csrfContext.flowIdCookie);

        if (!location.includes('view=consent')) {
            return; // Consent not required
        }

        const csrfToken = new URL(location, 'http://localhost').searchParams.get('csrf_token') ?? '';
        await this.grantConsent(params, sidCookie, flowIdCookie, csrfToken);
    }

    // -----------------------------------------------------------------------
    // Deprecated/legacy methods (kept for backward compatibility)
    // -----------------------------------------------------------------------

    /**
     * @deprecated Use fetchTokenWithAuthCodeFlow instead.
     * Legacy method that combines login + authorize + token exchange.
     */
    public async fetchTokenWithLoginFlow(
        email: string,
        password: string,
        clientId: string,
        redirectUri: string,
        scope: string,
        state: string,
        codeChallenge: string,
        codeChallengeMethod: string,
        nonce?: string,
    ): Promise<TokenResponse> {
        const params: AuthorizeParams = {
            clientId,
            redirectUri,
            scope,
            state,
            codeChallenge,
            codeChallengeMethod,
            nonce,
        };
        return this.fetchTokenWithAuthCodeFlow(email, password, params, codeChallenge);
    }

    /**
     * @deprecated Use login() with initializeFlow() instead.
     * Legacy method that posts credentials directly to /login.
     */
    public async loginLegacy(
        email: string,
        password: string,
        clientId: string,
        codeChallenge: string,
        codeChallengeMethod: string,
        scope: string,
        state: string,
        subscriberTenantHint?: string,
        redirectUri?: string,
        nonce?: string,
    ): Promise<any> {
        const params: AuthorizeParams = {
            clientId,
            redirectUri,
            scope,
            state,
            codeChallenge,
            codeChallengeMethod,
            nonce,
        };
        const csrfContext = await this.initializeFlow(params);

        const body: any = {
            email,
            password,
            client_id: clientId,
            code_challenge_method: codeChallengeMethod,
            code_challenge: codeChallenge,
            csrf_token: csrfContext.csrfToken,
        };
        if (subscriberTenantHint) body.subscriber_tenant_hint = subscriberTenantHint;
        if (scope) body.scope = scope;
        if (nonce) body.nonce = nonce;

        const req = this.app.getHttpServer()
            .post('/api/oauth/login')
            .send(body)
            .set('Accept', 'application/json');

        if (csrfContext.flowIdCookie) {
            req.set('Cookie', csrfContext.flowIdCookie);
        }

        const res = await req;
        expect2xx(res);
        return res.body;
    }

    /**
     * @deprecated Use exchangeAuthorizationCode() instead.
     * Legacy method for exchanging auth code for tokens.
     */
    public async exchangeCodeForToken(
        code: string,
        clientId: string,
        codeVerifier: string,
    ): Promise<TokenResponse> {
        return this.exchangeAuthorizationCode(code, clientId, codeVerifier);
    }

    /**
     * @deprecated Use exchangeAuthorizationCode() with subscriptionTenantId parameter.
     */
    public async exchangeCodeWithHint(
        code: string,
        clientId: string,
        codeVerifier: string,
        subscriptionTenantId?: string,
    ): Promise<TokenResponse> {
        return this.exchangeAuthorizationCode(code, clientId, codeVerifier, undefined, subscriptionTenantId);
    }

    /**
     * @deprecated Use getAuthorizationCode() instead.
     * Legacy method that hits /authorize with a session cookie.
     * Supports both positional args and an object-based signature.
     */
    public async authorizeForCode(
        sidCookie: string,
        clientId: string,
        redirectUri: string,
        scopeOrOpts?: string | {
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
        state?: string,
        codeChallenge?: string,
        codeChallengeMethod?: string,
        prompt?: string,
        subscriberTenantHint?: string,
        resource?: string,
        nonce?: string,
        maxAge?: number,
    ): Promise<string> {
        let params: AuthorizeParams;
        if (typeof scopeOrOpts === 'object' && scopeOrOpts !== null) {
            params = {
                clientId,
                redirectUri,
                scope: scopeOrOpts.scope ?? 'openid profile email',
                state: scopeOrOpts.state ?? 'test-state',
                codeChallenge: scopeOrOpts.codeChallenge ?? 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopq',
                codeChallengeMethod: scopeOrOpts.codeChallengeMethod ?? 'plain',
                prompt: scopeOrOpts.prompt,
                subscriberTenantHint: scopeOrOpts.subscriberTenantHint,
                resource: scopeOrOpts.resource,
                nonce: scopeOrOpts.nonce,
                maxAge: scopeOrOpts.maxAge,
            };
        } else {
            params = {
                clientId,
                redirectUri,
                scope: (scopeOrOpts as string) ?? 'openid profile email',
                state: state ?? 'test-state',
                codeChallenge: codeChallenge ?? 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopq',
                codeChallengeMethod: codeChallengeMethod ?? 'plain',
                prompt,
                subscriberTenantHint,
                resource,
                nonce,
                maxAge,
            };
        }
        // We need a flowIdCookie, but legacy callers don't provide it.
        // For backward compatibility, we'll initialize a new flow context.
        const csrfContext = await this.initializeFlow(params);
        return this.getAuthorizationCode(params, sidCookie, csrfContext.flowIdCookie);
    }

    /**
     * @deprecated Use fetchSidCookieFlow() instead.
     * Legacy method that logs in and returns the sid cookie.
     */
    public async loginForCookie(
        email: string,
        password: string,
        clientId: string,
        redirectUri: string,
    ): Promise<string> {
        return this.fetchSidCookieFlow(email, password, {
            clientId,
            redirectUri,
            scope: 'openid profile email',
            state: 'test-state',
            codeChallenge: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopq',
            codeChallengeMethod: 'plain',
        });
    }

    /**
     * @deprecated Use fetchAuthCodeWithConsentFlow() instead.
     * Legacy method that logs in, handles consent, and returns an auth code.
     */
    public async fetchAuthCode(
        email: string,
        password: string,
        clientId: string,
        redirectUri: string,
        opts?: {
            codeChallenge?: string;
            codeChallengeMethod?: string;
            scope?: string;
            nonce?: string;
        },
    ): Promise<string> {
        return this.fetchAuthCodeWithConsentFlow(email, password, {
            clientId,
            redirectUri,
            scope: opts?.scope ?? 'openid profile email',
            state: 'test-state',
            codeChallenge: opts?.codeChallenge ?? 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopq',
            codeChallengeMethod: opts?.codeChallengeMethod ?? 'plain',
            nonce: opts?.nonce,
        });
    }

    /**
     * @deprecated Use preGrantConsentFlow() instead.
     * Legacy method that pre-grants consent for a third-party client.
     */
    public async preGrantConsent(
        email: string,
        password: string,
        clientId: string,
        redirectUri: string,
        scope?: string,
    ): Promise<void> {
        return this.preGrantConsentFlow(email, password, {
            clientId,
            redirectUri,
            scope: scope ?? 'openid profile email',
            state: 'consent-state',
            codeChallenge: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopq',
            codeChallengeMethod: 'plain',
        });
    }
}
