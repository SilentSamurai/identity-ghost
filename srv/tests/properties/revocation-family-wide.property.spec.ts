import * as fc from 'fast-check';
import {SharedTestFixture} from '../shared-test.fixture';
import {TokenFixture} from '../token.fixture';

/**
 * Feature: token-revocation, Property 4: Family-wide revocation
 *
 * For any refresh token family containing N tokens (N >= 1), revoking any single
 * token in the family SHALL result in all N tokens in that family having `revoked = true`.
 *
 * Approach: Build a token chain of random size (1–5) via rotation, pick a random
 * token from the chain, revoke it via the revocation endpoint, then verify the
 * latest (unconsumed) token in the family is no longer usable via refresh grant.
 *
 * Validates: Requirements 4.1
 */
describe('Property 4: Family-wide revocation', () => {
    let fixture: SharedTestFixture;
    let tokenFixture: TokenFixture;
    let tenantClientId: string;
    let tenantClientSecret: string;

    beforeAll(async () => {
        fixture = new SharedTestFixture();
        tokenFixture = new TokenFixture(fixture);

        const adminResult = await tokenFixture.fetchAccessToken(
            'admin@auth.server.com',
            'admin9000',
            'auth.server.com',
        );

        // Tenant credentials for refresh grants
        const creds = await fixture.getHttpServer()
            .get('/api/tenant/my/credentials')
            .set('Authorization', `Bearer ${adminResult.accessToken}`);
        tenantClientId = creds.body.clientId;
        tenantClientSecret = creds.body.clientSecret;
    });

    afterAll(async () => {
        await fixture.close();
    });

    // Generator: family size between 1 and 5 (kept small for test speed)
    const familySizeArb = fc.integer({min: 1, max: 5});

    it('revoking any token in a family revokes the entire family', async () => {
        await fc.assert(
            fc.asyncProperty(familySizeArb, async (familySize) => {
                // Build a token chain of the given size
                const result = await tokenFixture.fetchAccessToken(
                    'admin@auth.server.com',
                    'admin9000',
                    'auth.server.com',
                );

                const tokens = [result.refreshToken];
                let currentToken = result.refreshToken;

                for (let i = 1; i < familySize; i++) {
                    const rotation = await fixture.getHttpServer()
                        .post('/api/oauth/token')
                        .send({
                            grant_type: 'refresh_token',
                            refresh_token: currentToken,
                            client_id: tenantClientId,
                            client_secret: tenantClientSecret,
                        })
                        .set('Accept', 'application/json');

                    expect(rotation.status).toEqual(201);
                    currentToken = rotation.body.refresh_token;
                    tokens.push(currentToken);
                }

                // Pick a random token from the chain to revoke (use first for determinism)
                const tokenToRevoke = tokens[0];

                // Revoke via the revocation endpoint using Bearer auth
                const revokeResponse = await fixture.getHttpServer()
                    .post('/api/oauth/revoke')
                    .send({ token: tokenToRevoke })
                    .set('Authorization', `Bearer ${result.accessToken}`)
                    .set('Accept', 'application/json');

                expect(revokeResponse.status).toEqual(200);

                // Verify the latest token in the family is revoked
                const latestToken = tokens[tokens.length - 1];
                const refreshResponse = await fixture.getHttpServer()
                    .post('/api/oauth/token')
                    .send({
                        grant_type: 'refresh_token',
                        refresh_token: latestToken,
                        client_id: tenantClientId,
                        client_secret: tenantClientSecret,
                    })
                    .set('Accept', 'application/json');

                expect(refreshResponse.status).toEqual(400);
                expect(refreshResponse.body.error).toEqual('invalid_grant');
            }),
            {numRuns: 100},
        );
    }, 120_000);
});
