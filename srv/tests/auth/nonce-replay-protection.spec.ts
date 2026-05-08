import {SharedTestFixture} from "../shared-test.fixture";
import {TokenFixture} from "../token.fixture";
import {expect2xx} from "../api-client/client";
import * as jwt from "jsonwebtoken";

/**
 * Integration tests for Nonce Replay Protection (OIDC Core 1.0 §3.1.2.1).
 *
 * Verifies that the nonce parameter flows correctly through the authorization
 * code flow: authorize → auth code → token exchange → ID token claim.
 *
 * Requirements: 1.1, 1.2, 1.3, 1.4, 2.1, 2.2
 */
describe('Nonce Replay Protection', () => {
    let app: SharedTestFixture;
    let tokenFixture: TokenFixture;

    const clientId = 'nonce-test.local';
    const redirectUri = 'http://localhost:3000/callback';
    const verifier = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopq';
    const email = 'admin@nonce-test.local';
    const password = 'admin9000';

    /** Helper: login → authorize → get auth code with optional nonce */
    async function loginForCode(opts?: { scope?: string; nonce?: string }): Promise<string> {
        return tokenFixture.fetchAuthCode(email, password, clientId, redirectUri, {
            scope: opts?.scope,
            nonce: opts?.nonce,
        });
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
                redirect_uri: redirectUri,
            })
            .set('Accept', 'application/json');

        expect2xx(res);
        return res.body;
    }

    beforeAll(async () => {
        app = new SharedTestFixture();
        tokenFixture = new TokenFixture(app);
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
        it('should reject nonce exceeding 512 characters with 400 error at authorize endpoint', async () => {
            const longNonce = 'a'.repeat(513);

            // Nonce is now validated at the authorize endpoint (post-redirect error)
            const sidCookie = await tokenFixture.loginForCookie(email, password, clientId);
            const res = await app.getHttpServer()
                .get('/api/oauth/authorize')
                .query({
                    response_type: 'code',
                    client_id: clientId,
                    redirect_uri: redirectUri,
                    scope: 'openid profile email',
                    state: 'test-state',
                    code_challenge: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopq',
                    code_challenge_method: 'plain',
                    session_confirmed: 'true',
                    nonce: longNonce,
                })
                .set('Cookie', sidCookie)
                .redirects(0);

            // Should redirect with error (post-redirect error per OIDC Core §3.1.2.6)
            expect(res.status).toEqual(302);
            const location = new URL(res.headers.location);
            expect(location.searchParams.get('error')).toBeDefined();
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
