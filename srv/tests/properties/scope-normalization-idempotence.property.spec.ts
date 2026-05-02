import * as fc from 'fast-check';
import {ScopeNormalizer} from '../../src/casl/scope-normalizer';

/**
 * Feature: scope-model-refactoring, Property 1: Scope normalization idempotence
 *
 * For any valid scope string, normalizing it once and then normalizing the
 * result again shall produce an identical string. That is,
 * normalize(normalize(s)) === normalize(s) for all valid scope strings s.
 * The normalized output must be deduplicated, lexicographically sorted,
 * and space-delimited.
 *
 * Validates: Requirements 4.1, 4.2, 4.3, 4.4, 3.3
 */
describe('Property 1: Scope normalization idempotence', () => {
    // Arbitrary that produces realistic OAuth scope tokens (no internal whitespace)
    const scopeTokenArb = fc.oneof(
        fc.constantFrom('openid', 'profile', 'email', 'tenant.read', 'tenant.write'),
        fc.string({
            unit: fc.stringMatching(/^[!#-\[\]-~]$/),
            minLength: 1,
            maxLength: 20,
        }),
    );

    // Arbitrary that joins scope tokens with varying whitespace (single/multiple spaces)
    const scopeStringArb = fc
        .array(scopeTokenArb, {minLength: 0, maxLength: 15})
        .chain(tokens =>
            fc.array(
                fc.integer({min: 1, max: 4}).map(n => ' '.repeat(n)),
                {
                    minLength: tokens.length > 0 ? tokens.length - 1 : 0,
                    maxLength: tokens.length > 0 ? tokens.length - 1 : 0
                },
            ).map(spaces => {
                if (tokens.length === 0) return '';
                return tokens.reduce((acc, tok, i) => acc + (i > 0 ? spaces[i - 1] : '') + tok, '');
            }),
        );

    it('normalize(normalize(s)) === normalize(s) for random scope strings', () => {
        fc.assert(
            fc.property(scopeStringArb, (scopeString) => {
                const once = ScopeNormalizer.normalize(scopeString);
                const twice = ScopeNormalizer.normalize(once);
                expect(twice).toBe(once);
            }),
            {numRuns: 200},
        );
    });

    it('normalized output is deduplicated, sorted, and single-space-delimited', () => {
        fc.assert(
            fc.property(scopeStringArb, (scopeString) => {
                const normalized = ScopeNormalizer.normalize(scopeString);
                if (normalized === '') return; // empty is trivially valid

                const parts = normalized.split(' ');
                // No empty segments (no double spaces)
                expect(parts.every(p => p.length > 0)).toBe(true);
                // No duplicates
                expect(new Set(parts).size).toBe(parts.length);
                // Sorted lexicographically
                const sorted = [...parts].sort();
                expect(parts).toEqual(sorted);
            }),
            {numRuns: 200},
        );
    });

    it('idempotence holds for null and undefined inputs', () => {
        expect(ScopeNormalizer.normalize(null)).toBe('');
        expect(ScopeNormalizer.normalize(undefined)).toBe('');
        expect(ScopeNormalizer.normalize('')).toBe('');
        // Double-normalize edge cases
        expect(ScopeNormalizer.normalize(ScopeNormalizer.normalize(null))).toBe('');
        expect(ScopeNormalizer.normalize(ScopeNormalizer.normalize(''))).toBe('');
    });
});
