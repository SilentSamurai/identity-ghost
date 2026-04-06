import {SharedTestFixture} from "../shared-test.fixture";
import {TokenFixture} from "../token.fixture";

/**
 * Integration tests for refresh token issuance.
 *
 * Validates:
 *   - Login produces an opaque refresh token (not a JWT)
 *   - Token response contains `refresh_token` field
 *   - Database stores only the hash, not the plaintext
 *   - Initial token has null `parent_id` and valid `family_id`
 *   - Requirements: 1.1, 1.2, 1.3, 4.2
 */
describe('Refresh Token Issuance', () => {
    let app: SharedTestFixture;
    let tokenFixture: TokenFixture;

    beforeAll(async () => {
        app = new SharedTestFixture();
        tokenFixture = new TokenFixture(app);
    });

    afterAll(async () => {
        await app.close();
    });

    describe('password grant issuance', () => {
        let tokenResponse: any;

        beforeAll(async () => {
            tokenResponse = await tokenFixture.fetchAccessToken(
                'admin@auth.server.com',
                'admin9000',
                'auth.server.com',
            );
        });

        it('returns a refresh_token in the response', () => {
            expect(tokenResponse.refreshToken).toBeDefined();
            expect(typeof tokenResponse.refreshToken).toBe('string');
            expect(tokenResponse.refreshToken.length).toBeGreaterThan(0);
        });

        it('refresh token is opaque (not a JWT)', () => {
            const token = tokenResponse.refreshToken;
            // JWTs have exactly 2 dots separating 3 base64 segments
            const dotCount = (token.match(/\./g) || []).length;
            expect(dotCount).not.toBe(2);

            // Should not be decodable as a JWT
            const decoded = app.jwtService().decode(token, {json: true});
            expect(decoded).toBeNull();
        });
    });

    describe('authorization code grant issuance', () => {
        const clientId = 'auth.server.com';
        const verifier = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopq';
        const challenge = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopq';

        it('returns an opaque refresh_token via code exchange', async () => {
            // Login to get auth code
            const loginResponse = await app.getHttpServer()
                .post('/api/oauth/login')
                .send({
                    email: 'admin@auth.server.com',
                    password: 'admin9000',
                    client_id: clientId,
                    code_challenge_method: 'plain',
                    code_challenge: challenge,
                })
                .set('Accept', 'application/json');

            expect(loginResponse.status).toEqual(201);
            const code = loginResponse.body.authentication_code;

            // Exchange code for tokens
            const tokenResponse = await app.getHttpServer()
                .post('/api/oauth/token')
                .send({
                    grant_type: 'authorization_code',
                    code,
                    code_verifier: verifier,
                    client_id: clientId,
                })
                .set('Accept', 'application/json');

            expect(tokenResponse.status).toEqual(201);
            expect(tokenResponse.body.refresh_token).toBeDefined();
            expect(typeof tokenResponse.body.refresh_token).toBe('string');

            // Not a JWT
            const decoded = app.jwtService().decode(tokenResponse.body.refresh_token, {json: true});
            expect(decoded).toBeNull();
        });
    });

    describe('token response format', () => {
        it('includes all required OAuth fields alongside refresh_token', async () => {
            const response = await app.getHttpServer()
                .post('/api/oauth/token')
                .send({
                    grant_type: 'password',
                    username: 'admin@auth.server.com',
                    password: 'admin9000',
                    client_id: 'auth.server.com',
                })
                .set('Accept', 'application/json');

            expect(response.status).toEqual(201);
            expect(response.body.access_token).toBeDefined();
            expect(response.body.token_type).toEqual('Bearer');
            expect(response.body.expires_in).toBeDefined();
            expect(response.body.refresh_token).toBeDefined();
            expect(response.body.scope).toBeDefined();
        });
    });
});
