import * as fc from 'fast-check';
import * as jwt from 'jsonwebtoken';
import {SharedTestFixture} from '../shared-test.fixture';
import {expect2xx} from '../api-client/client';

/**
 * Feature: nonce-replay-protection, Property 1: Nonce round-trip integrity —
 * For any valid nonce string, the nonce in the ID token equals the nonce sent
 * in the authorization request.
 *
 * **Validates: Requirements 1.1, 2.1, 5.1, 5.2**
 */
describe('Feature: nonce-replay-protection, Property 1: Nonce round-trip integrity', () => {
    let app: SharedTestFixture;

    const clientId = 'auth.server.com';
    const verifier = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopq';
    const challenge = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopq';
    const email = 'admin@auth.server.com';
    const password = 'admin9000';

    // URL-safe characters: alphanumeric + -._~
    const URL_SAFE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';

    const nonceArbitrary: fc.Arbitrary<string> = fc
        .array(fc.constantFrom(...URL_SAFE_CHARS.split('')), {minLength: 1, maxLength: 512})
        .map((chars) => chars.join(''));

    /** Helper: login with nonce → get auth code */
    async function loginForCode(nonce: string): Promise<string> {
        const res = await app.getHttpServer()
            .post('/api/oauth/login')
            .send({
                email,
                password,
                client_id: clientId,
                code_challenge: challenge,
                code_challenge_method: 'plain',
                scope: 'openid profile email',
                nonce,
            })
            .set('Accept', 'application/json');

        expect2xx(res);
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
            {numRuns: 100},
        );
    }, 120_000);
});
