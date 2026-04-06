import * as fc from 'fast-check';
import {SharedTestFixture} from '../shared-test.fixture';
import {TokenFixture} from '../token.fixture';

/**
 * Feature: token-revocation, Property 1: Empty or whitespace tokens are rejected
 *
 * For any string composed entirely of whitespace (including the empty string),
 * submitting it as the `token` parameter to the revocation endpoint SHALL return
 * HTTP 400 with an `invalid_request` error, regardless of valid authentication.
 *
 * Validates: Requirements 1.2
 */
describe('Property 1: Empty or whitespace tokens are rejected', () => {
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

    // Generator: strings composed entirely of whitespace characters
    const whitespaceCharArb = fc.constantFrom(' ', '\t', '\n', '\r', '\f', '\v');
    const whitespaceArb = fc.array(whitespaceCharArb, {minLength: 0, maxLength: 20}).map(arr => arr.join(''));

    it('rejects whitespace-only token strings with 400 invalid_request', async () => {
        await fc.assert(
            fc.asyncProperty(whitespaceArb, async (token) => {
                const response = await fixture.getHttpServer()
                    .post('/api/oauth/revoke')
                    .send({ token })
                    .set('Authorization', `Bearer ${accessToken}`)
                    .set('Accept', 'application/json');

                expect(response.status).toEqual(400);
                expect(response.body.error).toEqual('invalid_request');
            }),
            {numRuns: 100},
        );
    }, 120_000);
});
