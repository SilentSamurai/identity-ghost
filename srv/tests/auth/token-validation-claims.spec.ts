import {SharedTestFixture} from "../shared-test.fixture";
import {expect2xx} from "../api-client/client";

/**
 * Token Validation Claims Rejection Tests — RFC 9068 Compliance
 *
 * These integration tests verify that the token validation pipeline rejects
 * tokens with invalid claim structures per the updated SecurityContextSchema.
 *
 * Tests 1-3 craft malformed JWTs (signed with a dummy secret so they decode
 * but fail claim validation before signature verification) and send them to
 * a protected endpoint to confirm rejection with 401.
 *
 * Test 4 verifies that the security context resolves email and name from the
 * database (not from the JWT payload) after successful token validation.
 *
 * Validates: Requirements 9.2, 9.3, 9.4, 9.5
 */
describe('Token Validation Claims Rejection', () => {
    let app: SharedTestFixture;

    beforeAll(async () => {
        app = new SharedTestFixture();
    });

    afterAll(async () => {
        await app.close();
    });

    /**
     * Build a base payload that resembles a valid decoded access token.
     * Used as a starting point for crafting malformed tokens.
     */
    function buildBasePayload(): Record<string, any> {
        const now = Math.floor(Date.now() / 1000);
        return {
            iss: 'auth.server.com',
            sub: '00000000-0000-4000-8000-000000000001',
            aud: ['auth.server.com'],
            exp: now + 3600,
            iat: now,
            nbf: now,
            jti: '00000000-0000-4000-8000-000000000099',
            scope: 'openid profile email',
            client_id: 'auth.server.com',
            tenant_id: '00000000-0000-4000-8000-000000000002',
            grant_type: 'password',
            tenant: {
                id: '00000000-0000-4000-8000-000000000002',
                name: 'Auth Server',
                domain: 'auth.server.com',
            },
            roles: ['SUPER_ADMIN'],
        };
    }

    /**
     * Sign a payload as a JWT using a dummy secret.
     * The server will decode it successfully but reject it during claim
     * validation (before signature verification) if required claims are missing.
     */
    function signMalformedToken(payload: Record<string, any>): string {
        return app.jwtService().sign(payload, {secret: 'test-dummy-secret'});
    }

    it('should reject a token missing aud with 401', async () => {
        const payload = buildBasePayload();
        delete payload.aud;

        const malformedToken = signMalformedToken(payload);

        const response = await app.getHttpServer()
            .get('/api/users/me')
            .set('Authorization', `Bearer ${malformedToken}`)
            .set('Accept', 'application/json');

        expect(response.status).toEqual(401);
    });

    it('should reject a token missing jti with 401', async () => {
        const payload = buildBasePayload();
        delete payload.jti;

        const malformedToken = signMalformedToken(payload);

        const response = await app.getHttpServer()
            .get('/api/users/me')
            .set('Authorization', `Bearer ${malformedToken}`)
            .set('Accept', 'application/json');

        expect(response.status).toEqual(401);
    });

    it('should reject a token with aud as a bare string with 401', async () => {
        const payload = buildBasePayload();
        payload.aud = 'auth.server.com';

        const malformedToken = signMalformedToken(payload);

        const response = await app.getHttpServer()
            .get('/api/users/me')
            .set('Authorization', `Bearer ${malformedToken}`)
            .set('Accept', 'application/json');

        expect(response.status).toEqual(401);
    });

    it('should populate email and name in security context from DB', async () => {
        // Issue a valid token via password grant
        const tokenResponse = await app.getHttpServer()
            .post('/api/oauth/token')
            .send({
                grant_type: 'password',
                username: 'admin@auth.server.com',
                password: 'admin9000',
                client_id: 'auth.server.com',
            })
            .set('Accept', 'application/json');

        expect2xx(tokenResponse);
        const accessToken = tokenResponse.body.access_token;

        // Verify the JWT itself does NOT contain email or name
        const jwt = app.jwtService().decode(accessToken, {json: true}) as any;
        expect(jwt.email).toBeUndefined();
        expect(jwt.name).toBeUndefined();

        // Call /api/users/me — this endpoint reads email from the security context
        // which is populated from the DB during token validation (Requirement 9.5)
        const meResponse = await app.getHttpServer()
            .get('/api/users/me')
            .set('Authorization', `Bearer ${accessToken}`)
            .set('Accept', 'application/json');

        expect(meResponse.status).toEqual(200);
        // The endpoint resolves the user by email from the security context,
        // proving that email was populated from DB during validation
        expect(meResponse.body.email).toEqual('admin@auth.server.com');
        expect(meResponse.body.name).toBeDefined();
        expect(typeof meResponse.body.name).toBe('string');
    });
});
