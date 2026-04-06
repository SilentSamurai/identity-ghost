import * as fc from 'fast-check';
import {SharedTestFixture} from '../shared-test.fixture';
import {TokenFixture} from '../token.fixture';

/**
 * Feature: token-revocation, Property 3: Unrecognized token_type_hint is ignored
 *
 * For any arbitrary string value of `token_type_hint` (including empty, null, or
 * random strings), the revocation endpoint SHALL still successfully revoke a valid
 * refresh token and return HTTP 200 — the hint never causes a lookup failure.
 *
 * Validates: Requirements 3.3
 */
describe('Property 3: Unrecognized token_type_hint is ignored', () => {
    let fixture: SharedTestFixture;
    let tokenFixture: TokenFixture;

    beforeAll(async () => {
        fixture = new SharedTestFixture();
        tokenFixture = new TokenFixture(fixture);
    });

    afterAll(async () => {
        await fixture.close();
    });

    // Generator: arbitrary strings for token_type_hint
    const hintArb = fc.string({minLength: 0, maxLength: 100});

    it('revocation succeeds with any token_type_hint value', async () => {
        await fc.assert(
            fc.asyncProperty(hintArb, async (hint) => {
                // Get a fresh access token and refresh token for each iteration
                const result = await tokenFixture.fetchAccessToken(
                    'admin@auth.server.com',
                    'admin9000',
                    'auth.server.com',
                );

                const response = await fixture.getHttpServer()
                    .post('/api/oauth/revoke')
                    .send({
                        token: result.refreshToken,
                        token_type_hint: hint,
                    })
                    .set('Authorization', `Bearer ${result.accessToken}`)
                    .set('Accept', 'application/json');

                expect(response.status).toEqual(200);
                expect(response.body).toEqual({});
            }),
            {numRuns: 100},
        );
    }, 120_000);
});
