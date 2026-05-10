import * as crypto from 'crypto';
import {SharedTestFixture} from '../shared-test.fixture';
import {TokenFixture} from '../token.fixture';
import {ClientEntityClient} from '../api-client/client-entity-client';
import {TenantClient} from '../api-client/tenant-client';
import {AdminTenantClient} from '../api-client/admin-tenant-client';

const CODE_CHALLENGE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopq';
const CODE_VERIFIER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopq';
const REDIRECT_URI = 'https://session-auth-test.local/callback';
const COOKIE_SECRET = 'dev-cookie-secret-do-not-use-in-prod';
const ADMIN_EMAIL = 'admin@auth.server.com';
const ADMIN_PASSWORD = 'admin9000';

describe('Session Auth Flow', () => {
    let app: SharedTestFixture;
    let tokenFixture: TokenFixture;
    let clientApi: ClientEntityClient;
    let tenantApi: TenantClient;
    let adminTenantApi: AdminTenantClient;
    let testTenantId: string;
    let testTenantDomain: string;
    let thirdPartyClientId: string;
    let superAccessToken: string;

    beforeAll(async () => {
        app = new SharedTestFixture();
        tokenFixture = new TokenFixture(app);

        const adminToken = await tokenFixture.fetchAccessToken(
            ADMIN_EMAIL, ADMIN_PASSWORD, 'auth.server.com',
        );
        superAccessToken = adminToken.accessToken;

        clientApi = new ClientEntityClient(app, superAccessToken);
        tenantApi = new TenantClient(app, superAccessToken);
        adminTenantApi = new AdminTenantClient(app, superAccessToken);

        const uniqueSuffix = String(Date.now()).slice(-8);
        testTenantDomain = `saf-test-${uniqueSuffix}.local`;
        const tenant = await tenantApi.createTenant(
            `SAF${uniqueSuffix}`, testTenantDomain,
        );
        testTenantId = tenant.id;

        const thirdParty = await clientApi.createClient(testTenantId, 'Third Party', {
            redirectUris: [REDIRECT_URI],
            allowedScopes: 'openid profile email',
            isPublic: true,
        });
        thirdPartyClientId = thirdParty.client.clientId;

        const testDefault = await findClientByAlias(app, superAccessToken, testTenantDomain);
        if (testDefault) {
            await clientApi.updateClient(testDefault.clientId, {redirectUris: [REDIRECT_URI]});
        }
    });

    afterAll(async () => {
        await app.close();
    });

    // ── Helpers ──────────────────────────────────────────────────────

    async function loginForCookie(clientId: string): Promise<string> {
        return tokenFixture.loginForCookie(ADMIN_EMAIL, ADMIN_PASSWORD, clientId);
    }

    function extractSidValue(signedCookie: string): string {
        const cookieValue = signedCookie.split(';')[0].split('=').slice(1).join('=');
        const decoded = decodeURIComponent(cookieValue).replace(/^s:/, '');
        return decoded.split('.')[0];
    }

    function csrfTokenFor(sid: string): string {
        return crypto.createHmac('sha256', COOKIE_SECRET).update(sid).digest('hex');
    }

    async function authorize(
        sidCookie: string | undefined,
        clientId: string,
        opts: {
            scope?: string;
            prompt?: string;
            session_confirmed?: string;
            state?: string;
        } = {},
    ): Promise<{ status: number; location?: string; body?: any }> {
        const query: Record<string, string> = {
            response_type: 'code',
            client_id: clientId,
            redirect_uri: REDIRECT_URI,
            scope: opts.scope ?? 'openid profile email',
            state: opts.state ?? 'test-state',
            code_challenge: CODE_CHALLENGE,
            code_challenge_method: 'plain',
        };
        if (opts.session_confirmed !== undefined) query.session_confirmed = opts.session_confirmed;
        if (opts.prompt) query.prompt = opts.prompt;

        const req = app.getHttpServer()
            .get('/api/oauth/authorize')
            .query(query)
            .redirects(0);

        if (sidCookie) {
            req.set('Cookie', sidCookie);
        }

        const res = await req;
        return {status: res.status, location: res.headers['location'] as string | undefined, body: res.body};
    }

    function isLoginRedirect(location: string | undefined): boolean {
        if (!location) return false;
        const url = new URL(location, 'http://localhost');
        return url.pathname === '/authorize' && url.searchParams.get('view') === 'login';
    }

    function isConsentRedirect(location: string | undefined): boolean {
        if (!location) return false;
        const url = new URL(location, 'http://localhost');
        return url.pathname === '/authorize' && url.searchParams.get('view') === 'consent';
    }

    function isSessionConfirmRedirect(location: string | undefined): boolean {
        if (!location) return false;
        const url = new URL(location, 'http://localhost');
        return url.pathname === '/authorize' && url.searchParams.get('view') === 'session-confirm';
    }

    function isCodeRedirect(location: string | undefined): boolean {
        if (!location) return false;
        const url = new URL(location, 'http://localhost');
        return url.searchParams.has('code') && !url.searchParams.has('error');
    }

    function getRedirectUrl(location: string | undefined): URL | null {
        if (!location) return null;
        return new URL(location, 'http://localhost');
    }

    // ── 17.2: Login cookie attributes ────────────────────────────────

    describe('17.2 — Login cookie attributes', () => {
        it('sets signed sid cookie with correct attributes', async () => {
            // Get flow_id cookie and csrf_token from /authorize first
            const preAuth = await app.getHttpServer()
                .get('/api/oauth/authorize')
                .query({
                    response_type: 'code',
                    client_id: 'auth.server.com',
                    redirect_uri: 'https://session-auth-test.local/callback',
                    scope: 'openid profile email',
                    state: 'test-state',
                    code_challenge: CODE_CHALLENGE,
                    code_challenge_method: 'plain',
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

            const loginReq = app.getHttpServer()
                .post('/api/oauth/login')
                .send({
                    email: ADMIN_EMAIL,
                    password: ADMIN_PASSWORD,
                    client_id: 'auth.server.com',
                    csrf_token: csrfToken,
                })
                .set('Accept', 'application/json');

            if (flowIdCookieValue) {
                loginReq.set('Cookie', flowIdCookieValue);
            }

            const res = await loginReq;

            expect(res.status).toEqual(201);

            const raw = res.headers['set-cookie'] as string | string[];
            const list = Array.isArray(raw) ? raw : [raw];
            const sidCookie = list.find((c: string) => c.startsWith('sid='));
            expect(sidCookie).toBeDefined();

            const parts = sidCookie!.split(';').map((p: string) => p.trim());
            const nameValue = parts[0];
            expect(nameValue.startsWith('sid=s%3A')).toBe(true);

            const attrs: Record<string, string> = {};
            for (let i = 1; i < parts.length; i++) {
                const eqIdx = parts[i].indexOf('=');
                if (eqIdx === -1) {
                    attrs[parts[i]] = '';
                } else {
                    attrs[parts[i].substring(0, eqIdx)] = parts[i].substring(eqIdx + 1);
                }
            }

            expect(attrs).toHaveProperty('HttpOnly');
            expect(attrs['Path']).toEqual('/api/oauth');
            expect(attrs['SameSite']?.toLowerCase()).toEqual('lax');

            const maxAge = parseInt(attrs['Max-Age'] ?? '', 10);
            expect(maxAge).toBeGreaterThan(1295000);
            expect(maxAge).toBeLessThanOrEqual(1296000);

            expect(attrs).not.toHaveProperty('Secure');
        });

        it('returns 400 with invalid_grant on wrong password', async () => {
            const res = await app.getHttpServer()
                .post('/api/oauth/login')
                .send({
                    email: ADMIN_EMAIL,
                    password: 'wrong-password',
                    client_id: 'auth.server.com',
                })
                .set('Accept', 'application/json');

            expect(res.status).toEqual(400);
            expect(res.body.error).toEqual('invalid_grant');
            expect(res.body.error_description).toBeDefined();
        });
    });

    // ── 17.3: Authorize with valid session ───────────────────────────

    describe('17.3 — Authorize with valid session', () => {
        it('valid cookie + first-party + session_confirmed → redirect with code', async () => {
            const sidCookie = await loginForCookie(testTenantDomain);
            const result = await authorize(sidCookie, testTenantDomain, {session_confirmed: 'true'});

            expect(result.status).toEqual(302);
            expect(isCodeRedirect(result.location)).toBe(true);
        });

        it('valid cookie + first-party + no session_confirmed + skipSessionConfirm=false → session-confirm UI', async () => {
            const sidCookie = await loginForCookie(testTenantDomain);
            const result = await authorize(sidCookie, testTenantDomain, {});

            expect(result.status).toEqual(302);
            expect(isSessionConfirmRedirect(result.location)).toBe(true);
        });

        it('valid cookie + first-party + skipSessionConfirm=true + no session_confirmed → redirect with code', async () => {
            const skipTenantDomain = `saf-skip-${String(Date.now()).slice(-6)}.local`;
            const skipTenant = await tenantApi.createTenant(
                `SAFSkip`, skipTenantDomain,
            );

            await app.getHttpServer()
                .post(`/api/test-utils/tenants/${skipTenant.id}/skip-session-confirm`)
                .send({skip: true});

            const defaultClient = await findClientByAlias(app, superAccessToken, skipTenantDomain);
            if (defaultClient) {
                await clientApi.updateClient(defaultClient.clientId, {redirectUris: [REDIRECT_URI]});
            }

            const sidCookie = await loginForCookie(skipTenantDomain);
            const result = await authorize(sidCookie, skipTenantDomain, {});

            expect(result.status).toEqual(302);
            expect(isCodeRedirect(result.location)).toBe(true);
        });

        it('valid cookie + third-party + no consent → consent UI', async () => {
            const sidCookie = await loginForCookie(thirdPartyClientId);
            const result = await authorize(sidCookie, thirdPartyClientId, {session_confirmed: 'true'});

            expect(result.status).toEqual(302);
            expect(isConsentRedirect(result.location)).toBe(true);
        });
    });

    // ── 17.4: Authorize without valid session ────────────────────────

    describe('17.4 — Authorize without valid session', () => {
        it('no cookie → login UI', async () => {
            const result = await authorize(undefined, testTenantDomain, {});

            expect(result.status).toEqual(302);
            expect(isLoginRedirect(result.location)).toBe(true);
        });

        it('tampered cookie → login UI', async () => {
            const tamperedCookie = 'sid=s%3Afake-sid-value.signature';
            const result = await authorize(tamperedCookie, testTenantDomain, {});

            expect(result.status).toEqual(302);
            expect(isLoginRedirect(result.location)).toBe(true);
        });

        it('expired session → login UI', async () => {
            const sidCookie = await loginForCookie(testTenantDomain);
            const sid = extractSidValue(sidCookie);

            await app.getHttpServer()
                .post(`/api/test-utils/sessions/${sid}/expire`);

            const result = await authorize(sidCookie, testTenantDomain, {});

            expect(result.status).toEqual(302);
            expect(isLoginRedirect(result.location)).toBe(true);
        });

        it('cookie-based logout via POST /logout', async () => {
            const sidCookie = await loginForCookie(testTenantDomain);
            const sid = extractSidValue(sidCookie);

            const logoutRes = await app.getHttpServer()
                .post('/api/oauth/logout')
                .send({sid})
                .set('Accept', 'application/json');

            expect(logoutRes.status).toEqual(200);

            const authorizeAfter = await authorize(sidCookie, testTenantDomain, {});
            expect(authorizeAfter.status).toEqual(302);
            expect(isLoginRedirect(authorizeAfter.location)).toBe(true);
        });
    });

    // ── 17.5: Authorize prompt parameter ─────────────────────────────

    describe('17.5 — Authorize prompt parameter', () => {
        it('prompt=none + no session → error=login_required', async () => {
            const result = await authorize(undefined, testTenantDomain, {prompt: 'none'});

            expect(result.status).toEqual(302);
            const url = getRedirectUrl(result.location);
            expect(url?.searchParams.get('error')).toEqual('login_required');
        });

        it('prompt=consent + valid session + third-party → consent UI', async () => {
            const sidCookie = await loginForCookie(thirdPartyClientId);
            const result = await authorize(sidCookie, thirdPartyClientId, {prompt: 'consent', session_confirmed: 'true'});

            expect(result.status).toEqual(302);
            expect(isConsentRedirect(result.location)).toBe(true);
        });

        it('prompt=consent + valid session + first-party + no session_confirmed → session-confirm UI', async () => {
            const sidCookie = await loginForCookie(testTenantDomain);
            const result = await authorize(sidCookie, testTenantDomain, {prompt: 'consent'});

            expect(result.status).toEqual(302);
            expect(isSessionConfirmRedirect(result.location)).toBe(true);
        });

        it('prompt=consent + valid session + first-party + session_confirmed → consent UI', async () => {
            const sidCookie = await loginForCookie(testTenantDomain);
            const result = await authorize(sidCookie, testTenantDomain, {prompt: 'consent', session_confirmed: 'true'});

            expect(result.status).toEqual(302);
            expect(isConsentRedirect(result.location)).toBe(true);
        });
    });

    // ── 17.6: session_confirmed security ─────────────────────────────

    describe('17.6 — session_confirmed security', () => {
        it('session_confirmed=true does not bypass consent for third-party with no prior consent', async () => {
            const freshClient = await clientApi.createClient(testTenantId, 'No Consent App', {
                redirectUris: [REDIRECT_URI],
                allowedScopes: 'openid profile email',
                isPublic: true,
            });
            const freshClientId = freshClient.client.clientId;

            try {
                const sidCookie = await loginForCookie(freshClientId);
                const result = await authorize(sidCookie, freshClientId, {session_confirmed: 'true'});

                expect(result.status).toEqual(302);
                expect(isConsentRedirect(result.location)).toBe(true);
            } finally {
                await clientApi.deleteClient(freshClientId).catch(() => {});
            }
        });
    });
});

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
