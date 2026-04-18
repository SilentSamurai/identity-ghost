import * as fc from 'fast-check';
import { SharedTestFixture } from '../shared-test.fixture';
import { TokenFixture } from '../token.fixture';
import { ClientEntityClient } from '../api-client/client-entity-client';
import { TenantClient } from '../api-client/tenant-client';
import { ScopeNormalizer } from '../../src/casl/scope-normalizer';

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
    let clientApi: ClientEntityClient;
    let testTenantId: string;

    const REDIRECT_URI = 'https://consent-narrower-prop.example.com/callback';
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
            `cn-prop-${uniqueSuffix}`,
            `cn-prop-${uniqueSuffix}.com`,
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
     * Call checkConsent (via the login endpoint) with the given requested scopes.
     * Returns the login response body.
     */
    async function callCheckConsent(clientId: string, requestedScopes: string[]) {
        return fixture.getHttpServer()
            .post('/api/oauth/login')
            .send({
                email: 'admin@auth.server.com',
                password: 'admin9000',
                client_id: clientId,
                code_challenge: CODE_CHALLENGE,
                code_challenge_method: 'plain',
                redirect_uri: REDIRECT_URI,
                scope: requestedScopes.join(' '),
            })
            .set('Accept', 'application/json');
    }

    /**
     * Verify that the stored consent record still covers exactly the original scopes G
     * by checking that:
     * 1. Login with G succeeds (no consent required) — G is still stored
     * 2. Login with any scope outside G requires consent — no extra scopes were added
     */
    async function verifyGrantedScopesUnchanged(
        clientId: string,
        originalGrantedScopes: string[],
    ): Promise<void> {
        const normalizedG = ScopeNormalizer.format(originalGrantedScopes);
        const gScopeArray = ScopeNormalizer.parse(normalizedG);

        // Login with G — must NOT require consent (G is still stored)
        const loginWithG = await callCheckConsent(clientId, gScopeArray);
        expect(loginWithG.status).toEqual(201);
        expect(loginWithG.body.authentication_code).toBeDefined();
        expect(loginWithG.body.requires_consent).toBeUndefined();

        // Determine scopes NOT in G
        const allScopes = ['openid', 'profile', 'email'];
        const scopesOutsideG = allScopes.filter(s => !gScopeArray.includes(s));

        // If there are scopes outside G, login with G + extra must require consent
        // (the record was not expanded beyond G)
        if (scopesOutsideG.length > 0) {
            const loginWithExtra = await callCheckConsent(
                clientId,
                [...gScopeArray, ...scopesOutsideG],
            );
            expect(loginWithExtra.status).toEqual(201);
            expect(loginWithExtra.body.requires_consent).toBe(true);
        }
    }

    it('stored granted_scopes remain equal to G after checkConsent with R ⊆ G', async () => {
        await fc.assert(
            fc.asyncProperty(
                // G: granted scopes (at least 1 scope)
                fc.subarray(['openid', 'profile', 'email'], { minLength: 1 }),
                async (grantedScopes) => {
                    // Derive R as a subset of G: take a non-empty prefix of G
                    // We use fc.subarray on the actual grantedScopes to get a subset
                    const requestedScopes = grantedScopes.length === 1
                        ? grantedScopes  // only one option: R = G
                        : grantedScopes.slice(0, Math.max(1, grantedScopes.length - 1));

                    // Ensure R ⊆ G
                    const rSubsetOfG = requestedScopes.every(s => grantedScopes.includes(s));
                    fc.pre(rSubsetOfG && requestedScopes.length >= 1);

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
                        const grantResponse = await grantConsent(clientId, grantedScopes);
                        expect(grantResponse.status).toEqual(201);
                        expect(grantResponse.body.authentication_code).toBeDefined();

                        // Step 2: Call checkConsent with R ⊆ G (via login endpoint)
                        const checkResponse = await callCheckConsent(clientId, requestedScopes);
                        expect(checkResponse.status).toEqual(201);
                        // R ⊆ G → consent not required
                        expect(checkResponse.body.authentication_code).toBeDefined();
                        expect(checkResponse.body.requires_consent).toBeUndefined();

                        // Step 3: Verify stored scopes are still G (unchanged)
                        await verifyGrantedScopesUnchanged(clientId, grantedScopes);
                    } finally {
                        await clientApi.deleteClient(clientId).catch(() => {});
                    }
                },
            ),
            { numRuns: 15 },
        );
    }, 300_000);

    it('stored granted_scopes remain equal to G after multiple checkConsent calls with R ⊆ G', async () => {
        await fc.assert(
            fc.asyncProperty(
                // G must have at least 2 scopes so we can derive multiple strict subsets
                fc.subarray(['openid', 'profile', 'email'], { minLength: 2 }),
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
                        const grantResponse = await grantConsent(clientId, grantedScopes);
                        expect(grantResponse.status).toEqual(201);

                        // Call checkConsent multiple times with different subsets of G
                        for (let i = 1; i <= grantedScopes.length; i++) {
                            const subset = grantedScopes.slice(0, i);
                            const checkResponse = await callCheckConsent(clientId, subset);
                            expect(checkResponse.status).toEqual(201);
                            expect(checkResponse.body.authentication_code).toBeDefined();
                            expect(checkResponse.body.requires_consent).toBeUndefined();
                        }

                        // After all checkConsent calls, stored scopes must still equal G
                        await verifyGrantedScopesUnchanged(clientId, grantedScopes);
                    } finally {
                        await clientApi.deleteClient(clientId).catch(() => {});
                    }
                },
            ),
            { numRuns: 10 },
        );
    }, 300_000);

    it('checkConsent with R = G does not modify the record (equal set is a subset)', async () => {
        await fc.assert(
            fc.asyncProperty(
                fc.subarray(['openid', 'profile', 'email'], { minLength: 1 }),
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
                        // Create consent record with G = scopes
                        await grantConsent(clientId, scopes);

                        // Call checkConsent with R = G (equal set)
                        const checkResponse = await callCheckConsent(clientId, scopes);
                        expect(checkResponse.status).toEqual(201);
                        expect(checkResponse.body.authentication_code).toBeDefined();
                        expect(checkResponse.body.requires_consent).toBeUndefined();

                        // Stored scopes must still equal G
                        await verifyGrantedScopesUnchanged(clientId, scopes);
                    } finally {
                        await clientApi.deleteClient(clientId).catch(() => {});
                    }
                },
            ),
            { numRuns: 10 },
        );
    }, 300_000);

    it('checkConsent with R ⊆ G does not expand the record beyond G', async () => {
        // Specific case: G = ['openid', 'profile', 'email'], R = ['openid']
        // After checkConsent, stored scopes must still be exactly ['email', 'openid', 'profile']
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

            // Grant full consent
            await grantConsent(clientId, fullScopes);

            // Check consent with narrow subset
            const checkResponse = await callCheckConsent(clientId, narrowScopes);
            expect(checkResponse.status).toEqual(201);
            expect(checkResponse.body.authentication_code).toBeDefined();
            expect(checkResponse.body.requires_consent).toBeUndefined();

            // Stored scopes must still be the full set
            await verifyGrantedScopesUnchanged(clientId, fullScopes);
        } finally {
            await clientApi.deleteClient(clientId).catch(() => {});
        }
    }, 60_000);
});
