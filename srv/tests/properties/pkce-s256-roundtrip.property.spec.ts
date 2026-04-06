import * as fc from 'fast-check';
import {CryptUtil} from '../../src/util/crypt.util';

/**
 * Feature: pkce-compliance, Property 2: S256 server-side round-trip
 *
 * For any valid code verifier (43-128 chars, unreserved charset),
 * computing BASE64URL(SHA256(verifier)) via CryptUtil.generateCodeChallenge(verifier, 'S256')
 * and then verifying the same verifier against the resulting challenge
 * should always succeed (the recomputed challenge equals the stored challenge).
 *
 * Validates: Requirements 2.1
 */
describe('Property 2: S256 server-side round-trip', () => {

    const UNRESERVED_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';

    // Arbitrary: single valid unreserved character
    const unreservedCharArb = fc.constantFrom(...UNRESERVED_CHARS.split(''));

    // Arbitrary: valid code_verifier (length 43-128, unreserved charset)
    const validVerifierArb = fc.integer({min: 43, max: 128}).chain((len: number) =>
        fc.array(unreservedCharArb, {minLength: len, maxLength: len})
            .map((chars: string[]) => chars.join('')),
    );

    it('produces a stable challenge that re-verifies against the same verifier', () => {
        fc.assert(
            fc.property(validVerifierArb, (verifier: string) => {
                const challenge1 = CryptUtil.generateCodeChallenge(verifier, 'S256');
                const challenge2 = CryptUtil.generateCodeChallenge(verifier, 'S256');

                // Challenge must be a non-empty string
                expect(typeof challenge1).toBe('string');
                expect(challenge1.length).toBeGreaterThan(0);

                // Challenge must differ from the raw verifier (SHA-256 is not identity)
                expect(challenge1).not.toEqual(verifier);

                // Determinism: computing the challenge twice yields the same result
                expect(challenge1).toEqual(challenge2);
            }),
            {numRuns: 100},
        );
    });

    it('produces base64url-encoded output without padding', () => {
        fc.assert(
            fc.property(validVerifierArb, (verifier: string) => {
                const challenge = CryptUtil.generateCodeChallenge(verifier, 'S256');

                // Must be valid base64url (no +, /, or = characters)
                expect(challenge).toMatch(/^[A-Za-z0-9_-]+$/);

                // SHA-256 produces 32 bytes → base64url without padding is 43 chars
                expect(challenge.length).toBe(43);
            }),
            {numRuns: 100},
        );
    });
});
