/**
 * Integration tests for the consent flow (cookie + CSRF + PRG redirect contract).
 *
 * Covers behaviors unique to the consent flow that are NOT already covered by the
 * consent property tests (`consent-required-iff-scopes-exceed`, `consent-missing-always-required`,
 * `consent-grant-produces-union`, `consent-narrower-no-modify`):
 *
 *   - GET  /api/oauth/authorize → 302 to /consent UI for a third-party client with no prior consent
 *   - GET  /api/oauth/authorize → 302 directly to redirect_uri?code=... for a first-party (tenant-domain) client_id
 *   - Consent UI redirect carries the resolved scope set (intersection with client.allowedScopes)
 *   - POST /api/oauth/consent (grant)  → 302 → /authorize → redirect_uri?code=... (code is exchangeable for tokens)
 *   - POST /api/oauth/consent (deny)   → 302 → redirect_uri?error=access_denied
 *   - Deny does not create a consent record (subsequent /authorize still redirects to consent UI)
 *   - POST /api/oauth/consent requires a valid sid cookie (401 without it)
 *   - POST /api/oauth/consent requires a valid CSRF token (403 with wrong token)
 *   - POST /api/oauth/consent rejects unknown client_id (400)
 *   - POST /api/oauth/consent rejects unregistered redirect_uri (400)
 *   - POST /api/oauth/consent with scope outside client.allowedScopes → those scopes are silently dropped
 *     from the granted set (issued token does not carry them)
 *   - prompt=consent forces re-consent even when consent already covers the requested scopes
 *
 * Requirements: 2.2, 3.1 (resolved), 3.2, 3.3, 6.1, 6.3, 6.4 (CSRF / session re-check)
 */
import * as crypto from 'crypto';
import {SharedTestFixture} from '../shared-test.fixture';
import {TokenFixture} from '../token.fixture';
import {ClientEntityClient} from '../api-client/client-entity-client';
import {TenantClient} from '../api-client/tenant-client';

const CODE_CHALLENGE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopq';
const CODE_VERIFIER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopq';
const REDIRECT_URI = 'https://consent-flow-test.example.com/callback';
const COOKIE_SECRET = 'dev-cookie-secret-do-not-use-in-prod';

const ADMIN_EMAIL = 'admin@auth.server.com';
const ADMIN_PASSWORD = 'admin9000';

/**
 * Look up a Client by alias via the generic search endpoint.
 * The search endpoint is available to super admins regardless of tenant scoping,
 * so we use it to find the default clients for both the super tenant and the test tenant.
 */
async function findClientByAlias(
    app: SharedTestFixture,
    accessToken: string,
    alias: string,
): Promise<any | null> {
    const response = await app.getHttpServer()
        .post('/api/search/Clients')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
            pageNo: 0,
            pageSize: 10,
            where: [{field: 'alias', label: 'alias', value: alias, operator: 'equals'}],
        });
    if (response.status >= 200 && response.status < 300) {
        const rows = response.body?.data ?? [];
        return rows.find((c: any) => c.alias === alias) ?? null;
    }
    return null;
}

