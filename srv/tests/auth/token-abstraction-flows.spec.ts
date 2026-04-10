import {SharedTestFixture} from "../shared-test.fixture";
import {TokenFixture} from "../token.fixture";
import {JwtService} from "@nestjs/jwt";

const OIDC_SCOPES = ['email', 'openid', 'profile'];
const ROLE_NAMES = ['SUPER_ADMIN', 'TENANT_ADMIN', 'TENANT_VIEWER'];

/**
 * Integration tests for the OAuth token abstraction layer after the scope-role separation.
 *
 * Verifies that all grant types produce tokens with:
 * - `scopes`: OIDC values only (openid, profile, email)
 * - `roles`: internal role names only (SUPER_ADMIN, TENANT_ADMIN, TENANT_VIEWER)
 * - No mixing between the two fields
 *
 * Validates: Requirements 5.1, 5.2, 9.1, 9.2
 */
describe('Token Abstraction Flows', () => {
    let app: SharedTestFixture;
    let jwtService: JwtService;
    let passwordGrantResponse: any;
    let clientId: string;
    let clientSecret: string;

    beforeAll(async () => {
        app = new SharedTestFixture();
        jwtService = new JwtService({});
    });

    afterAll(async () => {
        await app.close();
    });

    describe('Password Grant Flow', () => {
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
        });

        it('should have standard claims in access token', () => {
            const decoded: any = jwtService.decode(passwordGrantResponse.accessToken);
            // sub is now user UUID, not email
            expect(decoded.sub).toBeDefined();
            expect(decoded.sub).not.toContain('@');
            expect(decoded.tenant).toBeDefined();
            expect(decoded.tenant.domain).toEqual("auth.server.com");
            expect(decoded.grant_type).toEqual("password");
            // Profile data removed from JWT (RFC 9068 compliance)
            expect(decoded.email).toBeUndefined();
            expect(decoded.name).toBeUndefined();
            expect(decoded.userId).toBeUndefined();
            expect(decoded.userTenant).toBeUndefined();
        });

        it('should have scope field as space-delimited OIDC string', () => {
            const decoded: any = jwtService.decode(passwordGrantResponse.accessToken);
            expect(decoded.scope).toBeDefined();
            expect(typeof decoded.scope).toBe('string');

            // scope must contain only OIDC values
            const scopeParts = decoded.scope.split(' ').filter((s: string) => s.length > 0);
            for (const scope of scopeParts) {
                expect(OIDC_SCOPES).toContain(scope);
            }

            // scope must not contain any role names
            for (const role of ROLE_NAMES) {
                expect(decoded.scope).not.toContain(role);
            }
        });

        it('should have roles field with internal role names', () => {
            const decoded: any = jwtService.decode(passwordGrantResponse.accessToken);
            expect(decoded.roles).toBeDefined();
            expect(Array.isArray(decoded.roles)).toBe(true);
            expect(decoded.roles.length).toBeGreaterThan(0);

            // roles must contain only valid role enum names
            for (const role of decoded.roles) {
                expect(ROLE_NAMES).toContain(role);
            }

            // The admin user should have SUPER_ADMIN
            expect(decoded.roles).toContain('SUPER_ADMIN');

            // roles must not contain any OIDC scope values
            for (const scope of OIDC_SCOPES) {
                expect(decoded.roles).not.toContain(scope);
            }
        });

        it('should have an opaque refresh token (not a JWT)', () => {
            // Refresh tokens are now opaque strings, not JWTs
            const decoded: any = jwtService.decode(passwordGrantResponse.refreshToken);
            expect(decoded).toBeNull();
        });
    });

    describe('Client Credentials Grant Flow', () => {
        it('should get tenant credentials first', async () => {
            const response = await app.getHttpServer()
                .get("/api/tenant/my/credentials")
                .set('Authorization', `Bearer ${passwordGrantResponse.accessToken}`);

            expect(response.status).toEqual(200);
            clientId = response.body.clientId;
            clientSecret = response.body.clientSecret;
        });

        it('should obtain technical token with OIDC scopes and no roles', async () => {
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
            expect(decoded.grant_type).toEqual("client_credentials");
            expect(decoded.isTechnical).toBe(true);

            // Technical token scope should be a space-delimited OIDC string
            expect(decoded.scope).toBeDefined();
            expect(typeof decoded.scope).toBe('string');
            const scopeParts = decoded.scope.split(' ').filter((s: string) => s.length > 0);
            for (const scope of scopeParts) {
                expect(OIDC_SCOPES).toContain(scope);
            }

            // Technical tokens must NOT have a roles field
            expect(decoded.roles).toBeUndefined();
        });
    });

    describe('Refresh Token Grant Flow', () => {
        it('should obtain new tokens via refresh token grant', async () => {
            const response = await app.getHttpServer()
                .post('/api/oauth/token')
                .send({
                    "grant_type": "refresh_token",
                    "refresh_token": passwordGrantResponse.refreshToken,
                    "client_id": clientId,
                    "client_secret": clientSecret,
                })
                .set('Accept', 'application/json');

            expect(response.status).toEqual(201);
            expect(response.body.access_token).toBeDefined();
            expect(response.body.refresh_token).toBeDefined();

            // Verify the refreshed token also has proper scope/role separation
            const decoded: any = jwtService.decode(response.body.access_token);

            expect(decoded.scope).toBeDefined();
            expect(typeof decoded.scope).toBe('string');
            const scopeParts = decoded.scope.split(' ').filter((s: string) => s.length > 0);
            for (const scope of scopeParts) {
                expect(OIDC_SCOPES).toContain(scope);
            }
            for (const role of ROLE_NAMES) {
                expect(decoded.scope).not.toContain(role);
            }

            expect(decoded.roles).toBeDefined();
            for (const role of decoded.roles) {
                expect(ROLE_NAMES).toContain(role);
            }
            for (const scope of OIDC_SCOPES) {
                expect(decoded.roles).not.toContain(scope);
            }
        });
    });

    describe('Token Verification Endpoint', () => {
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
            // sub is now user UUID, not email
            expect(response.body.sub).toBeDefined();
            expect(response.body.sub).not.toContain('@');
            expect(response.body.tenant.domain).toEqual("auth.server.com");
        });
    });
});
