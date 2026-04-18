import * as fc from 'fast-check';
import { SharedTestFixture } from '../shared-test.fixture';
import { TokenFixture } from '../token.fixture';
import { ClientEntityClient } from '../api-client/client-entity-client';
import { TenantClient } from '../api-client/tenant-client';

/**
 * Feature: user-consent-tracking, Property 3: Missing consent record always requires consent
 *
 * For any user-client pair with no existing UserConsent record and any non-empty set of
 * requested scopes, `checkConsent` SHALL return `consentRequired = true`.
 *
 * **Validates: Requirements 2.2**
 */
describe('Feature: user-consent-tracking, Property 3: Missing consent record always requires consent', () => {
    let fixture: SharedTestFixture;
    let clientApi: ClientEntityClient;
    let testTenantId: string;

    const REDIRECT_URI = 'https://consent-missing-prop.example.com/callback';
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
            `cm-prop-${uniqueSuffix}`,
            `cm-prop-${uniqueSuffix}.com`,
        );
        testTenantId = tenant.id;
    }, 60_000);

    afterAll(async () => {
        await fixture.close();
    });

    it('checkConsent always returns consentRequired = true when no consent record exists', async () => {
        await fc.assert(
            fc.asyncProperty(
                // Generate a non-empty set of requested scopes
                fc.subarray(['openid', 'profile', 'email'], { minLength: 1 }),
                async (requestedScopes) => {
                    // Create a fresh client for this iteration — no prior consent record exists
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
                        // Call login (which triggers checkConsent) with NO prior consent record
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

                        // With no consent record, consent MUST always be required
                        expect(response.body.requires_consent).toBe(true);
                        // Must NOT return an auth code when consent is required
                        expect(response.body.authentication_code).toBeUndefined();
                        // Must include the requested scopes in the response
                        expect(response.body.requested_scopes).toBeDefined();
                        expect(Array.isArray(response.body.requested_scopes)).toBe(true);
                    } finally {
                        await clientApi.deleteClient(clientId).catch(() => {});
                    }
                },
            ),
            { numRuns: 20 },
        );
    }, 300_000);

    it('consent is required for all valid OIDC scope combinations when no record exists', async () => {
        // Test each individual scope value
        const allScopeCombinations = [
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
                expect(response.body.requires_consent).toBe(true);
                expect(response.body.authentication_code).toBeUndefined();
            } finally {
                await clientApi.deleteClient(clientId).catch(() => {});
            }
        }
    }, 120_000);

    it('consent is required even after a different client has been consented (no cross-client leakage)', async () => {
        await fc.assert(
            fc.asyncProperty(
                fc.subarray(['openid', 'profile', 'email'], { minLength: 1 }),
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
                        // Grant consent for client A
                        const grantResponse = await fixture.getHttpServer()
                            .post('/api/oauth/consent')
                            .send({
                                email: 'admin@auth.server.com',
                                password: 'admin9000',
                                client_id: clientIdA,
                                code_challenge: CODE_CHALLENGE,
                                code_challenge_method: 'plain',
                                redirect_uri: REDIRECT_URI,
                                approved_scopes: requestedScopes,
                                consent_action: 'approve',
                                scope: requestedScopes.join(' '),
                            })
                            .set('Accept', 'application/json');
                        expect(grantResponse.status).toEqual(201);

                        // Client B has NO consent record — must still require consent
                        const responseB = await fixture.getHttpServer()
                            .post('/api/oauth/login')
                            .send({
                                email: 'admin@auth.server.com',
                                password: 'admin9000',
                                client_id: clientIdB,
                                code_challenge: CODE_CHALLENGE,
                                code_challenge_method: 'plain',
                                redirect_uri: REDIRECT_URI,
                                scope: requestedScopes.join(' '),
                            })
                            .set('Accept', 'application/json');

                        expect(responseB.status).toEqual(201);
                        expect(responseB.body.requires_consent).toBe(true);
                        expect(responseB.body.authentication_code).toBeUndefined();
                    } finally {
                        await clientApi.deleteClient(clientIdA).catch(() => {});
                        await clientApi.deleteClient(clientIdB).catch(() => {});
                    }
                },
            ),
            { numRuns: 10 },
        );
    }, 300_000);
});
