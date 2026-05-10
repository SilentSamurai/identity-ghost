import * as fc from 'fast-check';
import {SharedTestFixture} from '../shared-test.fixture';
import {TokenFixture} from '../token.fixture';
import {ClientEntityClient} from '../api-client/client-entity-client';

/**
 * PKCE Optional Flow — Full authorize → token exchange without PKCE
 *
 * _For any_ authorization request where `client.requirePkce=false` AND no
 * `code_challenge` is provided, the `/api/oauth/authorize` endpoint SHALL
 * redirect to frontend without PKCE params, AND the full flow SHALL succeed
 * without `code_verifier` at token exchange.
 *
 * **Validates: Requirements 2.1, 2.2**
 *
 * Verifies that clients with requirePkce=false can complete the OAuth flow without PKCE.
 */
describe('PKCE Optional Flow: authorize → token exchange without code_challenge', () => {
    let fixture: SharedTestFixture;
    let tokenFixture: TokenFixture;
    let testClientId: string;

    const TENANT_DOMAIN = 'pkce-bug-condition-test.local';
    const ADMIN_EMAIL = `admin@${TENANT_DOMAIN}`;
    const ADMIN_PASSWORD = 'admin9000';
    const REDIRECT_URI = 'https://pkce-bug-condition.example.com/callback';

    beforeAll(async () => {
        fixture = new SharedTestFixture();
        tokenFixture = new TokenFixture(fixture);

        // Get a tenant-scoped token for the test tenant to retrieve its ID
        const {jwt} = await tokenFixture.fetchPasswordGrantAccessToken(
            ADMIN_EMAIL,
            ADMIN_PASSWORD,
            TENANT_DOMAIN,
        );
        const tenantId = jwt.tenant.id;

        // Get super-admin token to create a client
        const {accessToken: superToken} = await tokenFixture.fetchPasswordGrantAccessToken(
            'admin@auth.server.com',
            'admin9000',
            'auth.server.com',
        );

        const clientApi = new ClientEntityClient(fixture, superToken);

        // Create a client with requirePkce=false and isPublic=true
        const created = await clientApi.createClient(tenantId, 'PKCE Bug Condition Client', {
            redirectUris: [REDIRECT_URI],
            allowedScopes: 'openid profile email',
            isPublic: true,
            requirePkce: false,
        });
        testClientId = created.client.clientId;

        // Pre-grant consent so /authorize issues codes directly
        // (third-party clients require consent)
        await tokenFixture.preGrantConsent(ADMIN_EMAIL, ADMIN_PASSWORD, testClientId, REDIRECT_URI);
    });

    afterAll(async () => {
        await fixture.close();
    });

    // Generators
    const stateArb = fc.stringMatching(/^[A-Za-z0-9_\-]{8,64}$/);
    const scopeArb = fc.subarray(['openid', 'profile', 'email'], {minLength: 1})
        .map(scopes => scopes.join(' '));

    it('optional PKCE: full authorize → token exchange succeeds without PKCE', async () => {
        await fc.assert(
            fc.asyncProperty(stateArb, scopeArb, async (state, scope) => {
                // Step 1: Login to get a sid cookie
                const sidCookie = await tokenFixture.loginForCookie(ADMIN_EMAIL, ADMIN_PASSWORD, testClientId, REDIRECT_URI);

                // Step 2: GET /api/oauth/authorize WITHOUT code_challenge
                const authorizeRes = await fixture.getHttpServer()
                    .get('/api/oauth/authorize')
                    .query({
                        response_type: 'code',
                        client_id: testClientId,
                        redirect_uri: REDIRECT_URI,
                        scope,
                        state,
                        session_confirmed: 'true',
                    })
                    .set('Cookie', sidCookie)
                    .redirects(0);

                // Expect 302 redirect to the client's redirect URI with a code
                expect(authorizeRes.status).toEqual(302);
                const location = authorizeRes.headers['location'] as string;
                expect(location).toBeDefined();

                const redirectUrl = new URL(location, 'http://localhost');
                expect(redirectUrl.searchParams.has('error')).toBe(false);
                const code = redirectUrl.searchParams.get('code');
                expect(code).toBeDefined();

                // Step 3: POST /api/oauth/token WITHOUT code_verifier
                const tokenRes = await fixture.getHttpServer()
                    .post('/api/oauth/token')
                    .send({
                        grant_type: 'authorization_code',
                        code,
                        client_id: testClientId,
                        redirect_uri: REDIRECT_URI,
                    })
                    .set('Accept', 'application/json');

                // Token exchange should succeed with access_token
                expect(tokenRes.status).toEqual(200);
                expect(tokenRes.body.access_token).toBeDefined();
                expect(tokenRes.body.token_type).toEqual('Bearer');
            }),
            {numRuns: 10},
        );
    }, 180_000);
});
