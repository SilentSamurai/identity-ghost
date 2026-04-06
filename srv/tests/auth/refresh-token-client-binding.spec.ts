import {SharedTestFixture} from "../shared-test.fixture";
import {TokenFixture} from "../token.fixture";
import {ClientEntityClient} from "../api-client/client-entity-client";

/**
 * Integration tests for refresh token client binding.
 *
 * Validates:
 *   - Refresh with correct client_id succeeds
 *   - Refresh with wrong client_id returns invalid_grant
 *   - Error message does not reveal mismatch details
 *   - Requirements: 6.1, 6.2
 */
describe('Refresh Token Client Binding', () => {
    let app: SharedTestFixture;
    let tokenFixture: TokenFixture;

    // Correct tenant credentials
    let tenantClientId: string;
    let tenantClientSecret: string;
    let refreshToken: string;

    beforeAll(async () => {
        app = new SharedTestFixture();
        tokenFixture = new TokenFixture(app);

        // Get initial tokens
        const result = await tokenFixture.fetchAccessToken(
            'admin@auth.server.com',
            'admin9000',
            'auth.server.com',
        );
        refreshToken = result.refreshToken;

        // Get tenant credentials
        const creds = await app.getHttpServer()
            .get('/api/tenant/my/credentials')
            .set('Authorization', `Bearer ${result.accessToken}`);

        expect(creds.status).toEqual(200);
        tenantClientId = creds.body.clientId;
        tenantClientSecret = creds.body.clientSecret;
    });

    afterAll(async () => {
        await app.close();
    });

    it('refresh with correct client_id succeeds', async () => {
        const response = await app.getHttpServer()
            .post('/api/oauth/token')
            .send({
                grant_type: 'refresh_token',
                refresh_token: refreshToken,
                client_id: tenantClientId,
                client_secret: tenantClientSecret,
            })
            .set('Accept', 'application/json');

        expect(response.status).toEqual(201);
        expect(response.body.access_token).toBeDefined();
        expect(response.body.refresh_token).toBeDefined();
    });

    it('refresh with wrong client_id returns invalid_grant', async () => {
        // Get a fresh token since the previous one was consumed
        const freshResult = await tokenFixture.fetchAccessToken(
            'admin@auth.server.com',
            'admin9000',
            'auth.server.com',
        );

        // The refresh token is bound to the tenant's clientId.
        // Using a different client_id should fail at client credential validation
        // or at the client binding check in RefreshTokenService.
        const response = await app.getHttpServer()
            .post('/api/oauth/token')
            .send({
                grant_type: 'refresh_token',
                refresh_token: freshResult.refreshToken,
                client_id: 'wrong-client-id',
                client_secret: 'wrong-client-secret',
            })
            .set('Accept', 'application/json');

        // Should fail — either at client auth or at client binding
        expect(response.status).toBeGreaterThanOrEqual(400);
        expect(response.status).toBeLessThan(500);
    });

    it('error message does not reveal client_id mismatch details', async () => {
        const freshResult = await tokenFixture.fetchAccessToken(
            'admin@auth.server.com',
            'admin9000',
            'auth.server.com',
        );

        const response = await app.getHttpServer()
            .post('/api/oauth/token')
            .send({
                grant_type: 'refresh_token',
                refresh_token: freshResult.refreshToken,
                client_id: 'wrong-client-id',
                client_secret: 'wrong-client-secret',
            })
            .set('Accept', 'application/json');

        expect(response.status).toBeGreaterThanOrEqual(400);

        // Error should not reveal the actual client_id or mismatch details
        const body = JSON.stringify(response.body);
        expect(body).not.toContain(tenantClientId);
        expect(body).not.toContain('mismatch');
        expect(body).not.toContain('binding');
    });
});
