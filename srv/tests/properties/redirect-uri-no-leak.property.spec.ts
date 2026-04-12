import * as fc from 'fast-check';
import { SharedTestFixture } from '../shared-test.fixture';
import { TokenFixture } from '../token.fixture';
import { ClientEntityClient } from '../api-client/client-entity-client';
import { TenantClient } from '../api-client/tenant-client';
import { AdminTenantClient } from '../api-client/admin-tenant-client';

/**
 * Feature: redirect-uri-validation, Property 6: Error responses never leak the submitted redirect_uri
 *
 * For any redirect URI validation failure, the error response body (JSON `error` and
 * `error_description` fields) SHALL NOT contain the submitted `redirect_uri` value as a substring.
 *
 * **Validates: Requirements 5.3**
 */
describe('Feature: redirect-uri-validation, Property 6: Error responses never leak the submitted redirect_uri', () => {
    let app: SharedTestFixture;
    let clientApi: ClientEntityClient;
    let testClientId: string;

    const REGISTERED_URI = 'https://prop-no-leak-test.example.com/callback';
    const email = 'admin@auth.server.com';
    const password = 'admin9000';
    const verifier = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopq';
    const challenge = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopq';

    beforeAll(async () => {
        app = new SharedTestFixture();
        const tokenFixture = new TokenFixture(app);
        const { accessToken } = await tokenFixture.fetchAccessToken(email, password, 'auth.server.com');

        clientApi = new ClientEntityClient(app, accessToken);
        const tenantClient = new TenantClient(app, accessToken);
        const adminTenantClient = new AdminTenantClient(app, accessToken);
        const tenant = await tenantClient.createTenant('prop-no-leak', 'prop-no-leak.example.com');

        await adminTenantClient.addMembers(tenant.id, [email]);

        const created = await clientApi.createClient(tenant.id, 'No Leak Prop Client', {
            redirectUris: [REGISTERED_URI],
            allowedScopes: 'openid profile email',
            isPublic: true,
        });
        testClientId = created.client.clientId;
    });

    afterAll(async () => {
        await clientApi.deleteClient(testClientId).catch(() => {});
        await app.close();
    });

    /**
     * Property 6a: Authorization endpoint error responses never leak the submitted redirect_uri.
     *
     * Generate arbitrary non-matching redirect_uri strings, send them to GET /api/oauth/authorize,
     * and assert the submitted URI does not appear anywhere in the JSON response body.
     */
    it('authorization endpoint error responses never contain the submitted redirect_uri', async () => {
        await fc.assert(
            fc.asyncProperty(
                fc.webUrl().filter(url => url !== REGISTERED_URI),
                async (badUri) => {
                    const query = new URLSearchParams({
                        response_type: 'code',
                        client_id: testClientId,
                        redirect_uri: badUri,
                        state: 'no-leak-auth-test',
                    }).toString();

                    const res = await app.getHttpServer()
                        .get(`/api/oauth/authorize?${query}`)
                        .redirects(0);

                    expect(res.status).toBe(400);

                    const bodyStr = JSON.stringify(res.body);
                    expect(bodyStr).not.toContain(badUri);

                    if (res.body.error) {
                        expect(res.body.error).not.toContain(badUri);
                    }
                    if (res.body.error_description) {
                        expect(res.body.error_description).not.toContain(badUri);
                    }
                },
            ),
            { numRuns: 20 },
        );
    }, 120_000);

    /**
     * Property 6b: Login endpoint error responses never leak the submitted redirect_uri.
     *
     * Generate arbitrary non-matching redirect_uri strings, send them to POST /api/oauth/login,
     * and assert the submitted URI does not appear anywhere in the JSON response body.
     */
    it('login endpoint error responses never contain the submitted redirect_uri', async () => {
        await fc.assert(
            fc.asyncProperty(
                fc.webUrl().filter(url => url !== REGISTERED_URI),
                async (badUri) => {
                    const res = await app.getHttpServer()
                        .post('/api/oauth/login')
                        .send({
                            email,
                            password,
                            client_id: testClientId,
                            redirect_uri: badUri,
                            code_challenge: challenge,
                            code_challenge_method: 'plain',
                        })
                        .set('Accept', 'application/json');

                    expect(res.status).toBe(400);

                    const bodyStr = JSON.stringify(res.body);
                    expect(bodyStr).not.toContain(badUri);

                    if (res.body.error) {
                        expect(res.body.error).not.toContain(badUri);
                    }
                    if (res.body.error_description) {
                        expect(res.body.error_description).not.toContain(badUri);
                    }
                },
            ),
            { numRuns: 20 },
        );
    }, 120_000);

    /**
     * Property 6c: Token exchange endpoint error responses never leak the submitted redirect_uri.
     *
     * Create an auth code with the registered URI, then attempt token exchange with arbitrary
     * non-matching redirect_uri strings. Assert the submitted URI does not appear in the response.
     */
    it('token exchange endpoint error responses never contain the submitted redirect_uri', async () => {
        await fc.assert(
            fc.asyncProperty(
                fc.webUrl().filter(url => url !== REGISTERED_URI),
                async (badUri) => {
                    // Login with the valid registered URI to get an auth code
                    const loginRes = await app.getHttpServer()
                        .post('/api/oauth/login')
                        .send({
                            email,
                            password,
                            client_id: testClientId,
                            redirect_uri: REGISTERED_URI,
                            code_challenge: challenge,
                            code_challenge_method: 'plain',
                        })
                        .set('Accept', 'application/json');

                    expect(loginRes.status).toBe(201);
                    const code = loginRes.body.authentication_code;

                    // Attempt token exchange with a mismatched redirect_uri
                    const res = await app.getHttpServer()
                        .post('/api/oauth/token')
                        .send({
                            grant_type: 'authorization_code',
                            code,
                            code_verifier: verifier,
                            client_id: testClientId,
                            redirect_uri: badUri,
                        })
                        .set('Accept', 'application/json');

                    expect(res.status).toBe(400);

                    const bodyStr = JSON.stringify(res.body);
                    expect(bodyStr).not.toContain(badUri);

                    if (res.body.error) {
                        expect(res.body.error).not.toContain(badUri);
                    }
                    if (res.body.error_description) {
                        expect(res.body.error_description).not.toContain(badUri);
                    }
                },
            ),
            { numRuns: 20 },
        );
    }, 120_000);
});
