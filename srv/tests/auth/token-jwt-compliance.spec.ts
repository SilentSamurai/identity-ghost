import {SharedTestFixture} from "../shared-test.fixture";
import {TokenFixture} from "../token.fixture";
import {JwtService} from "@nestjs/jwt";
import {expect2xx} from "../api-client/client";

const OIDC_SCOPES = ['email', 'openid', 'profile'];
const ROLE_NAMES = ['SUPER_ADMIN', 'TENANT_ADMIN', 'TENANT_VIEWER'];
const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Integration tests for JWT token compliance — scope-role separation and RFC 9068 claims.
 *
 * Verifies that all grant types produce tokens with:
 * - `scope`: OIDC values only (openid, profile, email) as space-delimited string
 * - `roles`: internal role names only (SUPER_ADMIN, TENANT_ADMIN, TENANT_VIEWER)
 * - No mixing between the two fields
 * - All required claims present (iss, sub, aud, exp, iat, nbf, jti, scope, client_id, tenant_id, grant_type)
 * - Correct claim formats (sub=UUID, aud=array, jti=UUID, nbf=iat)
 * - No profile data in JWT (email, name, userId, userTenant removed per RFC 9068)
 *
 * Validates: Requirements 5.1, 5.2, 9.1, 9.2, RFC 9068
 */
describe('Token JWT Compliance', () => {
    let app: SharedTestFixture;
    let jwtService: JwtService;
    let tokenFixture: TokenFixture;
    let passwordGrantResponse: any;
    // Default public client UUID — for refresh grants (matches the client that issued the token)
    let defaultClientId: string;
    // Confidential client — for client_credentials and verify flows
    let clientId: string;
    let clientSecret: string;

    beforeAll(async () => {
        app = new SharedTestFixture();
        jwtService = new JwtService({});
        tokenFixture = new TokenFixture(app);

        // Obtain password grant tokens and create a confidential client upfront
        const response = await tokenFixture.fetchAccessTokenFlow(
            "admin@auth.server.com",
            "admin9000",
            "auth.server.com"
        );
        passwordGrantResponse = response;

        // Get the default public client's UUID for refresh grants
        const creds = await app.getHttpServer()
            .get('/api/tenant/my/credentials')
            .set('Authorization', `Bearer ${response.accessToken}`)
            .set('Accept', 'application/json');
        defaultClientId = creds.body.clientId;

        const decoded = jwtService.decode(response.accessToken) as any;
        const confCreds = await tokenFixture.createConfidentialClient(
            response.accessToken,
            decoded.tenant.id,
            "confidential-client",
            "client_credentials",
            "openid profile email"
        );
        clientId = confCreds.clientId;
        clientSecret = confCreds.clientSecret;
    });

    afterAll(async () => {
        await app.close();
    });

    // ── Password Grant — Required Claims (RFC 9068) ─────────────────

    describe('Password Grant — Required Claims', () => {
        it('should include all 11 required claims in a password grant token', () => {
            const decoded: any = jwtService.decode(passwordGrantResponse.accessToken);
            const requiredClaims = ['iss', 'sub', 'aud', 'exp', 'iat', 'nbf', 'jti', 'scope', 'client_id', 'tenant_id', 'grant_type'];
            for (const claim of requiredClaims) {
                expect(decoded[claim]).toBeDefined();
            }
        });

        it('should set sub to user UUID (not email)', () => {
            const decoded: any = jwtService.decode(passwordGrantResponse.accessToken);
            expect(decoded.sub).toMatch(UUID_V4_REGEX);
            expect(decoded.sub).not.toContain('@');
        });

        it('should set aud as an array', () => {
            const decoded: any = jwtService.decode(passwordGrantResponse.accessToken);
            expect(Array.isArray(decoded.aud)).toBe(true);
            expect(decoded.aud.length).toBeGreaterThanOrEqual(1);
        });

        it('should set jti as UUID v4 format', () => {
            const decoded: any = jwtService.decode(passwordGrantResponse.accessToken);
            expect(decoded.jti).toMatch(UUID_V4_REGEX);
        });

        it('should set nbf equal to iat', () => {
            const decoded: any = jwtService.decode(passwordGrantResponse.accessToken);
            expect(decoded.nbf).toEqual(decoded.iat);
        });

        it('should set grant_type to password', () => {
            const decoded: any = jwtService.decode(passwordGrantResponse.accessToken);
            expect(decoded.grant_type).toEqual('password');
        });

        it('should include tenant object with id, name, and domain', () => {
            const decoded: any = jwtService.decode(passwordGrantResponse.accessToken);
            expect(decoded.tenant).toBeDefined();
            expect(decoded.tenant.id).toBeDefined();
            expect(decoded.tenant.name).toBeDefined();
            expect(decoded.tenant.domain).toEqual("auth.server.com");
        });
    });

    // ── Password Grant — Scope/Role Separation ──────────────────────

    describe('Password Grant — Scope/Role Separation', () => {
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

        it('should not include email, name, userId, or userTenant in the JWT payload', () => {
            const decoded: any = jwtService.decode(passwordGrantResponse.accessToken);
            expect(decoded.email).toBeUndefined();
            expect(decoded.name).toBeUndefined();
            expect(decoded.userId).toBeUndefined();
            expect(decoded.userTenant).toBeUndefined();
        });

        it('should have an opaque refresh token (not a JWT)', () => {
            const decoded: any = jwtService.decode(passwordGrantResponse.refreshToken);
            expect(decoded).toBeNull();
        });
    });

    // ── Client Credentials Grant ────────────────────────────────────

    describe('Client Credentials Grant', () => {
        it('should obtain technical token with OIDC scopes and no roles', async () => {
            const response = await app.getHttpServer()
                .post('/api/oauth/token')
                .send({
                    "grant_type": "client_credentials",
                    "client_id": clientId,
                    "client_secret": clientSecret
                })
                .set('Accept', 'application/json');

            expect(response.status).toEqual(200);
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

    // ── Refresh Token Grant ─────────────────────────────────────────

    describe('Refresh Token Grant', () => {
        it('should obtain new tokens with proper scope/role separation', async () => {
            const response = await app.getHttpServer()
                .post('/api/oauth/token')
                .send({
                    "grant_type": "refresh_token",
                    "refresh_token": passwordGrantResponse.refreshToken,
                    "client_id": defaultClientId,
                })
                .set('Accept', 'application/json');

            expect(response.status).toEqual(200);
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

    // ── Token Verification Endpoint ─────────────────────────────────

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