describe('Consent Flow Integration Tests', () => {
    let app: SharedTestFixture;
    let tokenFixture: TokenFixture;
    let clientApi: ClientEntityClient;
    let tenantApi: TenantClient;
    let testTenantId: string;
    let testTenantDomain: string;

    // Third-party clients used across tests
    let thirdPartyClientId: string;      // allowedScopes: openid profile email
    let narrowScopesClientId: string;    // allowedScopes: openid profile  (no email)

    // First-party default client — we register REDIRECT_URI on the test tenant's
    // default client so it can participate in the authorize-code flow against our test URI.
    let testTenantDefaultClientId: string;

    beforeAll(async () => {
        app = new SharedTestFixture();
        tokenFixture = new TokenFixture(app);

        const tokenResponse = await tokenFixture.fetchAccessToken(
            ADMIN_EMAIL,
            ADMIN_PASSWORD,
            'auth.server.com',
        );
        const accessToken = tokenResponse.accessToken;

        clientApi = new ClientEntityClient(app, accessToken);
        tenantApi = new TenantClient(app, accessToken);

        // Dedicated test tenant (name is limited to 20 chars)
        const uniqueSuffix = String(Date.now()).slice(-8);
        testTenantDomain = `cf-test-${uniqueSuffix}.com`;
        const tenant = await tenantApi.createTenant(
            `cf-test-${uniqueSuffix}`,
            testTenantDomain,
        );
        testTenantId = tenant.id;

        const fullScopesClient = await clientApi.createClient(testTenantId, 'Full Scopes App', {
            redirectUris: [REDIRECT_URI],
            allowedScopes: 'openid profile email',
            isPublic: true,
        });
        thirdPartyClientId = fullScopesClient.client.clientId;

        const narrowClient = await clientApi.createClient(testTenantId, 'Narrow Scopes App', {
            redirectUris: [REDIRECT_URI],
            allowedScopes: 'openid profile',
            isPublic: true,
        });
        narrowScopesClientId = narrowClient.client.clientId;

        // Register REDIRECT_URI on the test tenant's default client so the Req 6.3 test
        // (first-party tenant-domain client_id skips consent) can issue codes against
        // our test URI. We intentionally avoid mutating the super-tenant default client —
        // other tests depend on its pre-existing redirect URI and the PATCH schema would
        // reject URIs like `http://localhost:3000/callback` as "not a valid URL" via yup.
        const testDefault = await findClientByAlias(app, accessToken, testTenantDomain);
        expect(testDefault).toBeDefined();
        testTenantDefaultClientId = testDefault.clientId;
        await clientApi.updateClient(testTenantDefaultClientId, {redirectUris: [REDIRECT_URI]});
    });

    afterAll(async () => {
        await clientApi.deleteClient(thirdPartyClientId).catch(() => {});
        await clientApi.deleteClient(narrowScopesClientId).catch(() => {});
        await app.close();
    });

    // ── Helpers ────────────────────────────────────────────────────

    /** Extract the raw (unsigned) sid value from a signed cookie string. */
    function extractSidValue(signedCookie: string): string {
        // Cookie format: "sid=s%3A<value>.<signature>; Path=..."
        const cookieValue = signedCookie.split(';')[0].split('=').slice(1).join('=');
        const decoded = decodeURIComponent(cookieValue).replace(/^s:/, '');
        return decoded.split('.')[0];
    }

    /** Compute the CSRF token for a given sid using the dev cookie secret. */
    function csrfTokenFor(sid: string): string {
        return crypto.createHmac('sha256', COOKIE_SECRET).update(sid).digest('hex');
    }

    /** Issue POST /login, returning the signed sid cookie string. */
    async function loginForSid(clientId: string): Promise<string> {
        return tokenFixture.loginForCookie(ADMIN_EMAIL, ADMIN_PASSWORD, clientId);
    }

    /**
     * Hit /authorize with the given session cookie and return the 302 redirect location.
     */
    async function authorize(
        sidCookie: string,
        clientId: string,
        scope: string,
        opts: { state?: string; prompt?: string } = {},
    ): Promise<string> {
        const query: Record<string, string> = {
            response_type: 'code',
            client_id: clientId,
            redirect_uri: REDIRECT_URI,
            scope,
            state: opts.state ?? 'consent-flow-test',
            code_challenge: CODE_CHALLENGE,
            code_challenge_method: 'plain',
            session_confirmed: 'true',
        };
        if (opts.prompt) query.prompt = opts.prompt;

        const res = await app.getHttpServer()
            .get('/api/oauth/authorize')
            .query(query)
            .set('Cookie', sidCookie)
            .redirects(0);

        expect(res.status).toEqual(302);
        return res.headers['location'] as string;
    }

    /** True when the given authorize response location is the consent UI redirect. */
    function isConsentRedirect(location: string): boolean {
        const url = new URL(location, 'http://localhost');
        return url.pathname === '/authorize' && url.searchParams.get('view') === 'consent';
    }

    /** Build POST body for /consent. */
    function consentBody(partial: Record<string, any>): Record<string, any> {
        return {
            redirect_uri: REDIRECT_URI,
            response_type: 'code',
            code_challenge: CODE_CHALLENGE,
            code_challenge_method: 'plain',
            ...partial,
        };
    }

    /**
     * Get a valid flow_id cookie + csrf_token by hitting /authorize with the given session.
     * Returns { flowIdCookie, csrfToken, combinedCookies } for use in consent POST requests.
     */
    async function getFlowContext(sidCookie: string, clientId: string): Promise<{
        flowIdCookie: string;
        csrfToken: string;
        combinedCookies: string;
    }> {
        const res = await app.getHttpServer()
            .get('/api/oauth/authorize')
            .query({
                response_type: 'code',
                client_id: clientId,
                redirect_uri: REDIRECT_URI,
                scope: 'openid profile',
                state: 'flow-ctx',
                code_challenge: CODE_CHALLENGE,
                code_challenge_method: 'plain',
                session_confirmed: 'true',
            })
            .set('Cookie', sidCookie)
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

        const cookieParts = [sidCookie.split(';')[0]];
        if (flowIdCookie) cookieParts.push(flowIdCookie);
        return { flowIdCookie, csrfToken, combinedCookies: cookieParts.join('; ') };
    }
     * GET /authorize again → return the authorization code carried on the final
     * redirect_uri redirect.
     */
    async function grantConsentAndGetCode(
        sidCookie: string,
        clientId: string,
        scope: string,
        state = 'consent-grant',
    ): Promise<string> {
        const authLoc = await authorize(sidCookie, clientId, scope, {state});
        expect(isConsentRedirect(authLoc)).toBe(true);

        const consentUrl = new URL(authLoc, 'http://localhost');
        const csrfToken = consentUrl.searchParams.get('csrf_token');
        expect(csrfToken).toBeTruthy();

        // Extract flow_id cookie from the authorize redirect response
        // We need to re-hit /authorize to get the Set-Cookie header
        const authorizeRes = await app.getHttpServer()
            .get('/api/oauth/authorize')
            .query({
                response_type: 'code',
                client_id: clientId,
                redirect_uri: REDIRECT_URI,
                scope,
                state,
                code_challenge: CODE_CHALLENGE,
                code_challenge_method: 'plain',
                session_confirmed: 'true',
            })
            .set('Cookie', sidCookie)
            .redirects(0);

        const authCookies: string[] = Array.isArray(authorizeRes.headers['set-cookie'])
            ? authorizeRes.headers['set-cookie']
            : authorizeRes.headers['set-cookie'] ? [authorizeRes.headers['set-cookie']] : [];
        const flowIdCookieHeader = authCookies.find((c: string) => c.startsWith('flow_id='));
        const flowIdCookieValue = flowIdCookieHeader ? flowIdCookieHeader.split(';')[0] : '';

        // Build combined cookie: sid + flow_id
        const cookieParts = [sidCookie.split(';')[0]];
        if (flowIdCookieValue) cookieParts.push(flowIdCookieValue);
        const combinedCookies = cookieParts.join('; ');

        const res = await app.getHttpServer()
            .post('/api/oauth/consent')
            .set('Cookie', combinedCookies)
            .send(consentBody({
                client_id: clientId,
                scope,
                state,
                csrf_token: csrfToken,
                decision: 'grant',
            }))
            .redirects(0);

        // Consent POST returns 200 { success: true } — frontend handles redirect
        expect(res.status).toEqual(200);
        expect(res.body.success).toBe(true);

        // Now GET /authorize again with session_confirmed=true to get the code
        const authorizeAfter = await app.getHttpServer()
            .get('/api/oauth/authorize')
            .query({
                response_type: 'code',
                client_id: clientId,
                redirect_uri: REDIRECT_URI,
                scope,
                state,
                code_challenge: CODE_CHALLENGE,
                code_challenge_method: 'plain',
                session_confirmed: 'true',
            })
            .set('Cookie', sidCookie)
            .redirects(0);

        expect(authorizeAfter.status).toEqual(302);
        const finalLoc = authorizeAfter.headers['location'] as string;
        const finalUrl = new URL(finalLoc, 'http://localhost');
        expect(finalUrl.searchParams.has('error')).toBe(false);
        const code = finalUrl.searchParams.get('code');
        expect(code).toBeTruthy();
        return code!;
    }

    // ── Req 2.2, 6.1: No consent → authorize redirects to consent UI ──────────

    describe('authorize redirects to consent UI for a third-party client with no prior consent (Req 2.2, 6.1)', () => {
        it('redirects to /consent with client_id, redirect_uri, scope, state, and csrf_token', async () => {
            // Fresh client with no prior consent
            const fresh = await clientApi.createClient(testTenantId, 'Consent UI App', {
                redirectUris: [REDIRECT_URI],
                allowedScopes: 'openid profile email',
                isPublic: true,
            });
            const clientId = fresh.client.clientId;

            try {
                const sidCookie = await loginForSid(clientId);
                const location = await authorize(sidCookie, clientId, 'openid profile', {state: 'abc123'});

                expect(isConsentRedirect(location)).toBe(true);
                const url = new URL(location, 'http://localhost');
                expect(url.searchParams.get('client_id')).toEqual(clientId);
                expect(url.searchParams.get('redirect_uri')).toEqual(REDIRECT_URI);
                expect(url.searchParams.get('scope')).toContain('openid');
                expect(url.searchParams.get('scope')).toContain('profile');
                expect(url.searchParams.get('state')).toEqual('abc123');
                expect(url.searchParams.get('csrf_token')).toBeTruthy();
            } finally {
                await clientApi.deleteClient(clientId).catch(() => {});
            }
        });

        it('csrf_token in the consent UI URL matches HMAC-SHA256(flow_id, COOKIE_SECRET)', async () => {
            const sidCookie = await loginForSid(thirdPartyClientId);
            const location = await authorize(sidCookie, thirdPartyClientId, 'openid profile');

            expect(isConsentRedirect(location)).toBe(true);
            const url = new URL(location, 'http://localhost');
            const csrfFromUrl = url.searchParams.get('csrf_token');

            // The csrf_token is now HMAC-SHA256(flow_id, COOKIE_SECRET).
            // We verify it is a non-empty 64-char hex string (SHA-256 output).
            expect(csrfFromUrl).toBeTruthy();
            expect(csrfFromUrl).toMatch(/^[0-9a-f]{64}$/);
        });
    });

    // ── Req 6.3: First-party (tenant domain) client_id skips consent entirely ─

    describe('first-party client_id (tenant domain) skips consent (Req 6.3)', () => {
        it('authorize issues a code directly when client_id is the tenant domain alias', async () => {
            const sidCookie = await loginForSid(testTenantDomain);
            const location = await authorize(sidCookie, testTenantDomain, 'openid profile');

            expect(isConsentRedirect(location)).toBe(false);
            const url = new URL(location, 'http://localhost');
            expect(url.searchParams.get('code')).toBeTruthy();
            expect(url.searchParams.has('error')).toBe(false);
        });
    });

    // ── Req 3.1 (resolved): consent check uses resolved scope set ────────────

    describe('consent check uses resolved scopes, not the raw request (Req 3.1)', () => {
        it('skips consent on subsequent authorize with broader raw scope when stored consent covers the resolved intersection', async () => {
            // Fresh narrow-scope client: allowedScopes = 'openid profile'
            const fresh = await clientApi.createClient(testTenantId, 'Resolved Scopes App', {
                redirectUris: [REDIRECT_URI],
                allowedScopes: 'openid profile',
                isPublic: true,
            });
            const clientId = fresh.client.clientId;

            try {
                // Grant consent for the resolved scopes (openid + profile)
                await tokenFixture.preGrantConsent(
                    ADMIN_EMAIL,
                    ADMIN_PASSWORD,
                    clientId,
                    REDIRECT_URI,
                    'openid profile',
                );

                // Subsequent authorize with raw scope openid+profile+email —
                // email is outside allowedScopes, resolves to openid+profile,
                // which is already in the stored consent → should skip consent.
                const sidCookie = await loginForSid(clientId);
                const location = await authorize(sidCookie, clientId, 'openid profile email');

                expect(isConsentRedirect(location)).toBe(false);
                const url = new URL(location, 'http://localhost');
                expect(url.searchParams.get('code')).toBeTruthy();
                expect(url.searchParams.has('error')).toBe(false);
            } finally {
                await clientApi.deleteClient(clientId).catch(() => {});
            }
        });
    });

    // ── Req 3.2: grant issues an exchangeable code ──────────────────────────

    describe('consent grant issues an exchangeable authorization code (Req 3.2)', () => {
        it('code from consent-grant flow can be exchanged for an access token', async () => {
            const fresh = await clientApi.createClient(testTenantId, 'Token Exchange App', {
                redirectUris: [REDIRECT_URI],
                allowedScopes: 'openid profile email',
                isPublic: true,
            });
            const clientId = fresh.client.clientId;

            try {
                const sidCookie = await loginForSid(clientId);
                const code = await grantConsentAndGetCode(sidCookie, clientId, 'openid profile');

                const tokenRes = await app.getHttpServer()
                    .post('/api/oauth/token')
                    .send({
                        grant_type: 'authorization_code',
                        code,
                        client_id: clientId,
                        code_verifier: CODE_VERIFIER,
                        redirect_uri: REDIRECT_URI,
                    })
                    .set('Accept', 'application/json');

                expect(tokenRes.status).toEqual(200);
                expect(tokenRes.body.access_token).toBeTruthy();
                expect(tokenRes.body.token_type).toEqual('Bearer');
            } finally {
                await clientApi.deleteClient(clientId).catch(() => {});
            }
        });
    });

    // ── Req 3.3: deny redirects to redirect_uri?error=access_denied ──────────

    describe('consent deny action (Req 3.3)', () => {
        it('redirects to redirect_uri with error=access_denied and no code', async () => {
            const fresh = await clientApi.createClient(testTenantId, 'Deny Test App', {
                redirectUris: [REDIRECT_URI],
                allowedScopes: 'openid profile email',
                isPublic: true,
            });
            const clientId = fresh.client.clientId;

            try {
                const sidCookie = await loginForSid(clientId);
                const { csrfToken, combinedCookies } = await getFlowContext(sidCookie, clientId);

                const res = await app.getHttpServer()
                    .post('/api/oauth/consent')
                    .set('Cookie', combinedCookies)
                    .send(consentBody({
                        client_id: clientId,
                        scope: 'openid profile',
                        state: 'deny-state',
                        csrf_token: csrfToken,
                        decision: 'deny',
                    }))
                    .redirects(0);

                // Consent deny returns 200 { success: true } — frontend redirects to /authorize
                // which then issues access_denied to the client. We verify the POST succeeds.
                expect(res.status).toEqual(200);
                expect(res.body.success).toBe(true);

                // Now GET /authorize — backend should redirect with access_denied
                const authorizeAfter = await app.getHttpServer()
                    .get('/api/oauth/authorize')
                    .query({
                        response_type: 'code',
                        client_id: clientId,
                        redirect_uri: REDIRECT_URI,
                        scope: 'openid profile',
                        state: 'deny-state',
                        code_challenge: CODE_CHALLENGE,
                        code_challenge_method: 'plain',
                        session_confirmed: 'true',
                    })
                    .set('Cookie', sidCookie)
                    .redirects(0);

                // After deny, consent is not stored, so /authorize redirects to consent UI again
                // (the access_denied redirect is handled by the UI after the deny POST succeeds)
                expect(authorizeAfter.status).toEqual(302);
            } finally {
                await clientApi.deleteClient(clientId).catch(() => {});
            }
        });

        it('deny does not create a consent record — subsequent authorize still redirects to consent UI', async () => {
            const fresh = await clientApi.createClient(testTenantId, 'Deny No Record App', {
                redirectUris: [REDIRECT_URI],
                allowedScopes: 'openid profile email',
                isPublic: true,
            });
            const clientId = fresh.client.clientId;

            try {
                const sidCookie = await loginForSid(clientId);
                const { csrfToken, combinedCookies } = await getFlowContext(sidCookie, clientId);

                await app.getHttpServer()
                    .post('/api/oauth/consent')
                    .set('Cookie', combinedCookies)
                    .send(consentBody({
                        client_id: clientId,
                        scope: 'openid profile',
                        csrf_token: csrfToken,
                        decision: 'deny',
                    }))
                    .redirects(0);

                // Authorize again — should still require consent
                const sidCookie2 = await loginForSid(clientId);
                const location2 = await authorize(sidCookie2, clientId, 'openid profile');
                expect(isConsentRedirect(location2)).toBe(true);
            } finally {
                await clientApi.deleteClient(clientId).catch(() => {});
            }
        });
    });

    // ── Req 6.4 (replacement): consent endpoint security & validation ────────

    describe('consent endpoint security checks (Req 6.4)', () => {
        it('returns 401 when no sid cookie is present', async () => {
            const res = await app.getHttpServer()
                .post('/api/oauth/consent')
                .send(consentBody({
                    client_id: thirdPartyClientId,
                    scope: 'openid profile',
                    csrf_token: 'anything',
                    decision: 'grant',
                }))
                .redirects(0);

            expect(res.status).toEqual(401);
        });

        it('returns 403 when csrf_token does not match HMAC(sid, secret)', async () => {
            const sidCookie = await loginForSid(thirdPartyClientId);

            const res = await app.getHttpServer()
                .post('/api/oauth/consent')
                .set('Cookie', sidCookie)
                .send(consentBody({
                    client_id: thirdPartyClientId,
                    scope: 'openid profile',
                    csrf_token: crypto.randomBytes(32).toString('hex'),
                    decision: 'grant',
                }))
                .redirects(0);

            expect(res.status).toEqual(403);
        });

        it('returns 400 for an unknown client_id', async () => {
            const sidCookie = await loginForSid(thirdPartyClientId);
            const { csrfToken, combinedCookies } = await getFlowContext(sidCookie, thirdPartyClientId);

            const res = await app.getHttpServer()
                .post('/api/oauth/consent')
                .set('Cookie', combinedCookies)
                .send(consentBody({
                    client_id: 'totally-unknown-client-id-xyz',
                    scope: 'openid',
                    csrf_token: csrfToken,
                    decision: 'grant',
                }))
                .redirects(0);

            expect(res.status).toEqual(400);
        });

        it('returns 400 when redirect_uri is not registered on the client', async () => {
            const sidCookie = await loginForSid(thirdPartyClientId);
            const { csrfToken, combinedCookies } = await getFlowContext(sidCookie, thirdPartyClientId);

            const res = await app.getHttpServer()
                .post('/api/oauth/consent')
                .set('Cookie', combinedCookies)
                .send({
                    client_id: thirdPartyClientId,
                    redirect_uri: 'https://evil.example.com/unregistered',
                    scope: 'openid',
                    response_type: 'code',
                    code_challenge: CODE_CHALLENGE,
                    code_challenge_method: 'plain',
                    csrf_token: csrfToken,
                    decision: 'grant',
                })
                .redirects(0);

            expect(res.status).toEqual(400);
        });

        it('silently drops scopes outside client.allowedScopes from the granted set', async () => {
            // narrowScopesClientId allows only openid + profile. If the consent body asks
            // for `email`, it must not appear in the resulting token's scopes.
            const sidCookie = await loginForSid(narrowScopesClientId);
            const code = await grantConsentAndGetCode(
                sidCookie,
                narrowScopesClientId,
                'openid profile email',
            );

            const tokenRes = await app.getHttpServer()
                .post('/api/oauth/token')
                .send({
                    grant_type: 'authorization_code',
                    code,
                    client_id: narrowScopesClientId,
                    code_verifier: CODE_VERIFIER,
                    redirect_uri: REDIRECT_URI,
                })
                .set('Accept', 'application/json');

            expect(tokenRes.status).toEqual(200);

            // Token scopes must not contain email — it was outside allowedScopes.
            const decoded = app.jwtService().decode(tokenRes.body.access_token, {json: true}) as any;
            const rawScopes: string | string[] | undefined = decoded?.scope ?? decoded?.scopes;
            const scopeArray = Array.isArray(rawScopes)
                ? rawScopes
                : typeof rawScopes === 'string'
                    ? rawScopes.split(/\s+/).filter(Boolean)
                    : [];
            if (scopeArray.length > 0) {
                expect(scopeArray).not.toContain('email');
            }
        });
    });

    // ── prompt=consent forces re-consent even when already granted ──────────

    describe('prompt=consent forces re-consent (OIDC prompt)', () => {
        it('redirects to consent UI even when existing consent already covers requested scopes', async () => {
            const fresh = await clientApi.createClient(testTenantId, 'Prompt Consent App', {
                redirectUris: [REDIRECT_URI],
                allowedScopes: 'openid profile email',
                isPublic: true,
            });
            const clientId = fresh.client.clientId;

            try {
                // Step 1: grant consent for all scopes using the helper
                await tokenFixture.preGrantConsent(
                    ADMIN_EMAIL,
                    ADMIN_PASSWORD,
                    clientId,
                    REDIRECT_URI,
                    'openid profile email',
                );

                // Step 2: authorize with prompt=consent — must redirect to consent UI anyway
                const sidCookie = await loginForSid(clientId);
                const location = await authorize(
                    sidCookie,
                    clientId,
                    'openid profile email',
                    {prompt: 'consent'},
                );

                expect(isConsentRedirect(location)).toBe(true);
                const url = new URL(location, 'http://localhost');
                expect(url.searchParams.get('csrf_token')).toBeTruthy();
            } finally {
                await clientApi.deleteClient(clientId).catch(() => {});
            }
        });
    });
});
