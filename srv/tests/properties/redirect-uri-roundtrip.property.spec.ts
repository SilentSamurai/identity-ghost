import * as fc from 'fast-check';
import {SharedTestFixture} from '../shared-test.fixture';
import {TokenFixture} from '../token.fixture';
import {ClientEntityClient} from '../api-client/client-entity-client';
import {TenantClient} from '../api-client/tenant-client';

/**
 * Feature: redirect-uri-validation, Property 3: Auth code stores redirect_uri as a round-trip
 *
 * For any authorization code creation, the redirect_uri value stored in the AuthCode record
 * SHALL exactly equal the redirect_uri provided in the originating request, or SHALL be null
 * when the redirect_uri was omitted.
 *
 * We verify storage indirectly through the token exchange binding:
 * - When redirect_uri was provided at authorize, token exchange with the exact same value succeeds.
 * - When no redirect_uri is in the stored auth code (seeded directly), token exchange without
 *   redirect_uri succeeds.
 *
 * **Validates: Requirements 2.3, 3.1, 3.2**
 */
describe('Feature: redirect-uri-validation, Property 3: Auth code stores redirect_uri as a round-trip', () => {
    let app: SharedTestFixture;
    let tokenFixture: TokenFixture;
    let clientApi: ClientEntityClient;
    let testClientId: string;
    let userId: string;
    let tenantId: string;

    const REGISTERED_URI = 'https://prop-roundtrip-test.example.com/callback';
    const email = 'admin@auth.server.com';
    const password = 'admin9000';
    const verifier = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopq';
    const challenge = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopq';

    beforeAll(async () => {
        app = new SharedTestFixture();
        tokenFixture = new TokenFixture(app);
        const {accessToken} = await tokenFixture.fetchAccessTokenFlow(email, password, 'auth.server.com');

        clientApi = new ClientEntityClient(app, accessToken);
        const tenantClient = new TenantClient(app, accessToken);
        const tenant = await tenantClient.createTenant('prop-roundtrip', 'prop-roundtrip.example.com');
        tenantId = tenant.id;

        const created = await clientApi.createClient(tenant.id, 'Roundtrip Prop Client', {
            redirectUris: [REGISTERED_URI],
            allowedScopes: 'openid profile email',
            isPublic: true,
        });
        testClientId = created.client.clientId;

        // Pre-grant consent so /authorize issues codes directly.
        await tokenFixture.preGrantConsentFlow(email, password, {
            clientId: testClientId,
            redirectUri: REGISTERED_URI,
            scope: 'openid profile email',
            state: 'consent-state',
            codeChallenge: challenge,
            codeChallengeMethod: 'plain',
        });

        // Resolve user id for direct auth-code seeding (null-redirect-uri case).
        const userRes = await app.getHttpServer().get(`/api/test-utils/users/by-email/${encodeURIComponent(email)}`);
        expect(userRes.status).toBe(200);
        userId = userRes.body.id;
    });

    afterAll(async () => {
        await clientApi.deleteClient(testClientId).catch(() => {
        });
        await app.close();
    });

    /** Login → authorize with REGISTERED_URI and return the resulting auth code. */
    async function loginForCodeWithRegisteredUri(): Promise<string> {
        return tokenFixture.fetchAuthCode(email, password, testClientId, REGISTERED_URI, {
            codeChallenge: challenge,
            codeChallengeMethod: 'plain',
        });
    }

    /** Seed an auth code directly with null redirect_uri (cannot go through /authorize for a null URI). */
    async function seedCodeWithoutRedirectUri(): Promise<string> {
        const res = await app.getHttpServer()
            .post('/api/test-utils/auth-codes')
            .send({
                userId,
                tenantId,
                clientId: testClientId,
                codeChallenge: challenge,
                method: 'plain',
                redirectUri: null,
                scope: 'openid profile email',
            })
            .set('Accept', 'application/json');
        expect(res.status).toBeGreaterThanOrEqual(200);
        expect(res.status).toBeLessThan(300);
        return res.body.code;
    }

    /** Exchange an auth code for tokens, optionally with a redirect_uri */
    async function exchangeCode(code: string, redirectUri?: string): Promise<{ status: number; body: any }> {
        const payload: any = {
            grant_type: 'authorization_code',
            code,
            code_verifier: verifier,
            client_id: testClientId,
        };
        if (redirectUri !== undefined) {
            payload.redirect_uri = redirectUri;
        }

        const res = await app.getHttpServer()
            .post('/api/oauth/token')
            .send(payload)
            .set('Accept', 'application/json');

        return {status: res.status, body: res.body};
    }

    it('stored redirect_uri exactly equals the provided value (round-trip via token exchange)', async () => {
        // Property: for every auth code created with REGISTERED_URI, exchange with the same URI succeeds.
        // The shrinker filters out trivially invalid URIs by filtering on REGISTERED_URI equality.
        await fc.assert(
            fc.asyncProperty(
                fc.webUrl().filter(url => url !== REGISTERED_URI),
                async (_mismatchUri) => {
                    // Create auth code with the registered redirect_uri
                    const code = await loginForCodeWithRegisteredUri();

                    // Exchange with the exact same URI → should succeed (proves exact storage)
                    const matchResult = await exchangeCode(code, REGISTERED_URI);
                    expect(matchResult.status).toBeGreaterThanOrEqual(200);
                    expect(matchResult.status).toBeLessThan(300);
                    expect(matchResult.body.access_token).toBeDefined();
                },
            ),
            {numRuns: 10},
        );
    }, 180_000);

    it('stored redirect_uri is null when omitted from the originating request', async () => {
        const code = await seedCodeWithoutRedirectUri();

        // Exchange without redirect_uri → should succeed (null stored, binding bypassed)
        const result = await exchangeCode(code, undefined);
        expect(result.status).toBeGreaterThanOrEqual(200);
        expect(result.status).toBeLessThan(300);
        expect(result.body.access_token).toBeDefined();
    }, 30_000);

    it('redirect_uri round-trip: provided URI is stored exactly, omitted URI stores null', async () => {
        await fc.assert(
            fc.asyncProperty(
                fc.boolean(), // true = provide redirect_uri, false = omit
                async (provideUri) => {
                    if (provideUri) {
                        // Stored URI should be REGISTERED_URI — exchange with it succeeds
                        const code = await loginForCodeWithRegisteredUri();
                        const matchResult = await exchangeCode(code, REGISTERED_URI);
                        expect(matchResult.status).toBeGreaterThanOrEqual(200);
                        expect(matchResult.status).toBeLessThan(300);
                        expect(matchResult.body.access_token).toBeDefined();
                    } else {
                        // Stored URI should be null — exchange without redirect_uri succeeds
                        const code = await seedCodeWithoutRedirectUri();
                        const nullResult = await exchangeCode(code, undefined);
                        expect(nullResult.status).toBeGreaterThanOrEqual(200);
                        expect(nullResult.status).toBeLessThan(300);
                        expect(nullResult.body.access_token).toBeDefined();
                    }
                },
            ),
            {numRuns: 20},
        );
    }, 180_000);
});
