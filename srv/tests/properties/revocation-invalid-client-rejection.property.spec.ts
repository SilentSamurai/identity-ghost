import * as fc from 'fast-check';
import {SharedTestFixture} from '../shared-test.fixture';

/**
 * Feature: token-revocation, Property 2: Unauthenticated requests are rejected
 *
 * For any request to the revocation endpoint without a valid Bearer token
 * (or Basic auth), the endpoint SHALL return HTTP 401.
 *
 * Validates: Requirements 2.1, 2.5, 2.6
 */
describe('Property 2: Unauthenticated requests are rejected', () => {
    let fixture: SharedTestFixture;

    beforeAll(async () => {
        fixture = new SharedTestFixture();
    });

    afterAll(async () => {
        await fixture.close();
    });

    // Generator: random strings for fake Bearer tokens
    const fakeTokenArb = fc.string({minLength: 1, maxLength: 128}).filter(s => s.trim().length > 0);

    it('rejects invalid Bearer tokens with 401', async () => {
        await fc.assert(
            fc.asyncProperty(fakeTokenArb, async (fakeToken) => {
                const response = await fixture.getHttpServer()
                    .post('/api/oauth/revoke')
                    .send({ token: 'some-token-value' })
                    .set('Authorization', `Bearer ${fakeToken}`)
                    .set('Accept', 'application/json');

                expect(response.status).toEqual(401);
            }),
            {numRuns: 100},
        );
    }, 120_000);
});
