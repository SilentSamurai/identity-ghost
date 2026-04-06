import * as fc from 'fast-check';
import {SharedTestFixture} from '../shared-test.fixture';
import {TokenFixture} from '../token.fixture';
import {TenantClient} from '../api-client/tenant-client';
import {AdminTenantClient} from '../api-client/admin-tenant-client';

/**
 * Feature: token-revocation, Property 7: Tenant isolation prevents cross-tenant revocation
 *
 * For any refresh token belonging to tenant A and any authenticated caller belonging
 * to tenant B (where A != B), submitting the token for revocation SHALL return HTTP 200
 * but the token and its family SHALL remain unrevoked in the database.
 *
 * Approach: Create a second tenant and obtain a Bearer token via its tenant-level
 * credentials. For each iteration, obtain a refresh token from tenant A, attempt
 * revocation using tenant B's Bearer token, then verify the token is still usable.
 *
 * Validates: Requirements 9.3
 */
describe('Property 7: Tenant isolation prevents cross-tenant revocation', () => {
    let fixture: SharedTestFixture;
    let tokenFixture: TokenFixture;

    // Default tenant credentials (for obtaining and refreshing tokens)
    let tenantClientId: string;
    let tenantClientSecret: string;

    // Cross-tenant Bearer token
    let crossTenantAccessToken: string;

    beforeAll(async () => {
        fixture = new SharedTestFixture();
        tokenFixture = new TokenFixture(fixture);

        const adminResult = await tokenFixture.fetchAccessToken(
            'admin@auth.server.com',
            'admin9000',
            'auth.server.com',
        );

        // Get tenant credentials for refresh grants
        const creds = await fixture.getHttpServer()
            .get('/api/tenant/my/credentials')
            .set('Authorization', `Bearer ${adminResult.accessToken}`);
        tenantClientId = creds.body.clientId;
        tenantClientSecret = creds.body.clientSecret;

        // Create a second tenant
        const tenantClient = new TenantClient(fixture, adminResult.accessToken);
        const suffix = Date.now().toString().slice(-6);
        const crossTenant = await tenantClient.createTenant(
            `iso-${suffix}`,
            `iso-${suffix}.com`,
        );

        // Get the cross-tenant's tenant-level credentials and obtain a Bearer token
        const adminTenantClient = new AdminTenantClient(fixture, adminResult.accessToken);
        const crossCreds = await adminTenantClient.getTenantCredentials(crossTenant.id);
        const crossTokenResult = await tokenFixture.fetchClientCredentialsToken(
            crossCreds.clientId,
            crossCreds.clientSecret,
        );
        crossTenantAccessToken = crossTokenResult.accessToken;
    });

    afterAll(async () => {
        await fixture.close();
    });

    // Generator: just a counter to drive iterations (the real work is in the async body)
    const iterationArb = fc.integer({min: 0, max: 999});

    it('cross-tenant revocation returns 200 but token remains valid', async () => {
        await fc.assert(
            fc.asyncProperty(iterationArb, async (_iteration) => {
                // Get a fresh refresh token from the default tenant
                const result = await tokenFixture.fetchAccessToken(
                    'admin@auth.server.com',
                    'admin9000',
                    'auth.server.com',
                );

                // Attempt revocation using the cross-tenant Bearer token
                const revokeResponse = await fixture.getHttpServer()
                    .post('/api/oauth/revoke')
                    .send({ token: result.refreshToken })
                    .set('Authorization', `Bearer ${crossTenantAccessToken}`)
                    .set('Accept', 'application/json');

                // Should return 200 (no information leakage)
                expect(revokeResponse.status).toEqual(200);
                expect(revokeResponse.body).toEqual({});

                // Token should still be valid — not revoked
                const refreshResponse = await fixture.getHttpServer()
                    .post('/api/oauth/token')
                    .send({
                        grant_type: 'refresh_token',
                        refresh_token: result.refreshToken,
                        client_id: tenantClientId,
                        client_secret: tenantClientSecret,
                    })
                    .set('Accept', 'application/json');

                expect(refreshResponse.status).toEqual(201);
                expect(refreshResponse.body.access_token).toBeDefined();
            }),
            {numRuns: 100},
        );
    }, 120_000);
});
