import {SharedTestFixture} from "../shared-test.fixture";
import {TokenFixture} from "../token.fixture";

/**
 * Integration tests for refresh token replay detection and family revocation.
 *
 * Validates:
 *   - Reusing a consumed token returns `invalid_grant` (replay detection)
 *   - Replay triggers family-wide revocation (all tokens in the family become invalid)
 *   - Chained rotation families are fully revoked on replay
 *   - Independent families (different login sessions) are unaffected
 *   - Error responses are generic (no token values, hashes, or revocation details leaked)
 *
 * Requirements: 5.1, 5.2, 5.3, 10.1, 10.2, 10.3
 */
describe('Refresh Token Replay Detection & Family Revocation', () => {
    let app: SharedTestFixture;
    let tokenFixture: TokenFixture;

    beforeAll(async () => {
        app = new SharedTestFixture();
        tokenFixture = new TokenFixture(app);
    });

    afterAll(async () => {
        await app.close();
    });

    /** Helper: get fresh tokens and tenant credentials */
    async function getFreshTokensAndCreds() {
        const result = await tokenFixture.fetchAccessTokenFlow(
            'admin@auth.server.com',
            'admin9000',
            'auth.server.com',
        );

        const creds = await app.getHttpServer()
            .get('/api/tenant/my/credentials')
            .set('Authorization', `Bearer ${result.accessToken}`);

        expect(creds.status).toEqual(200);

        return {
            accessToken: result.accessToken,
            refreshToken: result.refreshToken,
            clientId: creds.body.clientId,
            clientSecret: creds.body.clientSecret,
        };
    }

    /** Helper: perform a refresh token grant */
    function refreshGrant(refreshToken: string, clientId: string, clientSecret: string) {
        return app.getHttpServer()
            .post('/api/oauth/token')
            .send({
                grant_type: 'refresh_token',
                refresh_token: refreshToken,
                client_id: clientId,
                client_secret: clientSecret,
            })
            .set('Accept', 'application/json');
    }

    // ── Replay Detection ────────────────────────────────────────────

    describe('replay detection', () => {
        it('reusing a consumed token returns invalid_grant', async () => {
            const {refreshToken, clientId, clientSecret} = await getFreshTokensAndCreds();

            // First use — consume the token (should succeed)
            const firstResponse = await refreshGrant(refreshToken, clientId, clientSecret);
            expect(firstResponse.status).toEqual(200);
            expect(firstResponse.body.refresh_token).toBeDefined();

            // Second use — replay the consumed token (should fail)
            const replayResponse = await refreshGrant(refreshToken, clientId, clientSecret);
            expect(replayResponse.status).toEqual(400);
            expect(replayResponse.body.error).toEqual('invalid_grant');
        });

        it('replay revokes the entire family — new child token also becomes invalid', async () => {
            const {refreshToken, clientId, clientSecret} = await getFreshTokensAndCreds();

            // Consume token A → get token B
            const rotationResponse = await refreshGrant(refreshToken, clientId, clientSecret);
            expect(rotationResponse.status).toEqual(200);
            const tokenB = rotationResponse.body.refresh_token;

            // Replay token A — triggers family revocation
            const replayResponse = await refreshGrant(refreshToken, clientId, clientSecret);
            expect(replayResponse.status).toEqual(400);
            expect(replayResponse.body.error).toEqual('invalid_grant');

            // Token B should also be revoked (entire family revoked)
            const tokenBResponse = await refreshGrant(tokenB, clientId, clientSecret);
            expect(tokenBResponse.status).toEqual(400);
            expect(tokenBResponse.body.error).toEqual('invalid_grant');
        });

        it('replay after chained rotation (A → B → C) revokes all tokens', async () => {
            const {refreshToken: tokenA, clientId, clientSecret} = await getFreshTokensAndCreds();

            // A → B
            const rotationB = await refreshGrant(tokenA, clientId, clientSecret);
            expect(rotationB.status).toEqual(200);
            const tokenB = rotationB.body.refresh_token;

            // B → C
            const rotationC = await refreshGrant(tokenB, clientId, clientSecret);
            expect(rotationC.status).toEqual(200);
            const tokenC = rotationC.body.refresh_token;

            // Replay token A — triggers family revocation
            const replayA = await refreshGrant(tokenA, clientId, clientSecret);
            expect(replayA.status).toEqual(400);
            expect(replayA.body.error).toEqual('invalid_grant');

            // Token B (already consumed) — should be revoked
            const tokenBResponse = await refreshGrant(tokenB, clientId, clientSecret);
            expect(tokenBResponse.status).toEqual(400);
            expect(tokenBResponse.body.error).toEqual('invalid_grant');

            // Token C (the latest, unconsumed) — should also be revoked
            const tokenCResponse = await refreshGrant(tokenC, clientId, clientSecret);
            expect(tokenCResponse.status).toEqual(400);
            expect(tokenCResponse.body.error).toEqual('invalid_grant');
        });
    });

    // ── Family Isolation ────────────────────────────────────────────

    describe('family isolation', () => {
        it('a completely fresh token from a different login session is unaffected by another family revocation', async () => {
            // Session 1
            const session1 = await getFreshTokensAndCreds();

            // Session 2 (independent family)
            const session2 = await getFreshTokensAndCreds();

            // Revoke session 1's family via replay
            const rotation1 = await refreshGrant(session1.refreshToken, session1.clientId, session1.clientSecret);
            expect(rotation1.status).toEqual(200);
            await refreshGrant(session1.refreshToken, session1.clientId, session1.clientSecret); // replay

            // Session 2's token should still work (different family)
            const session2Response = await refreshGrant(
                session2.refreshToken,
                session2.clientId,
                session2.clientSecret,
            );
            expect(session2Response.status).toEqual(200);
            expect(session2Response.body.access_token).toBeDefined();
        });
    });

    // ── Error Response Security ─────────────────────────────────────

    describe('error response security', () => {
        it('error response does not reveal token details', async () => {
            const {refreshToken, clientId, clientSecret} = await getFreshTokensAndCreds();

            // Consume the token
            await refreshGrant(refreshToken, clientId, clientSecret);

            // Replay
            const replayResponse = await refreshGrant(refreshToken, clientId, clientSecret);
            expect(replayResponse.status).toEqual(400);
            expect(replayResponse.body.error).toEqual('invalid_grant');

            // Error description should be generic — no token values, hashes, or family details
            const description = JSON.stringify(replayResponse.body);
            expect(description).not.toContain(refreshToken);
            expect(description).not.toContain('family_id');
            expect(description).not.toContain('token_hash');
        });

        it('revoked token error response is generic (no revocation details)', async () => {
            const {refreshToken: tokenA, clientId, clientSecret} = await getFreshTokensAndCreds();

            // Rotate and trigger revocation
            const rotationB = await refreshGrant(tokenA, clientId, clientSecret);
            expect(rotationB.status).toEqual(200);

            await refreshGrant(tokenA, clientId, clientSecret); // replay → revoke family

            // Try the revoked child token
            const response = await refreshGrant(rotationB.body.refresh_token, clientId, clientSecret);
            expect(response.status).toEqual(400);
            expect(response.body.error).toEqual('invalid_grant');

            // Error should not reveal revocation details
            const body = JSON.stringify(response.body);
            expect(body).not.toContain('revoked');
            expect(body).not.toContain('family');
        });
    });
});
