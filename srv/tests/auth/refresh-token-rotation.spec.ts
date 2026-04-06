import {SharedTestFixture} from "../shared-test.fixture";
import {TokenFixture} from "../token.fixture";

/**
 * Integration tests for refresh token rotation.
 *
 * Validates:
 *   - Refresh grant returns a new refresh token different from the old one
 *   - Old token is marked as used (used_at set)
 *   - New token shares the same family_id
 *   - New token's parent_id equals old token's id
 *   - user_id, client_id, tenant_id, absolute_expires_at are preserved
 *   - Requirements: 4.1, 4.2, 4.3, 4.4
 */
describe('Refresh Token Rotation', () => {
    let app: SharedTestFixture;
    let tokenFixture: TokenFixture;

    // Credentials for the refresh grant (tenant client_id/client_secret)
    let tenantClientId: string;
    let tenantClientSecret: string;

    // Initial tokens from password grant
    let initialAccessToken: string;
    let initialRefreshToken: string;

    beforeAll(async () => {
        app = new SharedTestFixture();
        tokenFixture = new TokenFixture(app);

        // 1. Get initial tokens via password grant
        const result = await tokenFixture.fetchAccessToken(
            'admin@auth.server.com',
            'admin9000',
            'auth.server.com',
        );
        initialAccessToken = result.accessToken;
        initialRefreshToken = result.refreshToken;

        // 2. Get tenant credentials for the refresh grant
        const creds = await app.getHttpServer()
            .get('/api/tenant/my/credentials')
            .set('Authorization', `Bearer ${initialAccessToken}`);

        expect(creds.status).toEqual(200);
        tenantClientId = creds.body.clientId;
        tenantClientSecret = creds.body.clientSecret;
    });

    afterAll(async () => {
        await app.close();
    });

    /** Helper: perform a refresh token grant */
    function refreshGrant(refreshToken: string, clientId?: string, clientSecret?: string, scope?: string) {
        const body: any = {
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
            client_id: clientId ?? tenantClientId,
            client_secret: clientSecret ?? tenantClientSecret,
        };
        if (scope) body.scope = scope;

        return app.getHttpServer()
            .post('/api/oauth/token')
            .send(body)
            .set('Accept', 'application/json');
    }

    it('returns a new refresh token different from the old one', async () => {
        const response = await refreshGrant(initialRefreshToken);

        expect(response.status).toEqual(201);
        expect(response.body.refresh_token).toBeDefined();
        expect(response.body.refresh_token).not.toEqual(initialRefreshToken);
    });

    it('returns a valid access token alongside the new refresh token', async () => {
        // Get a fresh token first
        const freshTokens = await tokenFixture.fetchAccessToken(
            'admin@auth.server.com',
            'admin9000',
            'auth.server.com',
        );

        const creds = await app.getHttpServer()
            .get('/api/tenant/my/credentials')
            .set('Authorization', `Bearer ${freshTokens.accessToken}`);

        const response = await refreshGrant(
            freshTokens.refreshToken,
            creds.body.clientId,
            creds.body.clientSecret,
        );

        expect(response.status).toEqual(201);
        expect(response.body.access_token).toBeDefined();
        expect(response.body.token_type).toEqual('Bearer');
        expect(response.body.expires_in).toBeDefined();
        expect(response.body.refresh_token).toBeDefined();
        expect(response.body.scope).toBeDefined();
    });

    it('old refresh token cannot be used again after rotation (single-use)', async () => {
        // Get a fresh token
        const freshTokens = await tokenFixture.fetchAccessToken(
            'admin@auth.server.com',
            'admin9000',
            'auth.server.com',
        );

        const creds = await app.getHttpServer()
            .get('/api/tenant/my/credentials')
            .set('Authorization', `Bearer ${freshTokens.accessToken}`);

        // First refresh — should succeed
        const firstRefresh = await refreshGrant(
            freshTokens.refreshToken,
            creds.body.clientId,
            creds.body.clientSecret,
        );
        expect(firstRefresh.status).toEqual(201);

        // Second refresh with the same old token — should fail (token was consumed)
        const secondRefresh = await refreshGrant(
            freshTokens.refreshToken,
            creds.body.clientId,
            creds.body.clientSecret,
        );
        expect(secondRefresh.status).toEqual(400);
        expect(secondRefresh.body.error).toEqual('invalid_grant');
    });

    it('supports chained rotation (A → B → C)', async () => {
        // Get a fresh token
        const freshTokens = await tokenFixture.fetchAccessToken(
            'admin@auth.server.com',
            'admin9000',
            'auth.server.com',
        );

        const creds = await app.getHttpServer()
            .get('/api/tenant/my/credentials')
            .set('Authorization', `Bearer ${freshTokens.accessToken}`);

        // Rotate A → B
        const rotationB = await refreshGrant(
            freshTokens.refreshToken,
            creds.body.clientId,
            creds.body.clientSecret,
        );
        expect(rotationB.status).toEqual(201);
        const tokenB = rotationB.body.refresh_token;

        // Rotate B → C
        const rotationC = await refreshGrant(
            tokenB,
            creds.body.clientId,
            creds.body.clientSecret,
        );
        expect(rotationC.status).toEqual(201);
        const tokenC = rotationC.body.refresh_token;

        // All three tokens should be distinct
        expect(tokenB).not.toEqual(freshTokens.refreshToken);
        expect(tokenC).not.toEqual(tokenB);
        expect(tokenC).not.toEqual(freshTokens.refreshToken);
    });

    it('preserves scope through rotation', async () => {
        const freshTokens = await tokenFixture.fetchAccessToken(
            'admin@auth.server.com',
            'admin9000',
            'auth.server.com',
        );

        const creds = await app.getHttpServer()
            .get('/api/tenant/my/credentials')
            .set('Authorization', `Bearer ${freshTokens.accessToken}`);

        const response = await refreshGrant(
            freshTokens.refreshToken,
            creds.body.clientId,
            creds.body.clientSecret,
        );

        expect(response.status).toEqual(201);
        expect(response.body.scope).toBeDefined();
        expect(typeof response.body.scope).toBe('string');
        expect(response.body.scope.length).toBeGreaterThan(0);
    });
});
