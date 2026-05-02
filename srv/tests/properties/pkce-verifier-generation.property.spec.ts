import * as fc from 'fast-check';
import {randomBytes} from 'crypto';

/**
 * Feature: pkce-compliance, Property 4: Code verifier generation compliance
 *
 * For any verifier produced by the generation function,
 * length ∈ [43,128] AND charset ⊆ [A-Za-z0-9\-._~].
 *
 * The generation algorithm is replicated here from
 * ui/src/app/_services/pkce.service.ts (generateCodeVerifier)
 * to validate the algorithm itself in a Node.js environment.
 *
 * Validates: Requirements 6.1, 6.2
 */

const CHARSET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
const UNRESERVED_REGEX = /^[A-Za-z0-9\-._~]+$/;

/**
 * Replicates the UI's generateCodeVerifier algorithm using Node's crypto.
 * Uses the same mapping: byte % CHARSET.length for each random byte.
 */
function generateCodeVerifier(randomValues: Uint8Array): string {
    const length = 64;
    const bytes = randomValues.slice(0, length);
    return Array.from(bytes, (byte) => CHARSET[byte % CHARSET.length]).join('');
}

describe('Property 4: Code verifier generation compliance', () => {

    // Arbitrary: random Uint8Array of length 64 (simulating crypto.getRandomValues)
    const randomBytesArb = fc.uint8Array({minLength: 64, maxLength: 64});

    it('generated verifiers have length 64 (within [43, 128])', () => {
        fc.assert(
            fc.property(randomBytesArb, (bytes: Uint8Array) => {
                const verifier = generateCodeVerifier(bytes);

                expect(verifier.length).toBe(64);
                expect(verifier.length).toBeGreaterThanOrEqual(43);
                expect(verifier.length).toBeLessThanOrEqual(128);
            }),
            {numRuns: 100},
        );
    });

    it('generated verifiers contain only unreserved characters [A-Za-z0-9\\-._~]', () => {
        fc.assert(
            fc.property(randomBytesArb, (bytes: Uint8Array) => {
                const verifier = generateCodeVerifier(bytes);

                expect(verifier).toMatch(UNRESERVED_REGEX);
            }),
            {numRuns: 100},
        );
    });

    it('every character in the verifier belongs to the CHARSET', () => {
        fc.assert(
            fc.property(randomBytesArb, (bytes: Uint8Array) => {
                const verifier = generateCodeVerifier(bytes);

                for (const ch of verifier) {
                    expect(CHARSET).toContain(ch);
                }
            }),
            {numRuns: 100},
        );
    });

    it('uses all 66 characters from the unreserved set (statistical coverage)', () => {
        // Generate many verifiers and check that all charset characters appear at least once
        const seen = new Set<string>();
        for (let i = 0; i < 1000; i++) {
            const bytes = new Uint8Array(64);
            // Use Node's crypto for real randomness
            const buf = randomBytes(64);
            bytes.set(buf);
            const verifier = generateCodeVerifier(bytes);
            for (const ch of verifier) {
                seen.add(ch);
            }
        }
        // With 1000 * 64 = 64000 characters and 66 possible values, all should appear
        expect(seen.size).toBe(CHARSET.length);
    });
});
