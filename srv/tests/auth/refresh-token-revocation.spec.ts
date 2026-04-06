import {SharedTestFixture} from "../shared-test.fixture";
import {TokenFixture} from "../token.fixture";

/**
 * Integration tests for refresh token revocation.
 *
 * Validates:
 *   - Revoking a token revokes all family members
 *   - Using a revoked token returns invalid_grant
 *   - Revoked flag is checked before atomic consumption
 *   - Requirements: 10.1, 10.2, 10.3
 */
describe('Refresh Token Revocation', () => {
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
        const result = await tokenFixture.fetchAccessToken(
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

    it('using a revoked token returns invalid_grant', async () => {
        const {refreshToken: tokenA, clientId, clientSecret} = await getFreshTokensAndCreds();

        // Rotate A → B
        const rotationB = await refreshGrant(tokenA, clientId, clientSecret);
        expect(rotationB.status).toEqual(201);

        // Replay token A — triggers family revocation (all tokens in family revoked)
        const replayResponse = await refreshGrant(tokenA, clientId, clientSecret);
        expect(replayResponse.status).toEqual(400);
        expect(replayResponse.body.error).toEqual('invalid_grant');

        // Token B is now revoked — using it should return invalid_grant
        const tokenBResponse = await refreshGrant(rotationB.body.refresh_token, clientId, clientSecret);
        expect(tokenBResponse.status).toEqual(400);
        expect(tokenBResponse.body.error).toEqual('invalid_grant');
    });

    it('family revocation revokes all members in a chain', async () => {
        const {refreshToken: tokenA, clientId, clientSecret} = await getFreshTokensAndCreds();

        // Build a chain: A → B → C
        const rotationB = await refreshGrant(tokenA, clientId, clientSecret);
        expect(rotationB.status).toEqual(201);
        const tokenB = rotationB.body.refresh_token;

        const rotationC = await refreshGrant(tokenB, clientId, clientSecret);
        expect(rotationC.status).toEqual(201);
        const tokenC = rotationC.body.refresh_token;

        // Replay token A — triggers family revocation
        const replayA = await refreshGrant(tokenA, clientId, clientSecret);
        expect(replayA.status).toEqual(400);

        // Token B (already consumed) — should be revoked
        const tokenBResponse = await refreshGrant(tokenB, clientId, clientSecret);
        expect(tokenBResponse.status).toEqual(400);
        expect(tokenBResponse.body.error).toEqual('invalid_grant');

        // Token C (the latest, unconsumed) — should also be revoked
        const tokenCResponse = await refreshGrant(tokenC, clientId, clientSecret);
        expect(tokenCResponse.status).toEqual(400);
        expect(tokenCResponse.body.error).toEqual('invalid_grant');
    });

    it('revoked token error response is generic (no revocation details)', async () => {
        const {refreshToken: tokenA, clientId, clientSecret} = await getFreshTokensAndCreds();

        // Rotate and trigger revocation
        const rotationB = await refreshGrant(tokenA, clientId, clientSecret);
        expect(rotationB.status).toEqual(201);

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

    it('a completely fresh token from a different login session is unaffected by another family revocation', async () => {
        // Session 1
        const session1 = await getFreshTokensAndCreds();

        // Session 2 (independent family)
        const session2 = await getFreshTokensAndCreds();

        // Revoke session 1's family via replay
        const rotation1 = await refreshGrant(session1.refreshToken, session1.clientId, session1.clientSecret);
        expect(rotation1.status).toEqual(201);
        await refreshGrant(session1.refreshToken, session1.clientId, session1.clientSecret); // replay

        // Session 2's token should still work (different family)
        const session2Response = await refreshGrant(
            session2.refreshToken,
            session2.clientId,
            session2.clientSecret,
        );
        expect(session2Response.status).toEqual(201);
        expect(session2Response.body.access_token).toBeDefined();
    });
});
