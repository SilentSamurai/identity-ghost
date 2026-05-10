import * as fc from 'fast-check';
import {SharedTestFixture} from '../shared-test.fixture';
import {TokenFixture} from '../token.fixture';
import {TenantClient} from '../api-client/tenant-client';
import {ClientEntityClient} from '../api-client/client-entity-client';
import {AdminTenantClient} from '../api-client/admin-tenant-client';

const CODE_CHALLENGE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopq';
const CODE_VERIFIER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopq';
const ADMIN_EMAIL = 'admin@auth.server.com';
const ADMIN_PASSWORD = 'admin9000';

describe('Feature: session-confirmed-no-bypass-consent, Property 2b: session_confirmed=true does not bypass consent', () => {
    let app: SharedTestFixture;
    let tokenFixture: TokenFixture;
    let tenantApi: TenantClient;
    let clientApi: ClientEntityClient;
    let adminTenantApi: AdminTenantClient;
    let superAccessToken: string;

    const REDIRECT_URI = 'https://snbc-no-consent-test.local/callback';

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

    it('session_confirmed=true with no prior consent redirects to consent UI for any third-party client', async () => {
        const uniqueSuffix = String(Date.now()).slice(-6);
        const tenantDomain = `snbc-${uniqueSuffix}.local`;
        const tenant = await tenantApi.createTenant(`SNBC${uniqueSuffix}`, tenantDomain);

        const scopeArb = fc.constantFrom(
            'openid',
            'openid profile',
            'openid email',
            'openid profile email',
        );

        await fc.assert(
            fc.asyncProperty(scopeArb, async (scope) => {
                const thirdParty = await clientApi.createClient(tenant.id, 'No Consent App', {
                    redirectUris: [REDIRECT_URI],
                    allowedScopes: scope,
                    isPublic: true,
                });
                const thirdPartyClientId = thirdParty.client.clientId;

                try {
                    const sidCookie = await tokenFixture.loginForCookie(ADMIN_EMAIL, ADMIN_PASSWORD, thirdPartyClientId, REDIRECT_URI);

                    const res = await app.getHttpServer()
                        .get('/api/oauth/authorize')
                        .query({
                            response_type: 'code',
                            client_id: thirdPartyClientId,
                            redirect_uri: REDIRECT_URI,
                            scope,
                            state: 'no-bypass-test',
                            code_challenge: CODE_CHALLENGE,
                            code_challenge_method: 'plain',
                            session_confirmed: 'true',
                        })
                        .set('Cookie', sidCookie)
                        .redirects(0);

                    expect(res.status).toBe(302);
                    const location: string = res.headers['location'];
                    const url = new URL(location, 'http://localhost');
                    const isConsentRedirect = url.pathname === '/consent';
                    const isCodeRedirect = url.searchParams.has('code') && !url.searchParams.has('error');

                    expect(isConsentRedirect).toBe(true);
                    expect(isCodeRedirect).toBe(false);
                } finally {
                    await clientApi.deleteClient(thirdPartyClientId).catch(() => {});
                }
            }),
            {numRuns: 8},
        );
    });
});
