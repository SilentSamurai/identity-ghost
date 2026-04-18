import * as fc from 'fast-check';
import { SharedTestFixture } from '../shared-test.fixture';
import { TokenFixture } from '../token.fixture';
import { ClientEntityClient } from '../api-client/client-entity-client';
import { TenantClient } from '../api-client/tenant-client';

/**
 * Feature: user-consent-tracking, Property 2: Consent required iff requested scopes exceed granted scopes
 *
 * For any set of granted scopes G and requested scopes R (both drawn from valid OIDC scope
 * values), `checkConsent` SHALL return `consentRequired = false` if and only if R ⊆ G.
 * Otherwise it SHALL return `consentRequired = true`.
 *
 * **Validates: Requirements 2.1, 3.1, 5.1**
 */
describe('Feature: user-consent-tracking, Property 2: Consent required iff requested scopes exceed granted scopes', () => {
    let fixture: SharedTestFixture;
    let clientApi: ClientEntityClient;
    let testTenantId: string;

    const REDIRECT_URI = 'https://consent-iff-prop.example.com/callback';
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
            `ci-prop-${uniqueSuffix}`,
            `ci-prop-${uniqueSuffix}.com`,
        );
        testTenantId = tenant.id;
    }, 60_000);

    afterAll(async () => {
        await fixture.close();
    });

    /**
     * Grant consent for the given scopes via the consent endpoint.
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
     * Check consent by calling the login endpoint and inspecting the response.
     * Returns true if consent is required, false if not.
     */
    async function checkConsentRequired(clientId: string, requestedScopes: string[]): Promise<boolean> {
        const response = await fixture.getHttpServer()
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

        expect(response.status).toEqual(201);

        if (response.body.requires_consent === true) {
            return true;
        }
        if (response.body.authentication_code !== undefined) {
            return false;
        }
        // Unexpected response
        throw new Error(`Unexpected login response: ${JSON.stringify(response.body)}`);
    }

    it('consentRequired = false iff R ⊆ G (biconditional)', async () => {
        await fc.assert(
            fc.asyncProperty(
                // G: granted scopes (non-empty subset of OIDC scopes)
                fc.subarray(['openid', 'profile', 'email'], { minLength: 1 }),
                // R: requested scopes (non-empty subset of OIDC scopes)
                fc.subarray(['openid', 'profile', 'email'], { minLength: 1 }),
                async (grantedScopes, requestedScopes) => {
                    // Create a fresh client for this iteration
                    const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
                    const client = await clientApi.createClient(
                        testTenantId,
                        `CI Prop ${uniqueSuffix}`,
                        {
                            redirectUris: [REDIRECT_URI],
                            allowedScopes: 'openid profile email',
                            isPublic: true,
                        },
                    );
                    const clientId = client.client.clientId;

                    try {
                        // Grant consent with scopes G
                        const grantResponse = await grantConsent(clientId, grantedScopes);
                        expect(grantResponse.status).toEqual(201);
                        expect(grantResponse.body.authentication_code).toBeDefined();

                        // Check consent with requested scopes R
                        const consentRequired = await checkConsentRequired(clientId, requestedScopes);

                        // Compute the expected result: R ⊆ G ↔ consentRequired = false
                        const rSubsetOfG = requestedScopes.every(s => grantedScopes.includes(s));

                        // Biconditional: consentRequired = false ↔ R ⊆ G
                        expect(consentRequired).toBe(!rSubsetOfG);
                    } finally {
                        await clientApi.deleteClient(clientId).catch(() => {});
                    }
                },
            ),
            { numRuns: 20 },
        );
    }, 300_000);

    it('consentRequired = false when R = G (equal sets)', async () => {
        await fc.assert(
            fc.asyncProperty(
                fc.subarray(['openid', 'profile', 'email'], { minLength: 1 }),
                async (scopes) => {
                    const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
                    const client = await clientApi.createClient(
                        testTenantId,
                        `CI Equal ${uniqueSuffix}`,
                        {
                            redirectUris: [REDIRECT_URI],
                            allowedScopes: 'openid profile email',
                            isPublic: true,
                        },
                    );
                    const clientId = client.client.clientId;

                    try {
                        // Grant consent with scopes G
                        const grantResponse = await grantConsent(clientId, scopes);
                        expect(grantResponse.status).toEqual(201);

                        // Request the exact same scopes R = G
                        const consentRequired = await checkConsentRequired(clientId, scopes);

                        // R = G → R ⊆ G → consentRequired = false
                        expect(consentRequired).toBe(false);
                    } finally {
                        await clientApi.deleteClient(clientId).catch(() => {});
                    }
                },
            ),
            { numRuns: 15 },
        );
    }, 300_000);

    it('consentRequired = false when R is a strict subset of G', async () => {
        await fc.assert(
            fc.asyncProperty(
                // G must have at least 2 elements so we can derive a strict subset R
                fc.subarray(['openid', 'profile', 'email'], { minLength: 2 }),
                async (grantedScopes) => {
                    // R = strict subset of G (take all but the last element)
                    const requestedScopes = grantedScopes.slice(0, grantedScopes.length - 1);
                    fc.pre(requestedScopes.length >= 1);

                    const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
                    const client = await clientApi.createClient(
                        testTenantId,
                        `CI Subset ${uniqueSuffix}`,
                        {
                            redirectUris: [REDIRECT_URI],
                            allowedScopes: 'openid profile email',
                            isPublic: true,
                        },
                    );
                    const clientId = client.client.clientId;

                    try {
                        // Grant consent with G
                        const grantResponse = await grantConsent(clientId, grantedScopes);
                        expect(grantResponse.status).toEqual(201);

                        // Request strict subset R ⊂ G
                        const consentRequired = await checkConsentRequired(clientId, requestedScopes);

                        // R ⊂ G → R ⊆ G → consentRequired = false
                        expect(consentRequired).toBe(false);
                    } finally {
                        await clientApi.deleteClient(clientId).catch(() => {});
                    }
                },
            ),
            { numRuns: 10 },
        );
    }, 300_000);

    it('consentRequired = true when R contains scopes not in G', async () => {
        await fc.assert(
            fc.asyncProperty(
                // G: granted scopes (non-empty, but not all 3 scopes so R can exceed G)
                fc.subarray(['openid', 'profile', 'email'], { minLength: 1, maxLength: 2 }),
                async (grantedScopes) => {
                    // R: all 3 scopes — guaranteed to exceed G since G has at most 2
                    const requestedScopes = ['openid', 'profile', 'email'];
                    // Only run when R actually exceeds G
                    const rExceedsG = requestedScopes.some(s => !grantedScopes.includes(s));
                    fc.pre(rExceedsG);

                    const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
                    const client = await clientApi.createClient(
                        testTenantId,
                        `CI Exceed ${uniqueSuffix}`,
                        {
                            redirectUris: [REDIRECT_URI],
                            allowedScopes: 'openid profile email',
                            isPublic: true,
                        },
                    );
                    const clientId = client.client.clientId;

                    try {
                        // Grant consent with G (partial scopes)
                        const grantResponse = await grantConsent(clientId, grantedScopes);
                        expect(grantResponse.status).toEqual(201);

                        // Request R which exceeds G
                        const consentRequired = await checkConsentRequired(clientId, requestedScopes);

                        // R ⊄ G → consentRequired = true
                        expect(consentRequired).toBe(true);
                    } finally {
                        await clientApi.deleteClient(clientId).catch(() => {});
                    }
                },
            ),
            { numRuns: 10 },
        );
    }, 300_000);
});
