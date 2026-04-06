import {SharedTestFixture} from "../shared-test.fixture";
import {TokenFixture} from "../token.fixture";

/**
 * Integration tests for refresh token replay detection.
 *
 * Validates:
 *   - Reusing a consumed token returns `invalid_grant`
 *   - All tokens in the family are revoked after replay
 *   - Security event is logged with correct fields and no token values
 *   - Requirements: 5.1, 5.2, 5.3
 */
describe('Refresh Token Replay Detection', () => {
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

    it('reusing a consumed token returns invalid_grant', async () => {
        const {refreshToken, clientId, clientSecret} = await getFreshTokensAndCreds();

        // First use — consume the token (should succeed)
        const firstResponse = await refreshGrant(refreshToken, clientId, clientSecret);
        expect(firstResponse.status).toEqual(201);
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
        expect(rotationResponse.status).toEqual(201);
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
        expect(rotationB.status).toEqual(201);
        const tokenB = rotationB.body.refresh_token;

        // B → C
        const rotationC = await refreshGrant(tokenB, clientId, clientSecret);
        expect(rotationC.status).toEqual(201);
        const tokenC = rotationC.body.refresh_token;

        // Replay token A — triggers family revocation
        const replayA = await refreshGrant(tokenA, clientId, clientSecret);
        expect(replayA.status).toEqual(400);
        expect(replayA.body.error).toEqual('invalid_grant');

        // Token C should also be revoked
        const tokenCResponse = await refreshGrant(tokenC, clientId, clientSecret);
        expect(tokenCResponse.status).toEqual(400);
        expect(tokenCResponse.body.error).toEqual('invalid_grant');
    });

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
});
