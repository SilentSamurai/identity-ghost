import {SharedTestFixture} from "../shared-test.fixture";
import {expect2xx} from "../api-client/client";

const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('Token Claims Compliance', () => {
    let app: SharedTestFixture;

    beforeAll(async () => {
        app = new SharedTestFixture();
    });

    afterAll(async () => {
        await app.close();
    });

    async function issuePasswordToken(): Promise<{ accessToken: string; refreshToken: string; jwt: any }> {
        const response = await app.getHttpServer()
            .post('/api/oauth/token')
            .send({
                grant_type: 'password',
                username: 'admin@auth.server.com',
                password: 'admin9000',
                client_id: 'auth.server.com',
            })
            .set('Accept', 'application/json');

        expect2xx(response);
        expect(response.status).toEqual(201);

        const accessToken = response.body.access_token;
        const refreshToken = response.body.refresh_token;
        const jwt = app.jwtService().decode(accessToken, {json: true}) as any;

        return {accessToken, refreshToken, jwt};
    }

    it('should include all 11 required claims in a password grant token', async () => {
        const {jwt} = await issuePasswordToken();

        const requiredClaims = ['iss', 'sub', 'aud', 'exp', 'iat', 'nbf', 'jti', 'scope', 'client_id', 'tenant_id', 'grant_type'];
        for (const claim of requiredClaims) {
            expect(jwt[claim]).toBeDefined();
        }
    });

    it('should set sub to user UUID (not email)', async () => {
        const {jwt} = await issuePasswordToken();

        expect(jwt.sub).toMatch(UUID_V4_REGEX);
        expect(jwt.sub).not.toContain('@');
    });

    it('should set aud as an array', async () => {
        const {jwt} = await issuePasswordToken();

        expect(Array.isArray(jwt.aud)).toBe(true);
        expect(jwt.aud.length).toBeGreaterThanOrEqual(1);
    });

    it('should set jti as UUID v4 format', async () => {
        const {jwt} = await issuePasswordToken();

        expect(jwt.jti).toMatch(UUID_V4_REGEX);
    });

    it('should set nbf equal to iat', async () => {
        const {jwt} = await issuePasswordToken();

        expect(jwt.nbf).toEqual(jwt.iat);
    });

    it('should set scope as a space-delimited string (not an array)', async () => {
        const {jwt} = await issuePasswordToken();

        expect(typeof jwt.scope).toBe('string');
        expect(Array.isArray(jwt.scope)).toBe(false);

        const scopeParts = jwt.scope.split(' ');
        for (const part of scopeParts) {
            expect(['openid', 'profile', 'email']).toContain(part);
        }
    });

    it('should not include email, name, userId, or userTenant in the JWT payload', async () => {
        const {jwt} = await issuePasswordToken();

        expect(jwt.email).toBeUndefined();
        expect(jwt.name).toBeUndefined();
        expect(jwt.userId).toBeUndefined();
        expect(jwt.userTenant).toBeUndefined();
    });

    it('should include tenant and roles in the JWT payload', async () => {
        const {jwt} = await issuePasswordToken();

        expect(jwt.tenant).toBeDefined();
        expect(jwt.tenant.id).toBeDefined();
        expect(jwt.tenant.name).toBeDefined();
        expect(jwt.tenant.domain).toBeDefined();

        expect(jwt.roles).toBeDefined();
        expect(Array.isArray(jwt.roles)).toBe(true);
    });

    it('should set grant_type to password for password grant', async () => {
        const {jwt} = await issuePasswordToken();

        expect(jwt.grant_type).toEqual('password');
    });
});
