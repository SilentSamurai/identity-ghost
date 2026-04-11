import {SharedTestFixture} from './shared-test.fixture';
import {expect2xx} from './api-client/client';
import {TokenFixture} from './token.fixture';
import * as jwt from 'jsonwebtoken';

/**
 * Integration tests for the UserInfo Endpoint (OIDC Core §5.3).
 *
 * These tests exercise the full NestJS application via HTTP, verifying
 * that the /api/oauth/userinfo endpoint returns correct claims based on
 * granted scopes, handles authentication errors properly, and produces
 * responses consistent with the ID Token for the same user and scopes.
 *
 * Requirements: 5.2, 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 7.1
 */
describe('UserInfo Endpoint Integration', () => {
    let app: SharedTestFixture;
    let tokenFixture: TokenFixture;

    const clientId = 'auth.server.com';
    const email = 'admin@auth.server.com';
    const password = 'admin9000';
    const verifier = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopq';
    const challenge = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopq';

    /** Helper: login → get auth code with specific scope (matches id-token-integration.spec.ts pattern) */
    async function loginForCode(opts?: { scope?: string; nonce?: string }): Promise<string> {
        const body: any = {
            email,
            password,
            client_id: clientId,
            code_challenge: challenge,
            code_challenge_method: 'plain',
        };
        if (opts?.scope !== undefined) body.scope = opts.scope;
        if (opts?.nonce !== undefined) body.nonce = opts.nonce;

        const res = await app.getHttpServer()
            .post('/api/oauth/login')
            .send(body)
            .set('Accept', 'application/json');

        expect2xx(res);
        expect(res.body.authentication_code).toBeDefined();
        return res.body.authentication_code;
    }

    /** Helper: exchange auth code → full token response */
    async function exchangeCode(code: string): Promise<any> {
        const res = await app.getHttpServer()
            .post('/api/oauth/token')
            .send({
                grant_type: 'authorization_code',
                code,
                code_verifier: verifier,
                client_id: clientId,
            })
            .set('Accept', 'application/json');

        expect2xx(res);
        return res.body;
    }

    /** Helper: login → exchange → access token for a given scope */
    async function getAccessToken(scope: string): Promise<string> {
        const code = await loginForCode({scope});
        const tokenResponse = await exchangeCode(code);
        return tokenResponse.access_token;
    }

    beforeAll(async () => {
        app = new SharedTestFixture();
        tokenFixture = new TokenFixture(app);
    });

    afterAll(async () => {
        await app.close();
    });

    // ── 1. GET /api/oauth/userinfo with valid token → 200, all claims ──

    describe('GET /api/oauth/userinfo with valid token (openid profile email)', () => {
        it('should return 200 with sub, name, email, email_verified', async () => {
            const accessToken = await getAccessToken('openid profile email');

            const res = await app.getHttpServer()
                .get('/api/oauth/userinfo')
                .set('Authorization', `Bearer ${accessToken}`)
                .set('Accept', 'application/json');

            expect(res.status).toEqual(200);
            expect(res.body.sub).toBeDefined();
            expect(typeof res.body.sub).toBe('string');
            expect(res.body.name).toBeDefined();
            expect(res.body.email).toBeDefined();
            expect(res.body.email_verified).toBeDefined();
        });
    });

    // ── 2. POST /api/oauth/userinfo with valid token → 200, same response ──

    describe('POST /api/oauth/userinfo with valid token', () => {
        it('should return 200 with same claims as GET', async () => {
            const accessToken = await getAccessToken('openid profile email');

            const getRes = await app.getHttpServer()
                .get('/api/oauth/userinfo')
                .set('Authorization', `Bearer ${accessToken}`)
                .set('Accept', 'application/json');

            const postRes = await app.getHttpServer()
                .post('/api/oauth/userinfo')
                .set('Authorization', `Bearer ${accessToken}`)
                .set('Accept', 'application/json');

            expect(postRes.status).toEqual(200);
            expect(postRes.body.sub).toEqual(getRes.body.sub);
            expect(postRes.body.name).toEqual(getRes.body.name);
            expect(postRes.body.email).toEqual(getRes.body.email);
            expect(postRes.body.email_verified).toEqual(getRes.body.email_verified);
        });
    });

    // ── 3. Token with only openid scope → 200, only sub ──

    describe('token with only openid scope', () => {
        it('should return 200 with only sub claim', async () => {
            const accessToken = await getAccessToken('openid');

            const res = await app.getHttpServer()
                .get('/api/oauth/userinfo')
                .set('Authorization', `Bearer ${accessToken}`)
                .set('Accept', 'application/json');

            expect(res.status).toEqual(200);
            expect(res.body.sub).toBeDefined();
            expect(typeof res.body.sub).toBe('string');
            expect(res.body.name).toBeUndefined();
            expect(res.body.email).toBeUndefined();
            expect(res.body.email_verified).toBeUndefined();
        });
    });

    // ── 4. Token with openid profile → sub + name, no email claims ──

    describe('token with openid profile scope', () => {
        it('should return sub and name, but no email claims', async () => {
            const accessToken = await getAccessToken('openid profile');

            const res = await app.getHttpServer()
                .get('/api/oauth/userinfo')
                .set('Authorization', `Bearer ${accessToken}`)
                .set('Accept', 'application/json');

            expect(res.status).toEqual(200);
            expect(res.body.sub).toBeDefined();
            expect(res.body.name).toBeDefined();
            expect(res.body.email).toBeUndefined();
            expect(res.body.email_verified).toBeUndefined();
        });
    });

    // ── 5. Token with openid email → sub + email + email_verified, no name ──

    describe('token with openid email scope', () => {
        it('should return sub, email, email_verified, but no name', async () => {
            const accessToken = await getAccessToken('openid email');

            const res = await app.getHttpServer()
                .get('/api/oauth/userinfo')
                .set('Authorization', `Bearer ${accessToken}`)
                .set('Accept', 'application/json');

            expect(res.status).toEqual(200);
            expect(res.body.sub).toBeDefined();
            expect(res.body.email).toBeDefined();
            expect(res.body.email_verified).toBeDefined();
            expect(res.body.name).toBeUndefined();
        });
    });

    // ── 6. Missing Authorization header → 401 + WWW-Authenticate: Bearer ──

    describe('missing Authorization header', () => {
        it('should return 401 with WWW-Authenticate: Bearer header', async () => {
            const res = await app.getHttpServer()
                .get('/api/oauth/userinfo')
                .set('Accept', 'application/json');

            expect(res.status).toEqual(401);
            expect(res.headers['www-authenticate']).toBeDefined();
            expect(res.headers['www-authenticate']).toContain('Bearer');
        });
    });

    // ── 7. Invalid/expired token → 401 ──

    describe('invalid or expired token', () => {
        it('should return 401 for an invalid token', async () => {
            const res = await app.getHttpServer()
                .get('/api/oauth/userinfo')
                .set('Authorization', 'Bearer invalid.token.value')
                .set('Accept', 'application/json');

            expect(res.status).toEqual(401);
        });
    });

    // ── 8. Client credentials token → 401 (UserInfo requires user token) ──

    describe('client credentials token (TechnicalToken)', () => {
        it('should return 401 because UserInfo requires a user access token', async () => {
            // Get an admin access token to fetch tenant credentials
            const adminToken = await tokenFixture.fetchAccessToken(email, password, clientId);

            // Fetch the tenant's client credentials
            const credsRes = await app.getHttpServer()
                .get('/api/tenant/my/credentials')
                .set('Authorization', `Bearer ${adminToken.accessToken}`)
                .set('Accept', 'application/json');

            expect2xx(credsRes);
            const {clientId: tenantClientId, clientSecret} = credsRes.body;

            // Get a client_credentials token (TechnicalToken — no user)
            const ccToken = await tokenFixture.fetchClientCredentialsToken(tenantClientId, clientSecret);

            // UserInfo should reject it
            const res = await app.getHttpServer()
                .get('/api/oauth/userinfo')
                .set('Authorization', `Bearer ${ccToken.accessToken}`)
                .set('Accept', 'application/json');

            expect(res.status).toEqual(401);
        });
    });

    // ── 9. Response headers include Cache-Control: no-store ──

    describe('response headers', () => {
        it('should include Cache-Control: no-store', async () => {
            const accessToken = await getAccessToken('openid profile email');

            const res = await app.getHttpServer()
                .get('/api/oauth/userinfo')
                .set('Authorization', `Bearer ${accessToken}`)
                .set('Accept', 'application/json');

            expect(res.status).toEqual(200);
            expect(res.headers['cache-control']).toBeDefined();
            expect(res.headers['cache-control']).toContain('no-store');
        });
    });

    // ── 10. Consistency: ID Token identity claims match UserInfo response ──

    describe('consistency between ID Token and UserInfo response', () => {
        it('should return the same identity claims as the ID Token for the same user and scopes', async () => {
            const code = await loginForCode({scope: 'openid profile email'});
            const tokenResponse = await exchangeCode(code);

            // Decode the id_token to extract identity claims
            const idTokenPayload = jwt.decode(tokenResponse.id_token) as any;
            expect(idTokenPayload).not.toBeNull();

            // Call UserInfo with the same access token
            const res = await app.getHttpServer()
                .get('/api/oauth/userinfo')
                .set('Authorization', `Bearer ${tokenResponse.access_token}`)
                .set('Accept', 'application/json');

            expect(res.status).toEqual(200);

            // Compare identity claims
            expect(res.body.sub).toEqual(idTokenPayload.sub);
            expect(res.body.name).toEqual(idTokenPayload.name);
            expect(res.body.email).toEqual(idTokenPayload.email);
            expect(res.body.email_verified).toEqual(idTokenPayload.email_verified);
        });
    });
});
