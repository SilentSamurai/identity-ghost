import * as fc from 'fast-check';
import {SharedTestFixture} from '../shared-test.fixture';
import {TokenFixture} from '../token.fixture';
import {TenantClient} from '../api-client/tenant-client';
import {ClientEntityClient} from '../api-client/client-entity-client';
import {AdminTenantClient} from '../api-client/admin-tenant-client';

const CODE_CHALLENGE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopq';
const ADMIN_EMAIL = 'admin@auth.server.com';
const ADMIN_PASSWORD = 'admin9000';

describe('Feature: session-consent-direct, Property 2: Valid sessions with consent and confirmation enable direct redirect', () => {
    let app: SharedTestFixture;
    let tokenFixture: TokenFixture;
    let tenantApi: TenantClient;
    let clientApi: ClientEntityClient;
    let adminTenantApi: AdminTenantClient;
    let superAccessToken: string;

    const REDIRECT_URI = 'https://vsc-direct-test.local/callback';

    beforeAll(async () => {
        app = new SharedTestFixture();
        tokenFixture = new TokenFixture(app);

        const adminToken = await tokenFixture.fetchPasswordGrantAccessToken(
            ADMIN_EMAIL, ADMIN_PASSWORD, 'auth.server.com',
        );
        superAccessToken = adminToken.accessToken;
        tenantApi = new TenantClient(app, superAccessToken);
        clientApi = new ClientEntityClient(app, superAccessToken);
        adminTenantApi = new AdminTenantClient(app, superAccessToken);
    });

    afterAll(async () => {
        await app.close();
    });

    async function setupTenantAndClient(suffix: string): Promise<{ clientId: string; domain: string }> {
        const domain = `vsc-direct-${suffix}.local`;
        const tenant = await tenantApi.createTenant(`VSC${suffix}`, domain);
        const defaultClient = await findClientByAlias(app, superAccessToken, domain);
        if (defaultClient) {
            await clientApi.updateClient(defaultClient.clientId, {redirectUris: [REDIRECT_URI]});
        }
        return {clientId: domain, domain};
    }

    it('with valid session + consent + session_confirmed=true, authorize issues a code for any scope', async () => {
        const uniqueSuffix = String(Date.now()).slice(-6);
        const {clientId} = await setupTenantAndClient(uniqueSuffix);

        const scopeArb = fc.constantFrom(
            'openid',
            'openid profile',
            'openid email',
            'openid profile email',
        );

        const stateArb = fc.string({minLength: 1, maxLength: 20});

        await fc.assert(
            fc.asyncProperty(scopeArb, stateArb, async (scope, state) => {
                const sidCookie = await tokenFixture.loginForCookie(ADMIN_EMAIL, ADMIN_PASSWORD, clientId, REDIRECT_URI);

                const res = await app.getHttpServer()
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

                expect(res.status).toBe(302);
                const location: string = res.headers['location'];
                const url = new URL(location, 'http://localhost');
                expect(url.searchParams.has('error')).toBe(false);
                expect(url.searchParams.get('code')).toBeTruthy();
                expect(url.searchParams.get('state')).toBe(state);
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
