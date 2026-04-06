import * as fc from 'fast-check';
import {SharedTestFixture} from '../shared-test.fixture';
import {TokenFixture} from '../token.fixture';

/**
 * Feature: token-revocation, Property 6: Uniform response for any token string
 *
 * For any token string — whether it matches a valid refresh token, an expired token,
 * an already-revoked token, or a completely random string — the revocation endpoint
 * SHALL return an identical response: HTTP 200 with body `{}`, `Cache-Control: no-store`,
 * and `Pragma: no-cache`, provided authentication succeeds.
 *
 * No information about token existence or state is leaked.
 *
 * Validates: Requirements 5.1, 5.2, 9.1
 */
describe('Property 6: Uniform response for any token string', () => {
    let fixture: SharedTestFixture;
    let accessToken: string;

    beforeAll(async () => {
        fixture = new SharedTestFixture();
        const tokenFixture = new TokenFixture(fixture);

        const adminResult = await tokenFixture.fetchAccessToken(
            'admin@auth.server.com',
            'admin9000',
            'auth.server.com',
        );
        accessToken = adminResult.accessToken;
    });

    afterAll(async () => {
        await fixture.close();
    });

    // Generator: arbitrary non-empty strings (to avoid triggering the empty-token validation)
    const tokenArb = fc.string({minLength: 1, maxLength: 256}).filter(s => s.trim().length > 0);

    it('returns identical HTTP 200 with {} body and correct headers for any token string', async () => {
        await fc.assert(
            fc.asyncProperty(tokenArb, async (token) => {
                const response = await fixture.getHttpServer()
                    .post('/api/oauth/revoke')
                    .send({ token })
                    .set('Authorization', `Bearer ${accessToken}`)
                    .set('Accept', 'application/json');

                expect(response.status).toEqual(200);
                expect(response.body).toEqual({});
                expect(response.headers['cache-control']).toEqual('no-store');
                expect(response.headers['pragma']).toEqual('no-cache');
            }),
            {numRuns: 100},
        );
    }, 120_000);
});
