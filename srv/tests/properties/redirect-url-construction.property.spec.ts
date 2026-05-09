import * as fc from 'fast-check';
import {SharedTestFixture} from '../shared-test.fixture';
import {TokenFixture} from '../token.fixture';
import {TenantClient} from '../api-client/tenant-client';
import {ClientEntityClient} from '../api-client/client-entity-client';

const CODE_CHALLENGE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopq';
const ADMIN_EMAIL = 'admin@auth.server.com';
const ADMIN_PASSWORD = 'admin9000';
const REDIRECT_URI = 'https://ruc-test.local/callback';

describe('Feature: redirect-url-construction, Property 4: Redirect URL correctly includes authorization code and state', () => {
    let app: SharedTestFixture;
    let tokenFixture: TokenFixture;
    let tenantApi: TenantClient;
    let clientApi: ClientEntityClient;
    let superAccessToken: string;
    let testClientId: string;
    let tenantId: string;

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
        const domain = `ruc-${uniqueSuffix}.local`;
        const tenant = await tenantApi.createTenant(`RUC${uniqueSuffix}`, domain);
        tenantId = tenant.id;
        testClientId = domain;

        const defaultClient = await findClientByAlias(app, superAccessToken, domain);
        if (defaultClient) {
            await clientApi.updateClient(defaultClient.clientId, {redirectUris: [REDIRECT_URI]});
        }
    });

    afterAll(async () => {
        await app.close();
    });

    it('successful authorize always redirects with code and state in the URL', async () => {
        const stateArb = fc.string({minLength: 1, maxLength: 30}).filter(s => !s.includes(' ') && !s.includes('+'));
        const scopeArb = fc.constantFrom('openid', 'openid profile', 'openid email');

        await fc.assert(
            fc.asyncProperty(stateArb, scopeArb, async (state, scope) => {
                const sidCookie = await tokenFixture.loginForCookie(ADMIN_EMAIL, ADMIN_PASSWORD, testClientId);

                const res = await app.getHttpServer()
                    .get('/api/oauth/authorize')
                    .query({
                        response_type: 'code',
                        client_id: testClientId,
                        redirect_uri: REDIRECT_URI,
                        scope,
                        state,
                        code_challenge: CODE_CHALLENGE,
                        code_challenge_method: 'plain',
                        session_confirmed: 'true',
                    })
                    .set('Cookie', sidCookie)
                    .redirects(0);

                expect(res.status).toBe(302);
                const location: string = res.headers['location'];
                expect(location).toBeDefined();
                expect(location).toContain('code=');

                const url = new URL(location, 'http://localhost');
                expect(url.searchParams.has('error')).toBe(false);
                expect(url.searchParams.get('state')).toBe(state);
                const code = url.searchParams.get('code');
                expect(code).toBeTruthy();
                expect(code!.length).toBeGreaterThan(0);
            }),
            {numRuns: 15},
        );
    });

    it('redirect URL does not leak sensitive parameters', async () => {
        const sidCookie = await tokenFixture.loginForCookie(ADMIN_EMAIL, ADMIN_PASSWORD, testClientId);

        const res = await app.getHttpServer()
            .get('/api/oauth/authorize')
            .query({
                response_type: 'code',
                client_id: testClientId,
                redirect_uri: REDIRECT_URI,
                scope: 'openid',
                state: 'no-leak-test',
                code_challenge: CODE_CHALLENGE,
                code_challenge_method: 'plain',
                session_confirmed: 'true',
            })
            .set('Cookie', sidCookie)
            .redirects(0);

        expect(res.status).toBe(302);
        const location: string = res.headers['location'];
        const url = new URL(location, 'http://localhost');

        expect(url.searchParams.has('code')).toBe(true);
        expect(url.searchParams.has('state')).toBe(true);
        expect(url.searchParams.has('code_challenge')).toBe(false);
        expect(url.searchParams.has('session_confirmed')).toBe(false);
        expect(url.searchParams.has('client_secret')).toBe(false);
        expect(url.searchParams.has('password')).toBe(false);
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
