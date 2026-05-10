import * as fc from 'fast-check';
import {SharedTestFixture} from '../shared-test.fixture';
import {TokenFixture} from '../token.fixture';
import {ClientEntityClient} from '../api-client/client-entity-client';
import {TenantClient} from '../api-client/tenant-client';

/**
 * Feature: user-consent-tracking, Property 3: Missing consent record always requires consent
 *
 * For any user-client pair with no existing UserConsent record and any non-empty set of
 * requested scopes, the /authorize endpoint SHALL redirect the user to the consent UI
 * (indicating `consentRequired = true`).
 *
 * **Validates: Requirements 2.2**
 */
describe('Feature: user-consent-tracking, Property 3: Missing consent record always requires consent', () => {
    let fixture: SharedTestFixture;
    let tokenFixture: TokenFixture;
    let clientApi: ClientEntityClient;
    let testTenantId: string;

    const REDIRECT_URI = 'https://consent-missing-prop.example.com/callback';
    const CODE_CHALLENGE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopq';
    const email = 'admin@auth.server.com';
    const password = 'admin9000';

    beforeAll(async () => {
        fixture = new SharedTestFixture();
        tokenFixture = new TokenFixture(fixture);
        const {accessToken} = await tokenFixture.fetchPasswordGrantAccessToken(email, password, 'auth.server.com');
        clientApi = new ClientEntityClient(fixture, accessToken);

        const tenantClient = new TenantClient(fixture, accessToken);
        const uniqueSuffix = String(Date.now()).slice(-8);
        const tenant = await tenantClient.createTenant(
            `cm-prop-${uniqueSuffix}`,
            `cm-prop-${uniqueSuffix}.com`,
        );
        testTenantId = tenant.id;
    }, 60_000);

    afterAll(async () => {
        await fixture.close();
    });

    /**
     * Drive /authorize (with a valid session) for the given client+scopes and determine
     * whether consent is required. Returns:
     *   { consentRequired: true }  if /authorize redirected to the consent UI
     *   { consentRequired: false, code }  if /authorize issued a code to redirect_uri
     */
    async function checkConsent(clientId: string, scopes: string[]): Promise<{ consentRequired: boolean; code?: string }> {
        const sidCookie = await tokenFixture.loginForCookie(email, password, clientId, REDIRECT_URI);

        const res = await fixture.getHttpServer()
            .get('/api/oauth/authorize')
            .query({
                response_type: 'code',
                client_id: clientId,
                redirect_uri: REDIRECT_URI,
                scope: scopes.join(' '),
                state: 'consent-check',
                code_challenge: CODE_CHALLENGE,
                code_challenge_method: 'plain',
                session_confirmed: 'true',
            })
            .set('Cookie', sidCookie)
            .redirects(0);

        expect(res.status).toEqual(302);
        const location = res.headers['location'] as string;
        expect(location).toBeDefined();

        // Consent UI redirect → consent required
        if (location.includes('/consent?')) {
            return {consentRequired: true};
        }

        // Otherwise should be a redirect to the client's redirect_uri carrying a code
        const url = new URL(location, 'http://localhost');
        expect(url.searchParams.has('error')).toBe(false);
        const code = url.searchParams.get('code');
        expect(code).toBeTruthy();
        return {consentRequired: false, code: code!};
    }

    it('consent is required for any non-empty set of requested scopes when no consent record exists', async () => {
        await fc.assert(
            fc.asyncProperty(
                // Generate a non-empty set of requested scopes
                fc.subarray(['openid', 'profile', 'email'], {minLength: 1}),
                async (requestedScopes) => {
                    const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
                    const client = await clientApi.createClient(
                        testTenantId,
                        `CM Prop ${uniqueSuffix}`,
                        {
                            redirectUris: [REDIRECT_URI],
                            allowedScopes: 'openid profile email',
                            isPublic: true,
                        },
                    );
                    const clientId = client.client.clientId;

                    try {
                        const result = await checkConsent(clientId, requestedScopes);
                        expect(result.consentRequired).toBe(true);
                        expect(result.code).toBeUndefined();
                    } finally {
                        await clientApi.deleteClient(clientId).catch(() => {
                        });
                    }
                },
            ),
            {numRuns: 20},
        );
    }, 300_000);

    it('consent is required for all valid OIDC scope combinations when no record exists', async () => {
        const allScopeCombinations: string[][] = [
            ['openid'],
            ['profile'],
            ['email'],
            ['openid', 'profile'],
            ['openid', 'email'],
            ['profile', 'email'],
            ['openid', 'profile', 'email'],
        ];

        for (const requestedScopes of allScopeCombinations) {
            const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
            const client = await clientApi.createClient(
                testTenantId,
                `CM All ${uniqueSuffix}`,
                {
                    redirectUris: [REDIRECT_URI],
                    allowedScopes: 'openid profile email',
                    isPublic: true,
                },
            );
            const clientId = client.client.clientId;

            try {
                const result = await checkConsent(clientId, requestedScopes);
                expect(result.consentRequired).toBe(true);
            } finally {
                await clientApi.deleteClient(clientId).catch(() => {
                });
            }
        }
    }, 300_000);

    it('consent is required even after a different client has been consented (no cross-client leakage)', async () => {
        await fc.assert(
            fc.asyncProperty(
                fc.subarray(['openid', 'profile', 'email'], {minLength: 1}),
                async (requestedScopes) => {
                    // Create two fresh clients
                    const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
                    const clientA = await clientApi.createClient(
                        testTenantId,
                        `CM ClientA ${uniqueSuffix}`,
                        {
                            redirectUris: [REDIRECT_URI],
                            allowedScopes: 'openid profile email',
                            isPublic: true,
                        },
                    );
                    const clientB = await clientApi.createClient(
                        testTenantId,
                        `CM ClientB ${uniqueSuffix}`,
                        {
                            redirectUris: [REDIRECT_URI],
                            allowedScopes: 'openid profile email',
                            isPublic: true,
                        },
                    );
                    const clientIdA = clientA.client.clientId;
                    const clientIdB = clientB.client.clientId;

                    try {
                        // Grant consent for client A for the requested scopes
                        await tokenFixture.preGrantConsent(email, password, clientIdA, REDIRECT_URI, requestedScopes.join(' '));

                        // Client B has NO consent record — must still require consent
                        const result = await checkConsent(clientIdB, requestedScopes);
                        expect(result.consentRequired).toBe(true);
                    } finally {
                        await clientApi.deleteClient(clientIdA).catch(() => {
                        });
                        await clientApi.deleteClient(clientIdB).catch(() => {
                        });
                    }
                },
            ),
            {numRuns: 10},
        );
    }, 300_000);
});
