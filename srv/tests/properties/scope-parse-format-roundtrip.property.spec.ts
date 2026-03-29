import * as fc from 'fast-check';
import {ScopeNormalizer} from '../../src/casl/scope-normalizer';

/**
 * Feature: scope-model-refactoring, Property 2: Scope parse/format round-trip
 *
 * For any valid set of scope values, formatting the set into a space-delimited
 * string and then parsing it back shall produce the same set of scope values.
 * That is, parse(format(scopes)) ≡ scopes (after normalization).
 * Conversely, parse(format(parse(input))) ≡ parse(input) for all valid scope
 * input strings.
 *
 * Validates: Requirements 11.1, 1.1
 */
describe('Property 2: Scope parse/format round-trip', () => {
    // Arbitrary: a single scope token (no whitespace, valid NQSCHAR chars)
    const scopeTokenArb = fc.oneof(
        fc.constantFrom('openid', 'profile', 'email', 'tenant.read', 'tenant.write'),
        fc.string({
            unit: fc.stringMatching(/^[!#-\[\]-~]$/),
            minLength: 1,
            maxLength: 20,
        }),
    );

    // Arbitrary: array of scope tokens
    const scopeArrayArb = fc.array(scopeTokenArb, {minLength: 0, maxLength: 15});

    // Arbitrary: scope string with varying whitespace between tokens
    const scopeStringArb = scopeArrayArb.chain(tokens =>
        fc.array(
            fc.integer({min: 1, max: 4}).map(n => ' '.repeat(n)),
            {
                minLength: tokens.length > 0 ? tokens.length - 1 : 0,
                maxLength: tokens.length > 0 ? tokens.length - 1 : 0,
            },
        ).map(spaces => {
            if (tokens.length === 0) return '';
            return tokens.reduce((acc, tok, i) => acc + (i > 0 ? spaces[i - 1] : '') + tok, '');
        }),
    );

    it('parse(format(scopes)) equals deduplicated sorted input', () => {
        fc.assert(
            fc.property(scopeArrayArb, (scopes: string[]) => {
                const formatted = ScopeNormalizer.format(scopes);
                const reparsed = ScopeNormalizer.parse(formatted);

                const expected = Array.from(new Set(scopes))
                    .filter(s => s.length > 0)
                    .sort();

                expect(reparsed).toEqual(expected);
            }),
            {numRuns: 200},
        );
    });

    it('parse(format(parse(input))) ≡ parse(input) for all valid scope strings', () => {
        fc.assert(
            fc.property(scopeStringArb, (input: string) => {
                const parsed = ScopeNormalizer.parse(input);
                const roundTripped = ScopeNormalizer.parse(ScopeNormalizer.format(parsed));
                expect(roundTripped).toEqual(parsed);
            }),
            {numRuns: 200},
        );
    });

    it('format(parse(s)) produces a single-space-delimited string with no leading/trailing spaces', () => {
        fc.assert(
            fc.property(scopeStringArb, (input: string) => {
                const result = ScopeNormalizer.format(ScopeNormalizer.parse(input));
                if (result === '') return;

                // No leading or trailing spaces
                expect(result).toBe(result.trim());
                // No consecutive spaces
                expect(result).not.toMatch(/  /);
            }),
            {numRuns: 200},
        );
    });

    it('round-trip handles edge cases: empty string, null, undefined', () => {
        expect(ScopeNormalizer.parse(ScopeNormalizer.format([]))).toEqual([]);
        expect(ScopeNormalizer.parse(ScopeNormalizer.format(['']))).toEqual([]);
        expect(ScopeNormalizer.format(ScopeNormalizer.parse(null))).toBe('');
        expect(ScopeNormalizer.format(ScopeNormalizer.parse(undefined))).toBe('');
        expect(ScopeNormalizer.format(ScopeNormalizer.parse(''))).toBe('');
    });
});
