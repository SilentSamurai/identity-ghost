import * as fc from 'fast-check';
import {SharedTestFixture} from '../shared-test.fixture';
import {TokenFixture} from '../token.fixture';
import {ClientEntityClient} from '../api-client/client-entity-client';
import {TenantClient} from '../api-client/tenant-client';
import {ScopeNormalizer} from '../../src/casl/scope-normalizer';

/**
 * Feature: user-consent-tracking, Property 5: Narrower requests do not modify the consent record
 *
 * For any existing UserConsent record with granted scopes G, when `checkConsent` is called
 * with requested scopes R where R ⊆ G, the stored `granted_scopes` SHALL remain equal to G
 * (unchanged).
 *
 * **Validates: Requirements 5.2**
 */
describe('Feature: user-consent-tracking, Property 5: Narrower requests do not modify the consent record', () => {
    let fixture: SharedTestFixture;
    let tokenFixture: TokenFixture;
    let clientApi: ClientEntityClient;
    let testTenantId: string;

    const REDIRECT_URI = 'https://consent-narrower-prop.example.com/callback';
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
            `cn-prop-${uniqueSuffix}`,
            `cn-prop-${uniqueSuffix}.com`,
        );
        testTenantId = tenant.id;
    }, 60_000);

    afterAll(async () => {
        await fixture.close();
    });

    /**
     * Drive /authorize and determine if consent is required.
     * Returns true if /authorize redirected to the consent UI.
     */
    async function isConsentRequired(clientId: string, requestedScopes: string[]): Promise<boolean> {
        const sidCookie = await tokenFixture.loginForCookie(email, password, clientId, REDIRECT_URI);

        const res = await fixture.getHttpServer()
            .get('/api/oauth/authorize')
            .query({
                response_type: 'code',
                client_id: clientId,
                redirect_uri: REDIRECT_URI,
                scope: requestedScopes.join(' '),
                state: 'narrower-check',
                code_challenge: CODE_CHALLENGE,
                code_challenge_method: 'plain',
                session_confirmed: 'true',
            })
            .set('Cookie', sidCookie)
            .redirects(0);

        expect(res.status).toEqual(302);
        const location = res.headers['location'] as string;
        expect(location).toBeDefined();

        if (location.includes('/consent?')) return true;

        const url = new URL(location, 'http://localhost');
        expect(url.searchParams.has('error')).toBe(false);
        expect(url.searchParams.get('code')).toBeTruthy();
        return false;
    }

    /**
     * Verify that the stored consent record still covers exactly the original scopes G by checking:
     * 1. /authorize with G → issues code (G is still stored)
     * 2. /authorize with any scope outside G → consent required (no extra scopes were added)
     */
    async function verifyGrantedScopesUnchanged(
        clientId: string,
        originalGrantedScopes: string[],
    ): Promise<void> {
        const normalizedG = ScopeNormalizer.format(originalGrantedScopes);
        const gScopeArray = ScopeNormalizer.parse(normalizedG);

        // /authorize with G — must NOT require consent (G is still stored)
        expect(await isConsentRequired(clientId, gScopeArray)).toBe(false);

        // Determine scopes NOT in G
        const allScopes = ['openid', 'profile', 'email'];
        const scopesOutsideG = allScopes.filter(s => !gScopeArray.includes(s));

        // If there are scopes outside G, requesting G + extra must require consent.
        if (scopesOutsideG.length > 0) {
            expect(await isConsentRequired(clientId, [...gScopeArray, ...scopesOutsideG])).toBe(true);
        }
    }

    it('stored granted_scopes remain equal to G after a narrower request with R ⊆ G', async () => {
        await fc.assert(
            fc.asyncProperty(
                fc.subarray(['openid', 'profile', 'email'], {minLength: 1}),
                async (grantedScopes) => {
                    // Derive a non-empty R ⊆ G
                    const requestedScopes = grantedScopes.length === 1
                        ? grantedScopes
                        : grantedScopes.slice(0, Math.max(1, grantedScopes.length - 1));

                    const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
                    const client = await clientApi.createClient(
                        testTenantId,
                        `CN Prop ${uniqueSuffix}`,
                        {
                            redirectUris: [REDIRECT_URI],
                            allowedScopes: 'openid profile email',
                            isPublic: true,
                        },
                    );
                    const clientId = client.client.clientId;

                    try {
                        // Step 1: Create consent record with G
                        await tokenFixture.preGrantConsent(email, password, clientId, REDIRECT_URI, grantedScopes.join(' '));

                        // Step 2: Call /authorize with R ⊆ G — must NOT require consent
                        expect(await isConsentRequired(clientId, requestedScopes)).toBe(false);

                        // Step 3: Verify stored scopes are still G (unchanged)
                        await verifyGrantedScopesUnchanged(clientId, grantedScopes);
                    } finally {
                        await clientApi.deleteClient(clientId).catch(() => {
                        });
                    }
                },
            ),
            {numRuns: 15},
        );
    }, 300_000);

    it('stored granted_scopes remain equal to G after multiple narrower requests', async () => {
        await fc.assert(
            fc.asyncProperty(
                // G must have at least 2 scopes so we can derive multiple strict subsets
                fc.subarray(['openid', 'profile', 'email'], {minLength: 2}),
                async (grantedScopes) => {
                    const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
                    const client = await clientApi.createClient(
                        testTenantId,
                        `CN Multi ${uniqueSuffix}`,
                        {
                            redirectUris: [REDIRECT_URI],
                            allowedScopes: 'openid profile email',
                            isPublic: true,
                        },
                    );
                    const clientId = client.client.clientId;

                    try {
                        // Create consent record with G
                        await tokenFixture.preGrantConsent(email, password, clientId, REDIRECT_URI, grantedScopes.join(' '));

                        // Call /authorize multiple times with different subsets of G
                        for (let i = 1; i <= grantedScopes.length; i++) {
                            const subset = grantedScopes.slice(0, i);
                            expect(await isConsentRequired(clientId, subset)).toBe(false);
                        }

                        await verifyGrantedScopesUnchanged(clientId, grantedScopes);
                    } finally {
                        await clientApi.deleteClient(clientId).catch(() => {
                        });
                    }
                },
            ),
            {numRuns: 10},
        );
    }, 300_000);

    it('R = G does not modify the record (equal set is a subset)', async () => {
        await fc.assert(
            fc.asyncProperty(
                fc.subarray(['openid', 'profile', 'email'], {minLength: 1}),
                async (scopes) => {
                    const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
                    const client = await clientApi.createClient(
                        testTenantId,
                        `CN Equal ${uniqueSuffix}`,
                        {
                            redirectUris: [REDIRECT_URI],
                            allowedScopes: 'openid profile email',
                            isPublic: true,
                        },
                    );
                    const clientId = client.client.clientId;

                    try {
                        await tokenFixture.preGrantConsent(email, password, clientId, REDIRECT_URI, scopes.join(' '));

                        expect(await isConsentRequired(clientId, scopes)).toBe(false);

                        await verifyGrantedScopesUnchanged(clientId, scopes);
                    } finally {
                        await clientApi.deleteClient(clientId).catch(() => {
                        });
                    }
                },
            ),
            {numRuns: 10},
        );
    }, 300_000);

    it('R ⊆ G does not expand the record beyond G (full-to-narrow case)', async () => {
        // Specific case: G = ['openid', 'profile', 'email'], R = ['openid']
        const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const client = await clientApi.createClient(
            testTenantId,
            `CN NoExpand ${uniqueSuffix}`,
            {
                redirectUris: [REDIRECT_URI],
                allowedScopes: 'openid profile email',
                isPublic: true,
            },
        );
        const clientId = client.client.clientId;

        try {
            const fullScopes = ['openid', 'profile', 'email'];
            const narrowScopes = ['openid'];

            await tokenFixture.preGrantConsent(email, password, clientId, REDIRECT_URI, fullScopes.join(' '));

            expect(await isConsentRequired(clientId, narrowScopes)).toBe(false);

            await verifyGrantedScopesUnchanged(clientId, fullScopes);
        } finally {
            await clientApi.deleteClient(clientId).catch(() => {
            });
        }
    }, 60_000);
});
