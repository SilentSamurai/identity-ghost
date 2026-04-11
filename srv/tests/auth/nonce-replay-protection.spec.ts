import {SharedTestFixture} from "../shared-test.fixture";
import {expect2xx} from "../api-client/client";
import * as jwt from "jsonwebtoken";

/**
 * Integration tests for Nonce Replay Protection (OIDC Core 1.0 §3.1.2.1).
 *
 * Verifies that the nonce parameter flows correctly through the authorization
 * code flow: login → auth code → token exchange → ID token claim.
 *
 * Requirements: 1.1, 1.2, 1.3, 1.4, 2.1, 2.2
 */
describe('Nonce Replay Protection', () => {
    let app: SharedTestFixture;

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

    beforeAll(async () => {
        app = new SharedTestFixture();
    });

    afterAll(async () => {
        await app.close();
    });

    // ── Requirement 1.1: Nonce stored on auth code ──────────────────

    describe('nonce stored on auth code (Req 1.1)', () => {
        it('should store nonce and include it in the ID token', async () => {
            const testNonce = 'nonce-replay-test-abc123';
            const code = await loginForCode({scope: 'openid profile email', nonce: testNonce});
            const tokenResponse = await exchangeCode(code);

            expect(tokenResponse.id_token).toBeDefined();
            const payload = jwt.decode(tokenResponse.id_token) as any;
            expect(payload.nonce).toEqual(testNonce);
        });
    });

    // ── Requirement 1.2: Nonce omitted ──────────────────────────────

    describe('nonce omitted (Req 1.2)', () => {
        it('should store null nonce when not provided', async () => {
            const code = await loginForCode({scope: 'openid profile email'});
            const tokenResponse = await exchangeCode(code);

            expect(tokenResponse.id_token).toBeDefined();
            const payload = jwt.decode(tokenResponse.id_token) as any;
            expect(payload.nonce).toBeUndefined();
        });
    });

    // ── Requirement 2.1: Nonce in ID token ──────────────────────────

    describe('nonce in ID token (Req 2.1)', () => {
        it('should include exact nonce claim in ID token after full auth code flow', async () => {
            const testNonce = 'full-flow-nonce-xyz789';
            const code = await loginForCode({scope: 'openid profile email', nonce: testNonce});
            const tokenResponse = await exchangeCode(code);

            expect(tokenResponse.id_token).toBeDefined();
            const payload = jwt.decode(tokenResponse.id_token) as any;
            expect(payload).not.toBeNull();
            expect(payload.nonce).toBeDefined();
            expect(typeof payload.nonce).toBe('string');
            expect(payload.nonce).toEqual(testNonce);
        });
    });

    // ── Requirement 2.2: Nonce omitted from ID token ────────────────

    describe('nonce omitted from ID token (Req 2.2)', () => {
        it('should omit nonce claim from ID token when no nonce was provided', async () => {
            const code = await loginForCode({scope: 'openid profile email'});
            const tokenResponse = await exchangeCode(code);

            expect(tokenResponse.id_token).toBeDefined();
            const payload = jwt.decode(tokenResponse.id_token) as any;
            expect(payload).not.toBeNull();
            expect(payload.nonce).toBeUndefined();
        });
    });

    // ── Requirement 1.4: Nonce too long ─────────────────────────────

    describe('nonce too long (Req 1.4)', () => {
        it('should reject nonce exceeding 512 characters with 400 error', async () => {
            const longNonce = 'a'.repeat(513);

            const res = await app.getHttpServer()
                .post('/api/oauth/login')
                .send({
                    email,
                    password,
                    client_id: clientId,
                    code_challenge: challenge,
                    code_challenge_method: 'plain',
                    scope: 'openid profile email',
                    nonce: longNonce,
                })
                .set('Accept', 'application/json');

            expect(res.status).toEqual(400);
            expect(res.body.error).toBeDefined();
        });
    });

    // ── Requirement 1.3: Nonce at boundary ──────────────────────────

    describe('nonce at boundary (Req 1.3)', () => {
        it('should accept a 512-character nonce and store it correctly', async () => {
            const boundaryNonce = 'b'.repeat(512);
            const code = await loginForCode({scope: 'openid profile email', nonce: boundaryNonce});
            const tokenResponse = await exchangeCode(code);

            expect(tokenResponse.id_token).toBeDefined();
            const payload = jwt.decode(tokenResponse.id_token) as any;
            expect(payload.nonce).toEqual(boundaryNonce);
        });
    });
});
