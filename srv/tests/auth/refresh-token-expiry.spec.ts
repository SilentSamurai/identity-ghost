import {SharedTestFixture} from "../shared-test.fixture";
import {TokenFixture} from "../token.fixture";

/**
 * Integration tests for refresh token expiry enforcement.
 *
 * Since SharedTestFixture connects to a shared global app (no direct DB access
 * or config override), these tests verify expiry behavior indirectly:
 *   - Valid tokens within expiry window succeed
 *   - The response format is correct for successful refreshes
 *   - Invalid/garbage tokens are rejected (simulates expired-like behavior)
 *
 * Direct expiry testing (manipulating timestamps) requires DB access and is
 * covered by the property-based tests (Property 5, 8) and unit-level tests.
 *
 * Validates:
 *   - Requirements: 7.1, 7.2, 7.3, 7.4
 */
describe('Refresh Token Expiry', () => {
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

    it('token within sliding expiry window succeeds', async () => {
        const {refreshToken, clientId, clientSecret} = await getFreshTokensAndCreds();

        // Token was just issued — well within the 7d sliding window
        const response = await refreshGrant(refreshToken, clientId, clientSecret);
        expect(response.status).toEqual(201);
        expect(response.body.access_token).toBeDefined();
        expect(response.body.refresh_token).toBeDefined();
    });

    it('expired token returns invalid_grant (simulated via invalid token)', async () => {
        const {clientId, clientSecret} = await getFreshTokensAndCreds();

        // A token that doesn't exist in the DB simulates an expired/purged token
        const response = await refreshGrant(
            'expired-token-that-does-not-exist-in-database',
            clientId,
            clientSecret,
        );

        expect(response.status).toEqual(400);
        expect(response.body.error).toEqual('invalid_grant');
    });

    it('expiry error response uses generic message (no timing details)', async () => {
        const {clientId, clientSecret} = await getFreshTokensAndCreds();

        const response = await refreshGrant(
            'nonexistent-token-simulating-expiry',
            clientId,
            clientSecret,
        );

        expect(response.status).toEqual(400);
        expect(response.body.error).toEqual('invalid_grant');

        // Error should not reveal expiry details
        const body = JSON.stringify(response.body);
        expect(body).not.toContain('expires_at');
        expect(body).not.toContain('absolute_expires_at');
        expect(body).not.toContain('sliding');
    });

    it('rotation produces a token with valid expiry (can be used immediately)', async () => {
        const {refreshToken, clientId, clientSecret} = await getFreshTokensAndCreds();

        // Rotate A → B
        const rotationB = await refreshGrant(refreshToken, clientId, clientSecret);
        expect(rotationB.status).toEqual(201);
        const tokenB = rotationB.body.refresh_token;

        // Use B immediately — should succeed (new sliding expiry was just set)
        const rotationC = await refreshGrant(tokenB, clientId, clientSecret);
        expect(rotationC.status).toEqual(201);
        expect(rotationC.body.access_token).toBeDefined();
        expect(rotationC.body.refresh_token).toBeDefined();
    });
});
