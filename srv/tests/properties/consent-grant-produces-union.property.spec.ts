import * as fc from 'fast-check';
import {SharedTestFixture} from '../shared-test.fixture';
import {TokenFixture} from '../token.fixture';
import {ClientEntityClient} from '../api-client/client-entity-client';
import {TenantClient} from '../api-client/tenant-client';
import {ScopeNormalizer} from '../../src/casl/scope-normalizer';

/**
 * Feature: user-consent-tracking, Property 4: Granting consent produces the union of scopes
 *
 * For any existing set of granted scopes G and newly approved scopes A, after calling
 * `grantConsent`, the stored `granted_scopes` SHALL equal G ∪ A (the set union),
 * normalized via `ScopeNormalizer`.
 *
 * **Validates: Requirements 3.2**
 */
describe('Feature: user-consent-tracking, Property 4: Granting consent produces the union of scopes', () => {
    let fixture: SharedTestFixture;
    let tokenFixture: TokenFixture;
    let clientApi: ClientEntityClient;
    let testTenantId: string;

    const REDIRECT_URI = 'https://consent-union-prop.example.com/callback';
    const CODE_CHALLENGE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopq';
    const email = 'admin@auth.server.com';
    const password = 'admin9000';

    beforeAll(async () => {
        fixture = new SharedTestFixture();
        tokenFixture = new TokenFixture(fixture);
        const {accessToken} = await tokenFixture.fetchAccessTokenFlow(email, password, 'auth.server.com');
        clientApi = new ClientEntityClient(fixture, accessToken);

        const tenantClient = new TenantClient(fixture, accessToken);
        const uniqueSuffix = String(Date.now()).slice(-8);
        const tenant = await tenantClient.createTenant(
            `cu-prop-${uniqueSuffix}`,
            `cu-prop-${uniqueSuffix}.com`,
        );
        testTenantId = tenant.id;
    }, 60_000);

    afterAll(async () => {
        await fixture.close();
    });

    /** Grant consent via tokenFixture.preGrantConsentFlow (cookie + CSRF). */
    async function grantConsent(clientId: string, scopes: string[]): Promise<void> {
        await tokenFixture.preGrantConsentFlow(email, password, {
            clientId,
            redirectUri: REDIRECT_URI,
            scope: scopes.join(' '),
            state: 'consent-state',
            codeChallenge: CODE_CHALLENGE,
            codeChallengeMethod: 'plain',
        });
    }

    /**
     * Drive /authorize and determine if consent is required.
     * Returns true if /authorize redirected to the consent UI.
     */
    async function isConsentRequired(clientId: string, requestedScopes: string[]): Promise<boolean> {
        const params = {
            clientId,
            redirectUri: REDIRECT_URI,
            scope: requestedScopes.join(' '),
            state: 'union-check',
            codeChallenge: CODE_CHALLENGE,
            codeChallengeMethod: 'plain',
        };
        const csrfContext = await tokenFixture.initializeFlow(params);
        const sidCookie = await tokenFixture.login(email, password, clientId, csrfContext);

        const { location } = await tokenFixture.checkAuthorize(params, sidCookie, csrfContext.flowIdCookie);

        if (location.includes('view=consent') || location.includes('/consent?')) return true;

        const url = new URL(location, 'http://localhost');
        expect(url.searchParams.has('error')).toBe(false);
        expect(url.searchParams.get('code')).toBeTruthy();
        return false;
    }

    /**
     * Verify the stored consent covers exactly `expectedUnion` — /authorize succeeds for the
     * union, and any scope outside the union makes /authorize redirect to consent UI.
     */
    async function verifyStoredScopes(
        clientId: string,
        expectedUnion: string[],
    ): Promise<void> {
        const normalizedExpected = ScopeNormalizer.format(expectedUnion);
        const expectedScopeArray = ScopeNormalizer.parse(normalizedExpected);

        // /authorize with the full expected union — must NOT require consent
        expect(await isConsentRequired(clientId, expectedScopeArray)).toBe(false);

        // Determine scopes NOT in the expected union
        const allScopes = ['openid', 'profile', 'email'];
        const scopesOutsideUnion = allScopes.filter(s => !expectedScopeArray.includes(s));

        // If there are scopes outside the union, /authorize must require consent for them.
        if (scopesOutsideUnion.length > 0) {
            expect(await isConsentRequired(clientId, [...expectedScopeArray, ...scopesOutsideUnion])).toBe(true);
        }
    }

    it('stored scopes after grantConsent equal G ∪ A (normalized)', async () => {
        await fc.assert(
            fc.asyncProperty(
                fc.subarray(['openid', 'profile', 'email'], {minLength: 1}),
                fc.subarray(['openid', 'profile', 'email'], {minLength: 1}),
                async (grantedScopes, approvedScopes) => {
                    const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
                    const client = await clientApi.createClient(
                        testTenantId,
                        `CU Prop ${uniqueSuffix}`,
                        {
                            redirectUris: [REDIRECT_URI],
                            allowedScopes: 'openid profile email',
                            isPublic: true,
                        },
                    );
                    const clientId = client.client.clientId;

                    try {
                        // Step 1: Create initial consent with G
                        await grantConsent(clientId, grantedScopes);

                        // Step 2: Grant consent with A (update existing record)
                        await grantConsent(clientId, approvedScopes);

                        // Step 3: Compute expected union G ∪ A
                        const expectedUnion = ScopeNormalizer.union(grantedScopes, approvedScopes);

                        // Step 4: Verify stored scopes equal G ∪ A
                        await verifyStoredScopes(clientId, expectedUnion);
                    } finally {
                        await clientApi.deleteClient(clientId).catch(() => {
                        });
                    }
                },
            ),
            {numRuns: 15},
        );
    }, 300_000);

    it('union is commutative: G ∪ A = A ∪ G (order of grants does not matter for final state)', async () => {
        await fc.assert(
            fc.asyncProperty(
                fc.subarray(['openid', 'profile', 'email'], {minLength: 1}),
                fc.subarray(['openid', 'profile', 'email'], {minLength: 1}),
                async (scopesFirst, scopesSecond) => {
                    const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

                    const clientA = await clientApi.createClient(
                        testTenantId,
                        `CU CommA ${uniqueSuffix}`,
                        {
                            redirectUris: [REDIRECT_URI],
                            allowedScopes: 'openid profile email',
                            isPublic: true,
                        },
                    );

                    const clientB = await clientApi.createClient(
                        testTenantId,
                        `CU CommB ${uniqueSuffix}`,
                        {
                            redirectUris: [REDIRECT_URI],
                            allowedScopes: 'openid profile email',
                            isPublic: true,
                        },
                    );

                    try {
                        // Client A: grant scopesFirst, then scopesSecond
                        await grantConsent(clientA.client.clientId, scopesFirst);
                        await grantConsent(clientA.client.clientId, scopesSecond);

                        // Client B: grant scopesSecond, then scopesFirst
                        await grantConsent(clientB.client.clientId, scopesSecond);
                        await grantConsent(clientB.client.clientId, scopesFirst);

                        const expectedUnion = ScopeNormalizer.union(scopesFirst, scopesSecond);

                        await verifyStoredScopes(clientA.client.clientId, expectedUnion);
                        await verifyStoredScopes(clientB.client.clientId, expectedUnion);
                    } finally {
                        await clientApi.deleteClient(clientA.client.clientId).catch(() => {
                        });
                        await clientApi.deleteClient(clientB.client.clientId).catch(() => {
                        });
                    }
                },
            ),
            {numRuns: 10},
        );
    }, 300_000);

    it('granting the same scopes twice produces the same result as granting once (idempotent union)', async () => {
        await fc.assert(
            fc.asyncProperty(
                fc.subarray(['openid', 'profile', 'email'], {minLength: 1}),
                async (scopes) => {
                    const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
                    const client = await clientApi.createClient(
                        testTenantId,
                        `CU Idem ${uniqueSuffix}`,
                        {
                            redirectUris: [REDIRECT_URI],
                            allowedScopes: 'openid profile email',
                            isPublic: true,
                        },
                    );
                    const clientId = client.client.clientId;

                    try {
                        await grantConsent(clientId, scopes);
                        await grantConsent(clientId, scopes);

                        // G ∪ G = G
                        await verifyStoredScopes(clientId, scopes);
                    } finally {
                        await clientApi.deleteClient(clientId).catch(() => {
                        });
                    }
                },
            ),
            {numRuns: 10},
        );
    }, 300_000);
});
