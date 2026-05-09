import * as fc from 'fast-check';
import * as jwt from 'jsonwebtoken';
import {SharedTestFixture} from '../shared-test.fixture';
import {TokenFixture} from '../token.fixture';

/**
 * Feature: nonce-replay-protection, Property 1: Nonce round-trip integrity —
 * For any valid nonce string, the nonce in the ID token equals the nonce sent
 * in the authorization request.
 *
 * **Validates: Requirements 1.1, 2.1, 5.1, 5.2**
 */
describe('Feature: nonce-replay-protection, Property 1: Nonce round-trip integrity', () => {
    let app: SharedTestFixture;
    let tokenFixture: TokenFixture;

    const clientId = 'auth.server.com';
    const redirectUri = 'http://localhost:3000/callback';
    const verifier = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopq';
    const challenge = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopq';
    const email = 'admin@auth.server.com';
    const password = 'admin9000';

    // URL-safe characters: alphanumeric + -._~
    const URL_SAFE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';

    const nonceArbitrary: fc.Arbitrary<string> = fc
        .array(fc.constantFrom(...URL_SAFE_CHARS.split('')), {minLength: 1, maxLength: 512})
        .map((chars) => chars.join(''));

    /** Helper: login → authorize → get auth code (cookie-based flow), with nonce */
    async function loginForCode(nonce: string): Promise<string> {
        return tokenFixture.fetchAuthCode(email, password, clientId, redirectUri, {
            codeChallenge: challenge,
            codeChallengeMethod: 'plain',
            scope: 'openid profile email',
            nonce,
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

        expect(res.status).toBeGreaterThanOrEqual(200);
        expect(res.status).toBeLessThan(300);
        return res.body;
    }

    beforeAll(async () => {
        app = new SharedTestFixture();
        tokenFixture = new TokenFixture(app);
    });

    afterAll(async () => {
        await app.close();
    });

    it('nonce in ID token equals the nonce sent in the authorization request', async () => {
        await fc.assert(
            fc.asyncProperty(nonceArbitrary, async (generatedNonce) => {
                const code = await loginForCode(generatedNonce);
                const tokenResponse = await exchangeCode(code);

                expect(tokenResponse.id_token).toBeDefined();
                const payload = jwt.decode(tokenResponse.id_token) as Record<string, any>;
                expect(payload).toBeTruthy();
                expect(payload.nonce).toBe(generatedNonce);
            }),
            {numRuns: 20},
        );
    }, 180_000);
});
