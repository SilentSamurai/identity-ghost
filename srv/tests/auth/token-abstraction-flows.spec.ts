import {SharedTestFixture} from "../shared-test.fixture";
import {TokenFixture} from "../token.fixture";
import {JwtService} from "@nestjs/jwt";

/**
 * Integration tests for the OAuth token abstraction layer after the scope model refactoring.
 *
 * Verifies that all grant types (password, client_credentials, refresh_token) produce tokens
 * with OAuth scopes (e.g. tenant.read, tenant.write) instead of the old role-based scopes
 * (SUPER_ADMIN, TENANT_ADMIN, etc.), and that the token verification endpoint still works.
 */
describe('Token Abstraction Flows', () => {
    let app: SharedTestFixture;
    let jwtService: JwtService;
    let passwordGrantResponse: any;
    let clientId: string;
    let clientSecret: string;

    beforeAll(async () => {
        app = new SharedTestFixture();
        jwtService = new JwtService({}); // Used for decoding only
    });

    afterAll(async () => {
        await app.close();
    });

    // Authenticate via password grant and verify the response contains both tokens.
    describe('Password Grant Flow (Task 7.2)', () => {
        it('should obtain tokens via password grant', async () => {
            const tokenFixture = new TokenFixture(app);
            const response = await tokenFixture.fetchAccessToken(
                "admin@auth.server.com",
                "admin9000",
                "auth.server.com"
            );
            passwordGrantResponse = response;

            expect(passwordGrantResponse.accessToken).toBeDefined();
            expect(passwordGrantResponse.refreshToken).toBeDefined();
            // passwordGrantResponse.token_type is not returned by TokenFixture.fetchAccessToken
            // expect(passwordGrantResponse.token_type).toEqual('Bearer');
        });

        // Decode the JWT and confirm it carries OAuth scopes (tenant.read, tenant.write)
        // rather than old role names, plus standard claims like sub, email, tenant.
        it('should have correct claims in access token', () => {
            const decoded: any = jwtService.decode(passwordGrantResponse.accessToken);
            expect(decoded.sub).toEqual("admin@auth.server.com");
            expect(decoded.email).toEqual("admin@auth.server.com");
            expect(decoded.name).toBeDefined();
            expect(decoded.userId).toBeDefined();
            expect(decoded.tenant).toBeDefined();
            expect(decoded.tenant.domain).toEqual("auth.server.com");
            expect(decoded.userTenant).toBeDefined();
            expect(decoded.scopes).toContain("tenant.write");
            expect(decoded.scopes).toContain("tenant.read");
            expect(decoded.grant_type).toEqual("password");
        });

        // Refresh tokens carry minimal claims — just enough to identify the user and tenant.
        it('should have correct claims in refresh token', () => {
            const decoded: any = jwtService.decode(passwordGrantResponse.refreshToken);
            expect(decoded.email).toEqual("admin@auth.server.com");
            expect(decoded.domain).toEqual("auth.server.com");
        });
    });

    // Use client_credentials grant to get a technical token. Technical tokens should
    // carry tenant.read (read-only) but NOT tenant.write, and be flagged as isTechnical.
    describe('Client Credentials Grant Flow (Task 7.3)', () => {
        // Fetch the client_id and client_secret from the tenant credentials endpoint
        // so we can authenticate as the OAuth client itself.
        it('should get tenant credentials first', async () => {
            const response = await app.getHttpServer()
                .get("/api/tenant/my/credentials")
                .set('Authorization', `Bearer ${passwordGrantResponse.accessToken}`);

            expect(response.status).toEqual(200);
            clientId = response.body.clientId;
            clientSecret = response.body.clientSecret;
        });

        it('should obtain token via client credentials grant', async () => {
            const response = await app.getHttpServer()
                .post('/api/oauth/token')
                .send({
                    "grant_type": "client_credentials",
                    "client_id": clientId,
                    "client_secret": clientSecret
                })
                .set('Accept', 'application/json');

            expect(response.status).toEqual(201);
            expect(response.body.access_token).toBeDefined();
            
            const decoded: any = jwtService.decode(response.body.access_token);
            expect(decoded.sub).toEqual("oauth");
            expect(decoded.tenant).toBeDefined();
            expect(decoded.scopes).toContain("tenant.read");
            expect(decoded.scopes).not.toContain("tenant.write");
            expect(decoded.grant_type).toEqual("client_credentials");
            expect(decoded.isTechnical).toBe(true);
        });
    });

    // Exchange a refresh token for a new token pair. Validates the refresh_token grant
    // still works after the scope model refactoring.
    describe('Refresh Token Grant Flow (Task 7.4)', () => {
        it('should obtain new tokens via refresh token grant', async () => {
            const response = await app.getHttpServer()
                .post('/api/oauth/token')
                .send({
                    "grant_type": "refresh_token",
                    "refresh_token": passwordGrantResponse.refreshToken
                })
                .set('Accept', 'application/json');

            expect(response.status).toEqual(201);
            expect(response.body.access_token).toBeDefined();
            expect(response.body.refresh_token).toBeDefined();
        });
    });

    // Verify a token via the /api/oauth/verify endpoint using client credentials.
    // Ensures the verification endpoint still returns correct claims post-refactoring.
    describe('Token Verification Endpoint (Task 7.5)', () => {
        it('should verify a valid access token', async () => {
            const response = await app.getHttpServer()
                .post('/api/oauth/verify')
                .send({
                    "access_token": passwordGrantResponse.accessToken,
                    "client_id": clientId,
                    "client_secret": clientSecret
                })
                .set('Accept', 'application/json');

            expect(response.status).toEqual(201);
            expect(response.body.sub).toEqual("admin@auth.server.com");
            expect(response.body.tenant.domain).toEqual("auth.server.com");
        });
    });
});
