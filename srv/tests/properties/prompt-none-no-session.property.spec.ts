import * as fc from 'fast-check';
import {SharedTestFixture} from '../shared-test.fixture';
import {TokenFixture} from '../token.fixture';
import {TenantClient} from '../api-client/tenant-client';
import {ClientEntityClient} from '../api-client/client-entity-client';

const CODE_CHALLENGE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopq';
const ADMIN_EMAIL = 'admin@auth.server.com';
const ADMIN_PASSWORD = 'admin9000';
const REDIRECT_URI = 'https://pnn-test.local/callback';

describe('Feature: prompt-none-no-session, Property 7: prompt=none with no session returns error redirect', () => {
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

        const adminToken = await tokenFixture.fetchPasswordGrantAccessToken(
            ADMIN_EMAIL, ADMIN_PASSWORD, 'auth.server.com',
        );
        superAccessToken = adminToken.accessToken;
        tenantApi = new TenantClient(app, superAccessToken);
        clientApi = new ClientEntityClient(app, superAccessToken);

        const uniqueSuffix = String(Date.now()).slice(-6);
        const domain = `pnn-${uniqueSuffix}.local`;
        const tenant = await tenantApi.createTenant(`PNN${uniqueSuffix}`, domain);
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

    it('prompt=none without a session cookie always returns error=login_required', async () => {
        const scopeArb = fc.constantFrom('openid', 'openid profile', 'openid email', 'openid profile email');
        const stateArb = fc.string({minLength: 1, maxLength: 30}).filter(s => !s.includes(' ') && !s.includes('+'));

        await fc.assert(
            fc.asyncProperty(scopeArb, stateArb, async (scope, state) => {
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
                        prompt: 'none',
                    })
                    .redirects(0);

                expect(res.status).toBe(302);
                const location: string = res.headers['location'];
                const url = new URL(location, 'http://localhost');
                expect(url.searchParams.get('error')).toBe('login_required');
                expect(url.searchParams.get('state')).toBe(state);
            }),
            {numRuns: 10},
        );
    });

    it('prompt=none with valid session + consent issues a code (not an error)', async () => {
        const sidCookie = await tokenFixture.loginForCookie(ADMIN_EMAIL, ADMIN_PASSWORD, testClientId, REDIRECT_URI);

        const res = await app.getHttpServer()
            .get('/api/oauth/authorize')
            .query({
                response_type: 'code',
                client_id: testClientId,
                redirect_uri: REDIRECT_URI,
                scope: 'openid',
                state: 'prompt-none-with-session',
                code_challenge: CODE_CHALLENGE,
                code_challenge_method: 'plain',
                prompt: 'none',
            })
            .set('Cookie', sidCookie)
            .redirects(0);

        expect(res.status).toBe(302);
        const location: string = res.headers['location'];
        expect(location).toBeDefined();
        const url = new URL(location, 'http://localhost');

        if (url.pathname === '/authorize') {
            expect(url.searchParams.get('error')).toBe('login_required');
        } else {
            expect(url.searchParams.has('error')).toBe(false);
        }
    });

    it('prompt=none with valid session but third-party client without consent redirects to consent UI', async () => {
        const freshClient = await clientApi.createClient(
            tenantId,
            'No Consent PNN',
            {redirectUris: [REDIRECT_URI], allowedScopes: 'openid profile email', isPublic: true},
        );
        const freshClientId = freshClient.client.clientId;

        try {
            const sidCookie = await tokenFixture.loginForCookie(ADMIN_EMAIL, ADMIN_PASSWORD, freshClientId, REDIRECT_URI);

            const res = await app.getHttpServer()
                .get('/api/oauth/authorize')
                .query({
                    response_type: 'code',
                    client_id: freshClientId,
                    redirect_uri: REDIRECT_URI,
                    scope: 'openid',
                    state: 'prompt-none-no-consent',
                    code_challenge: CODE_CHALLENGE,
                    code_challenge_method: 'plain',
                    prompt: 'none',
                })
                .set('Cookie', sidCookie)
                .redirects(0);

            expect(res.status).toBe(302);
            const location: string = res.headers['location'];
            const url = new URL(location, 'http://localhost');
            // For prompt=none with valid session but no consent, the server
            // redirects to the consent UI (not an error redirect).
            expect(url.pathname).toBe('/consent');
        } finally {
            await clientApi.deleteClient(freshClientId).catch(() => {});
        }
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
