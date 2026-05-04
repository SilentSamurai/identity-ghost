import * as fc from 'fast-check';
import {SharedTestFixture} from '../shared-test.fixture';
import {TokenFixture} from '../token.fixture';
import {ClientEntityClient} from '../api-client/client-entity-client';
import {TenantClient} from '../api-client/tenant-client';

/**
 * PKCE Optional Flow — Full authorize → login → token exchange without PKCE
 *
 * _For any_ authorization request where `client.requirePkce=false` AND no
 * `code_challenge` is provided, the `/api/oauth/authorize` endpoint SHALL
 * redirect to frontend without PKCE params, AND the `/api/oauth/login`
 * endpoint SHALL succeed without `code_challenge`, AND token exchange SHALL
 * succeed without `code_verifier`.
 *
 * **Validates: Requirements 2.1, 2.2**
 *
 * Verifies that clients with requirePkce=false can complete the OAuth flow without PKCE.
 */
describe('PKCE Optional Flow: authorize → login → token exchange without code_challenge', () => {
    let fixture: SharedTestFixture;
    let testClientId: string;

    const TENANT_DOMAIN = 'pkce-bug-condition-test.local';
    const ADMIN_EMAIL = `admin@${TENANT_DOMAIN}`;
    const ADMIN_PASSWORD = 'admin9000';
    const REDIRECT_URI = 'https://pkce-bug-condition.example.com/callback';

    beforeAll(async () => {
        fixture = new SharedTestFixture();
        const tokenFixture = new TokenFixture(fixture);

        // Get a tenant-scoped token for the test tenant to retrieve its ID
        const {accessToken: tenantToken, jwt} = await tokenFixture.fetchAccessToken(
            ADMIN_EMAIL,
            ADMIN_PASSWORD,
            TENANT_DOMAIN,
        );
        const tenantId = jwt.tenant.id;

        // Get super-admin token to create a client
        const {accessToken: superToken} = await tokenFixture.fetchAccessToken(
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

        // Pre-grant consent for the test client so login returns auth codes
        // instead of requires_consent (third-party clients require consent)
        await fixture.getHttpServer()
            .post('/api/oauth/consent')
            .send({
                email: ADMIN_EMAIL,
                password: ADMIN_PASSWORD,
                client_id: testClientId,
                approved_scopes: ['openid', 'profile', 'email'],
                consent_action: 'approve',
                scope: 'openid profile email',
                redirect_uri: REDIRECT_URI,
            })
            .set('Accept', 'application/json');
    });

    afterAll(async () => {
        await fixture.close();
    });

    // Generators
    const stateArb = fc.stringMatching(/^[A-Za-z0-9_\-]{8,64}$/);
    const scopeArb = fc.subarray(['openid', 'profile', 'email'], {minLength: 1})
        .map(scopes => scopes.join(' '));

    it('optional PKCE: full authorize → login → token exchange succeeds without PKCE', async () => {
        await fc.assert(
            fc.asyncProperty(stateArb, scopeArb, async (state, scope) => {
                // Step 1: GET /api/oauth/authorize without code_challenge
                const authorizeRes = await fixture.getHttpServer()
                    .get('/api/oauth/authorize')
                    .query({
                        response_type: 'code',
                        client_id: testClientId,
                        redirect_uri: REDIRECT_URI,
                        scope,
                        state,
                    })
                    .redirects(0);

                // Expect 302 redirect to frontend /authorize
                expect(authorizeRes.status).toEqual(302);
                const location = authorizeRes.headers['location'] as string;
                expect(location).toBeDefined();

                const redirectUrl = new URL(location, 'http://localhost');

                // The redirect should NOT contain code_challenge params
                expect(redirectUrl.searchParams.has('code_challenge')).toBe(false);
                expect(redirectUrl.searchParams.has('code_challenge_method')).toBe(false);

                // Step 2: POST /api/oauth/login without code_challenge
                const loginRes = await fixture.getHttpServer()
                    .post('/api/oauth/login')
                    .send({
                        email: ADMIN_EMAIL,
                        password: ADMIN_PASSWORD,
                        client_id: testClientId,
                        redirect_uri: REDIRECT_URI,
                        scope,
                    })
                    .set('Accept', 'application/json');

                // Login should succeed with an authentication_code
                expect(loginRes.status).toBeGreaterThanOrEqual(200);
                expect(loginRes.status).toBeLessThan(300);
                expect(loginRes.body.authentication_code).toBeDefined();

                const authCode = loginRes.body.authentication_code;

                // Step 3: POST /api/oauth/token without code_verifier
                const tokenRes = await fixture.getHttpServer()
                    .post('/api/oauth/token')
                    .send({
                        grant_type: 'authorization_code',
                        code: authCode,
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
    }, 120_000);
});
