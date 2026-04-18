import * as fc from 'fast-check';
import { SharedTestFixture } from '../shared-test.fixture';
import { TokenFixture } from '../token.fixture';
import { ClientEntityClient } from '../api-client/client-entity-client';
import { TenantClient } from '../api-client/tenant-client';
import { ScopeNormalizer } from '../../src/casl/scope-normalizer';

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
    let clientApi: ClientEntityClient;
    let testTenantId: string;

    const REDIRECT_URI = 'https://consent-union-prop.example.com/callback';
    const CODE_CHALLENGE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopq';

    beforeAll(async () => {
        fixture = new SharedTestFixture();
        const tokenFixture = new TokenFixture(fixture);
        const { accessToken } = await tokenFixture.fetchAccessToken(
            'admin@auth.server.com',
            'admin9000',
            'auth.server.com',
        );
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

    /**
     * Grant consent via the consent endpoint.
     */
    async function grantConsent(clientId: string, scopes: string[]) {
        return fixture.getHttpServer()
            .post('/api/oauth/consent')
            .send({
                email: 'admin@auth.server.com',
                password: 'admin9000',
                client_id: clientId,
                code_challenge: CODE_CHALLENGE,
                code_challenge_method: 'plain',
                redirect_uri: REDIRECT_URI,
                approved_scopes: scopes,
                consent_action: 'approve',
                scope: scopes.join(' '),
            })
            .set('Accept', 'application/json');
    }

    /**
     * Verify that the stored consent covers exactly the expected scopes by checking
     * that login succeeds (no consent required) for the expected union, and that
     * login requires consent for any scope outside the union.
     */
    async function verifyStoredScopes(
        clientId: string,
        expectedUnion: string[],
    ): Promise<void> {
        const normalizedExpected = ScopeNormalizer.format(expectedUnion);
        const expectedScopeArray = ScopeNormalizer.parse(normalizedExpected);

        // Login with the full expected union — must NOT require consent
        const loginWithUnion = await fixture.getHttpServer()
            .post('/api/oauth/login')
            .send({
                email: 'admin@auth.server.com',
                password: 'admin9000',
                client_id: clientId,
                code_challenge: CODE_CHALLENGE,
                code_challenge_method: 'plain',
                redirect_uri: REDIRECT_URI,
                scope: expectedScopeArray.join(' '),
            })
            .set('Accept', 'application/json');

        expect(loginWithUnion.status).toEqual(201);
        expect(loginWithUnion.body.authentication_code).toBeDefined();
        expect(loginWithUnion.body.requires_consent).toBeUndefined();

        // Determine scopes NOT in the expected union
        const allScopes = ['openid', 'profile', 'email'];
        const scopesOutsideUnion = allScopes.filter(s => !expectedScopeArray.includes(s));

        // If there are scopes outside the union, login with them must require consent
        if (scopesOutsideUnion.length > 0) {
            const loginWithExtra = await fixture.getHttpServer()
                .post('/api/oauth/login')
                .send({
                    email: 'admin@auth.server.com',
                    password: 'admin9000',
                    client_id: clientId,
                    code_challenge: CODE_CHALLENGE,
                    code_challenge_method: 'plain',
                    redirect_uri: REDIRECT_URI,
                    scope: [...expectedScopeArray, ...scopesOutsideUnion].join(' '),
                })
                .set('Accept', 'application/json');

            expect(loginWithExtra.status).toEqual(201);
            expect(loginWithExtra.body.requires_consent).toBe(true);
        }
    }

    it('stored scopes after grantConsent equal G ∪ A (normalized)', async () => {
        await fc.assert(
            fc.asyncProperty(
                // G: initial granted scopes
                fc.subarray(['openid', 'profile', 'email'], { minLength: 1 }),
                // A: newly approved scopes
                fc.subarray(['openid', 'profile', 'email'], { minLength: 1 }),
                async (grantedScopes, approvedScopes) => {
                    // Create a fresh client for this iteration
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
                        const firstGrant = await grantConsent(clientId, grantedScopes);
                        expect(firstGrant.status).toEqual(201);
                        expect(firstGrant.body.authentication_code).toBeDefined();

                        // Step 2: Grant consent with A (update existing record)
                        const secondGrant = await grantConsent(clientId, approvedScopes);
                        expect(secondGrant.status).toEqual(201);
                        expect(secondGrant.body.authentication_code).toBeDefined();

                        // Step 3: Compute expected union G ∪ A
                        const expectedUnion = ScopeNormalizer.union(grantedScopes, approvedScopes);

                        // Step 4: Verify stored scopes equal G ∪ A
                        await verifyStoredScopes(clientId, expectedUnion);
                    } finally {
                        await clientApi.deleteClient(clientId).catch(() => {});
                    }
                },
            ),
            { numRuns: 15 },
        );
    }, 300_000);

    it('union is commutative: G ∪ A = A ∪ G (order of grants does not matter for final state)', async () => {
        await fc.assert(
            fc.asyncProperty(
                fc.subarray(['openid', 'profile', 'email'], { minLength: 1 }),
                fc.subarray(['openid', 'profile', 'email'], { minLength: 1 }),
                async (scopesFirst, scopesSecond) => {
                    const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

                    // Client A: grant G first, then A
                    const clientA = await clientApi.createClient(
                        testTenantId,
                        `CU CommA ${uniqueSuffix}`,
                        {
                            redirectUris: [REDIRECT_URI],
                            allowedScopes: 'openid profile email',
                            isPublic: true,
                        },
                    );

                    // Client B: grant A first, then G
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

                        // Both should have the same union
                        const expectedUnion = ScopeNormalizer.union(scopesFirst, scopesSecond);

                        await verifyStoredScopes(clientA.client.clientId, expectedUnion);
                        await verifyStoredScopes(clientB.client.clientId, expectedUnion);
                    } finally {
                        await clientApi.deleteClient(clientA.client.clientId).catch(() => {});
                        await clientApi.deleteClient(clientB.client.clientId).catch(() => {});
                    }
                },
            ),
            { numRuns: 10 },
        );
    }, 300_000);

    it('granting the same scopes twice produces the same result as granting once (idempotent union)', async () => {
        await fc.assert(
            fc.asyncProperty(
                fc.subarray(['openid', 'profile', 'email'], { minLength: 1 }),
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
                        // Grant the same scopes twice
                        await grantConsent(clientId, scopes);
                        await grantConsent(clientId, scopes);

                        // G ∪ G = G — stored scopes must equal the original scopes
                        await verifyStoredScopes(clientId, scopes);
                    } finally {
                        await clientApi.deleteClient(clientId).catch(() => {});
                    }
                },
            ),
            { numRuns: 10 },
        );
    }, 300_000);
});
