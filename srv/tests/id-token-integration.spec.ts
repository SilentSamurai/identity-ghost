import {SharedTestFixture} from "./shared-test.fixture";
import {expect2xx} from "./api-client/client";
import {TokenFixture} from "./token.fixture";
import {createHash} from "crypto";
import * as jwt from "jsonwebtoken";

/**
 * Integration tests for ID Token Generation (OIDC Core 1.0 §2).
 *
 * These tests exercise the full NestJS application via HTTP, verifying
 * that the token endpoint produces correct ID tokens with all required
 * claims, scope-dependent claims, nonce round-trip, at_hash binding,
 * and refresh token flow behaviour.
 */
describe('ID Token Generation Integration', () => {
    let app: SharedTestFixture;
    let tokenFixture: TokenFixture;

    const clientId = 'auth.server.com';
    const verifier = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopq';
    const challenge = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopq';
    const email = 'admin@auth.server.com';
    const password = 'admin9000';

    /** Helper: login → get auth code */
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

    /** Helper: exchange auth code → token response */
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

    /** Helper: compute at_hash independently */
    function computeAtHash(accessToken: string): string {
        const hash = createHash('sha256').update(accessToken, 'ascii').digest();
        const leftHalf = hash.subarray(0, hash.length / 2);
        return leftHalf.toString('base64url');
    }

    beforeAll(async () => {
        app = new SharedTestFixture();
        tokenFixture = new TokenFixture(app);
    });

    afterAll(async () => {
        await app.close();
    });


    // ── 8.1: Full token issuance with authorization_code grant ──────

    describe('8.1 full token issuance with authorization_code grant', () => {
        let tokenResponse: any;
        let idTokenPayload: any;

        beforeAll(async () => {
            const code = await loginForCode({scope: 'openid profile email'});
            tokenResponse = await exchangeCode(code);
        });

        it('should include id_token in the response', () => {
            expect(tokenResponse.id_token).toBeDefined();
            expect(typeof tokenResponse.id_token).toBe('string');
        });

        it('should contain all mandatory OIDC claims', () => {
            idTokenPayload = jwt.decode(tokenResponse.id_token) as any;
            expect(idTokenPayload).not.toBeNull();

            // iss — issuer
            expect(idTokenPayload.iss).toBeDefined();
            expect(typeof idTokenPayload.iss).toBe('string');

            // sub — subject (user id)
            expect(idTokenPayload.sub).toBeDefined();
            expect(typeof idTokenPayload.sub).toBe('string');

            // aud — audience as array
            expect(idTokenPayload.aud).toBeDefined();
            expect(Array.isArray(idTokenPayload.aud)).toBe(true);
            expect(idTokenPayload.aud.length).toBeGreaterThan(0);

            // azp — authorized party
            expect(idTokenPayload.azp).toBeDefined();
            expect(typeof idTokenPayload.azp).toBe('string');

            // exp — expiration
            expect(idTokenPayload.exp).toBeDefined();
            expect(typeof idTokenPayload.exp).toBe('number');

            // iat — issued at
            expect(idTokenPayload.iat).toBeDefined();
            expect(typeof idTokenPayload.iat).toBe('number');
            expect(idTokenPayload.exp).toBeGreaterThan(idTokenPayload.iat);

            // auth_time
            expect(idTokenPayload.auth_time).toBeDefined();
            expect(typeof idTokenPayload.auth_time).toBe('number');

            // sid — session id
            expect(idTokenPayload.sid).toBeDefined();
            expect(typeof idTokenPayload.sid).toBe('string');

            // amr — authentication methods
            expect(idTokenPayload.amr).toBeDefined();
            expect(Array.isArray(idTokenPayload.amr)).toBe(true);

            // at_hash — access token hash
            expect(idTokenPayload.at_hash).toBeDefined();
            expect(typeof idTokenPayload.at_hash).toBe('string');
        });
    });

    // ── 8.2: No id_token when openid scope is absent ────────────────

    describe('8.2 no id_token when openid scope is absent', () => {
        it('should omit id_token when openid is not in scope', async () => {
            const code = await loginForCode({scope: 'profile email'});
            const tokenResponse = await exchangeCode(code);

            expect(tokenResponse.id_token).toBeUndefined();
        });
    });

    // ── 8.3: Scope-dependent claims ─────────────────────────────────

    describe('8.3 scope-dependent claims', () => {
        it('should include name only with profile scope', async () => {
            // With profile scope
            const codeWithProfile = await loginForCode({scope: 'openid profile'});
            const resWithProfile = await exchangeCode(codeWithProfile);
            const payloadWithProfile = jwt.decode(resWithProfile.id_token) as any;
            expect(payloadWithProfile.name).toBeDefined();

            // Without profile scope
            const codeWithoutProfile = await loginForCode({scope: 'openid email'});
            const resWithoutProfile = await exchangeCode(codeWithoutProfile);
            const payloadWithoutProfile = jwt.decode(resWithoutProfile.id_token) as any;
            expect(payloadWithoutProfile.name).toBeUndefined();
        });

        it('should include email and email_verified only with email scope', async () => {
            // With email scope
            const codeWithEmail = await loginForCode({scope: 'openid email'});
            const resWithEmail = await exchangeCode(codeWithEmail);
            const payloadWithEmail = jwt.decode(resWithEmail.id_token) as any;
            expect(payloadWithEmail.email).toBeDefined();
            expect(payloadWithEmail.email_verified).toBeDefined();

            // Without email scope
            const codeWithoutEmail = await loginForCode({scope: 'openid profile'});
            const resWithoutEmail = await exchangeCode(codeWithoutEmail);
            const payloadWithoutEmail = jwt.decode(resWithoutEmail.id_token) as any;
            expect(payloadWithoutEmail.email).toBeUndefined();
            expect(payloadWithoutEmail.email_verified).toBeUndefined();
        });
    });

    // ── 8.4: Nonce round-trip ───────────────────────────────────────

    describe('8.4 nonce round-trip', () => {
        it('should echo back nonce when provided in authorization request', async () => {
            const testNonce = 'test-nonce-value-12345';
            const code = await loginForCode({scope: 'openid profile email', nonce: testNonce});
            const tokenResponse = await exchangeCode(code);

            const payload = jwt.decode(tokenResponse.id_token) as any;
            expect(payload.nonce).toEqual(testNonce);
        });

        it('should omit nonce when not provided in authorization request', async () => {
            const code = await loginForCode({scope: 'openid profile email'});
            const tokenResponse = await exchangeCode(code);

            const payload = jwt.decode(tokenResponse.id_token) as any;
            expect(payload.nonce).toBeUndefined();
        });
    });

    // ── 8.5: at_hash validation ─────────────────────────────────────

    describe('8.5 at_hash validation', () => {
        it('should have at_hash matching independent computation from access_token', async () => {
            const code = await loginForCode({scope: 'openid profile email'});
            const tokenResponse = await exchangeCode(code);

            const payload = jwt.decode(tokenResponse.id_token) as any;
            const expectedAtHash = computeAtHash(tokenResponse.access_token);

            expect(payload.at_hash).toEqual(expectedAtHash);
        });
    });

    // ── 8.6: Refresh token flow includes id_token ───────────────────

    describe('8.6 refresh token flow includes id_token', () => {
        it('should include id_token in refresh response and omit nonce', async () => {
            // Step 1: Get initial tokens with a nonce via auth code flow
            const testNonce = 'refresh-nonce-test-xyz';
            const code = await loginForCode({scope: 'openid profile email', nonce: testNonce});
            const initialResponse = await exchangeCode(code);

            expect(initialResponse.refresh_token).toBeDefined();
            expect(initialResponse.id_token).toBeDefined();

            // Verify initial id_token has the nonce
            const initialPayload = jwt.decode(initialResponse.id_token) as any;
            expect(initialPayload.nonce).toEqual(testNonce);

            // Step 2: Get client credentials for refresh (need client_id + client_secret)
            const adminToken = await tokenFixture.fetchAccessToken(email, password, clientId);
            const credsRes = await app.getHttpServer()
                .get('/api/tenant/my/credentials')
                .set('Authorization', `Bearer ${adminToken.accessToken}`);
            expect2xx(credsRes);
            const clientSecret = credsRes.body.clientSecret;

            // Step 3: Refresh the token
            const refreshRes = await app.getHttpServer()
                .post('/api/oauth/token')
                .send({
                    grant_type: 'refresh_token',
                    refresh_token: initialResponse.refresh_token,
                    client_id: credsRes.body.clientId,
                    client_secret: clientSecret,
                })
                .set('Accept', 'application/json');

            expect2xx(refreshRes);

            // Verify id_token is present in refresh response
            expect(refreshRes.body.id_token).toBeDefined();
            expect(typeof refreshRes.body.id_token).toBe('string');

            // Verify nonce is NOT present in refreshed id_token
            const refreshedPayload = jwt.decode(refreshRes.body.id_token) as any;
            expect(refreshedPayload.nonce).toBeUndefined();
        });
    });
});
