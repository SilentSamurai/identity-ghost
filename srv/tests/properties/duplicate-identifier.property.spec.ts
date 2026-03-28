import * as fc from 'fast-check';
import { SharedTestFixture } from '../shared-test.fixture';
import { TokenFixture } from '../token.fixture';

/**
 * Feature: shared-test-infrastructure, Property 6: Duplicate identifier constraint enforcement
 *
 * For any entity type managed by the Shared_App and any unique identifier value,
 * inserting two entities with the same identifier through the Shared_App's HTTP API
 * should result in the second insert returning a database constraint error (4xx status code).
 *
 * Approach: Use tenant creation (POST /api/tenant/create) with duplicate domains.
 * The TenantService checks for existing domains and throws BadRequestException (400)
 * when a domain is already taken.
 *
 * Validates: Requirements 10.3
 */
describe('Property 6: Duplicate identifier constraint enforcement', () => {
    let fixture: SharedTestFixture;
    let accessToken: string;

    beforeAll(async () => {
        fixture = new SharedTestFixture();
        const tokenFixture = new TokenFixture(fixture);
        const response = await tokenFixture.fetchAccessToken(
            'admin@auth.server.com',
            'admin9000',
            'auth.server.com',
        );
        accessToken = response.accessToken;
    });

    afterAll(async () => {
        await fixture.close();
    });

    // Generator: 8-char lowercase alpha string for unique suffixes
    const suffixArb = fc.stringMatching(/^[a-z]{8}$/);

    it('creating two tenants with the same domain returns 4xx on the second attempt', async () => {
        await fc.assert(
            fc.asyncProperty(
                suffixArb,
                async (suffix) => {
                    const name = `dp-${suffix}`;
                    const domain = `dp-${suffix}.test.com`;

                    // First creation should succeed
                    const res1 = await fixture.getHttpServer()
                        .post('/api/tenant/create')
                        .send({ name, domain })
                        .set('Authorization', `Bearer ${accessToken}`)
                        .set('Accept', 'application/json');
                    expect(res1.status).toBe(201);

                    // Second creation with same domain should fail with 4xx
                    const res2 = await fixture.getHttpServer()
                        .post('/api/tenant/create')
                        .send({ name: `${name}x`, domain })
                        .set('Authorization', `Bearer ${accessToken}`)
                        .set('Accept', 'application/json');
                    expect(res2.status).toBeGreaterThanOrEqual(400);
                    expect(res2.status).toBeLessThan(500);
                },
            ),
            { numRuns: 5 },
        );
    });
});
