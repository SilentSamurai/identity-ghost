import * as fc from 'fast-check';
import {hashToken} from '../../src/auth/refresh-token.service';

/**
 * Feature: db-refresh-token-rotation, Property 2: Token hash round-trip consistency
 *
 * For any opaque token string, computing SHA-256 always produces the same
 * deterministic output and matches the stored token_hash.
 *
 * Validates: Requirements 1.2, 3.1
 */
describe('Feature: db-refresh-token-rotation, Property 2: Token hash round-trip consistency', () => {

    it('hashToken is deterministic — calling it twice on the same input yields the same output', () => {
        fc.assert(
            fc.property(fc.string(), (token) => {
                const hash1 = hashToken(token);
                const hash2 = hashToken(token);
                expect(hash1).toBe(hash2);
            }),
            {numRuns: 200},
        );
    });

    it('hashToken output is a valid lowercase hex string of length 64', () => {
        fc.assert(
            fc.property(fc.string(), (token) => {
                const hash = hashToken(token);
                expect(hash).toHaveLength(64);
                expect(hash).toMatch(/^[0-9a-f]{64}$/);
            }),
            {numRuns: 200},
        );
    });

    it('different inputs produce different hashes (collision resistance)', () => {
        fc.assert(
            fc.property(
                fc.string({minLength: 1}),
                fc.string({minLength: 1}),
                (a, b) => {
                    fc.pre(a !== b);
                    const hashA = hashToken(a);
                    const hashB = hashToken(b);
                    expect(hashA).not.toBe(hashB);
                },
            ),
            {numRuns: 200},
        );
    });
});
