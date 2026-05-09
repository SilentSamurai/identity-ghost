import * as fc from 'fast-check';
import {SharedTestFixture} from '../shared-test.fixture';
import {TokenFixture} from '../token.fixture';
import {TenantClient} from '../api-client/tenant-client';
import {ClientEntityClient} from '../api-client/client-entity-client';

const ADMIN_EMAIL = 'admin@auth.server.com';
const ADMIN_PASSWORD = 'admin9000';
const REDIRECT_URI = 'https://csf-test.local/callback';
const CODE_CHALLENGE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopq';

describe('Feature: cookie-signature-forgery, Property 3: Cookie signature prevents forgery', () => {
    let app: SharedTestFixture;
    let tokenFixture: TokenFixture;
    let tenantApi: TenantClient;
    let clientApi: ClientEntityClient;
    let superAccessToken: string;
    let testClientId: string;

    beforeAll(async () => {
        app = new SharedTestFixture();
        tokenFixture = new TokenFixture(app);

        const adminToken = await tokenFixture.fetchAccessToken(
            ADMIN_EMAIL, ADMIN_PASSWORD, 'auth.server.com',
        );
        superAccessToken = adminToken.accessToken;
        tenantApi = new TenantClient(app, superAccessToken);
        clientApi = new ClientEntityClient(app, superAccessToken);

        const uniqueSuffix = String(Date.now()).slice(-6);
        const domain = `csf-${uniqueSuffix}.local`;
        await tenantApi.createTenant(`CSF${uniqueSuffix}`, domain);
        testClientId = domain;

        const defaultClient = await findClientByAlias(app, superAccessToken, domain);
        if (defaultClient) {
            await clientApi.updateClient(defaultClient.clientId, {redirectUris: [REDIRECT_URI]});
        }
    });

    afterAll(async () => {
        await app.close();
    });

    function isLoginRedirect(location: string | undefined): boolean {
        if (!location) return false;
        const url = new URL(location, 'http://localhost');
        return url.pathname === '/authorize';
    }

    it('any tampered sid cookie value is rejected and falls back to login UI', async () => {
        const sidValueArb = fc.string({minLength: 8, maxLength: 40});
        const signatureArb = fc.string({minLength: 8, maxLength: 40});

        await fc.assert(
            fc.asyncProperty(sidValueArb, signatureArb, async (sidValue, signature) => {
                const tamperedCookie = `sid=s%3A${sidValue}.${signature}`;

                const res = await app.getHttpServer()
                    .get('/api/oauth/authorize')
                    .query({
                        response_type: 'code',
                        client_id: testClientId,
                        redirect_uri: REDIRECT_URI,
                        scope: 'openid',
                        state: 'forgery-test',
                        code_challenge: CODE_CHALLENGE,
                        code_challenge_method: 'plain',
                    })
                    .set('Cookie', tamperedCookie)
                    .redirects(0);

                expect(res.status).toBe(302);
                expect(isLoginRedirect(res.headers['location'] as string | undefined)).toBe(true);
            }),
            {numRuns: 20},
        );
    });

    it('malformed cookie header values are safely handled', async () => {
        const malformedArb = fc.stringMatching(/^[^\n\r;=]{1,30}$/);

        await fc.assert(
            fc.asyncProperty(malformedArb, async (malformedValue) => {
                const badCookie = `sid=${malformedValue}`;

                const res = await app.getHttpServer()
                    .get('/api/oauth/authorize')
                    .query({
                        response_type: 'code',
                        client_id: testClientId,
                        redirect_uri: REDIRECT_URI,
                        scope: 'openid',
                        state: 'malformed-test',
                        code_challenge: CODE_CHALLENGE,
                        code_challenge_method: 'plain',
                    })
                    .set('Cookie', badCookie)
                    .redirects(0);

                expect(res.status).toBe(302);
                const location = res.headers['location'] as string | undefined;
                expect(isLoginRedirect(location)).toBe(true);
            }),
            {numRuns: 10},
        );
    });

    it('expired session cookie is rejected and falls back to login UI', async () => {
        const sidCookie = await tokenFixture.loginForCookie(ADMIN_EMAIL, ADMIN_PASSWORD, testClientId);

        const cookieValue = sidCookie.split(';')[0].split('=').slice(1).join('=');
        const decoded = decodeURIComponent(cookieValue).replace(/^s:/, '');
        const sid = decoded.split('.')[0];

        await app.getHttpServer()
            .post(`/api/test-utils/sessions/${sid}/expire`);

        const res = await app.getHttpServer()
            .get('/api/oauth/authorize')
            .query({
                response_type: 'code',
                client_id: testClientId,
                redirect_uri: REDIRECT_URI,
                scope: 'openid',
                state: 'expired-test',
                code_challenge: CODE_CHALLENGE,
                code_challenge_method: 'plain',
            })
            .set('Cookie', sidCookie)
            .redirects(0);

        expect(res.status).toBe(302);
        expect(isLoginRedirect(res.headers['location'] as string | undefined)).toBe(true);
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
