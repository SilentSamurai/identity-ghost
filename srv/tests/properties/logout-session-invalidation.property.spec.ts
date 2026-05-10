import * as fc from 'fast-check';
import {SharedTestFixture} from '../shared-test.fixture';
import {TokenFixture} from '../token.fixture';
import {TenantClient} from '../api-client/tenant-client';
import {ClientEntityClient} from '../api-client/client-entity-client';

const ADMIN_EMAIL = 'admin@auth.server.com';
const ADMIN_PASSWORD = 'admin9000';
const REDIRECT_URI = 'https://lsi-test.local/callback';
const CODE_CHALLENGE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopq';

describe('Feature: logout-session-invalidation, Property 6: Logout invalidates session server-side and clears cookie', () => {
    let app: SharedTestFixture;
    let tokenFixture: TokenFixture;
    let tenantApi: TenantClient;
    let clientApi: ClientEntityClient;
    let superAccessToken: string;
    let testClientId: string;

    beforeAll(async () => {
        app = new SharedTestFixture();
        tokenFixture = new TokenFixture(app);

        const adminToken = await tokenFixture.fetchPasswordGrantAccessToken(
            ADMIN_EMAIL, ADMIN_PASSWORD, 'auth.server.com',
        );
        superAccessToken = adminToken.accessToken;
        tenantApi = new TenantClient(app, superAccessToken);
        clientApi = new ClientEntityClient(app, superAccessToken);

        const uniqueSuffix = String(Date.now()).slice(-6);
        const domain = `lsi-${uniqueSuffix}.local`;
        const tenant = await tenantApi.createTenant(`LSI${uniqueSuffix}`, domain);
        testClientId = domain;

        const defaultClient = await findClientByAlias(app, superAccessToken, domain);
        if (defaultClient) {
            await clientApi.updateClient(defaultClient.clientId, {redirectUris: [REDIRECT_URI]});
        }
    });

    afterAll(async () => {
        await app.close();
    });

    function extractSidValue(signedCookie: string): string {
        const cookieValue = signedCookie.split(';')[0].split('=').slice(1).join('=');
        const decoded = decodeURIComponent(cookieValue).replace(/^s:/, '');
        return decoded.split('.')[0];
    }

    function isLoginRedirect(location: string | undefined): boolean {
        if (!location) return false;
        const url = new URL(location, 'http://localhost');
        return url.pathname === '/authorize';
    }

    it('POST /logout invalidates the session server-side and clears the cookie', async () => {
        const sidCookie = await tokenFixture.loginForCookie(ADMIN_EMAIL, ADMIN_PASSWORD, testClientId, REDIRECT_URI);
        const sid = extractSidValue(sidCookie);
        expect(sid).toBeTruthy();

        const logoutRes = await app.getHttpServer()
            .post('/api/oauth/logout')
            .send({sid})
            .set('Accept', 'application/json');

        expect(logoutRes.status).toBe(200);

        const setCookieHeader: string | string[] = logoutRes.headers['set-cookie'] ?? [];
        const cookies = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];
        const sidClearCookie = cookies.find((c: string) => c.startsWith('sid='));
        expect(sidClearCookie).toBeDefined();
        expect(sidClearCookie).toContain('Max-Age=0');

        const res = await app.getHttpServer()
            .get('/api/oauth/authorize')
            .query({
                response_type: 'code',
                client_id: testClientId,
                redirect_uri: REDIRECT_URI,
                scope: 'openid',
                state: 'logout-test',
                code_challenge: CODE_CHALLENGE,
                code_challenge_method: 'plain',
            })
            .set('Cookie', sidCookie)
            .redirects(0);

        expect(res.status).toBe(302);
        expect(isLoginRedirect(res.headers['location'] as string | undefined)).toBe(true);
    });

    it('logout is idempotent for any already-invalidated session', async () => {
        const sidCookie = await tokenFixture.loginForCookie(ADMIN_EMAIL, ADMIN_PASSWORD, testClientId, REDIRECT_URI);
        const sid = extractSidValue(sidCookie);

        await app.getHttpServer()
            .post('/api/oauth/logout')
            .send({sid})
            .set('Accept', 'application/json');

        const retryRes = await app.getHttpServer()
            .post('/api/oauth/logout')
            .send({sid})
            .set('Accept', 'application/json');

        expect(retryRes.status).toBe(200);
    });

    it('logout with unknown sid is handled gracefully', async () => {
        const unknownSidArb = fc.uuid();

        await fc.assert(
            fc.asyncProperty(unknownSidArb, async (unknownSid) => {
                const res = await app.getHttpServer()
                    .post('/api/oauth/logout')
                    .send({sid: unknownSid})
                    .set('Accept', 'application/json');

                expect(res.status).toBe(200);
            }),
            {numRuns: 10},
        );
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
