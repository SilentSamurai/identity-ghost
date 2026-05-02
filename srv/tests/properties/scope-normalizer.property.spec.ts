import * as fc from 'fast-check';
import {ScopeNormalizer} from '../../src/casl/scope-normalizer';

/**
 * Supplementary property tests for ScopeNormalizer.
 *
 * These cover the same three core properties (idempotence, round-trip, validation)
 * as the dedicated property test files, but use broader fast-check string generators
 * (including arbitrary Unicode) to stress-test edge cases that realistic OAuth scope
 * tokens wouldn't normally hit.
 */
describe('ScopeNormalizer Properties', () => {
    // Property 1: Scope normalization idempotence
    // Normalizing any string twice must produce the same result as normalizing once.
    // Uses arbitrary strings (including whitespace, empty, Unicode) to catch edge cases.
    it('should be idempotent (Property 1)', () => {
        fc.assert(
            fc.property(
                fc.array(fc.string(), {minLength: 0, maxLength: 10}).map(arr => arr.join(' ')),
                (scopeString) => {
                    const normalizedOnce = ScopeNormalizer.normalize(scopeString);
                    const normalizedTwice = ScopeNormalizer.normalize(normalizedOnce);
                    return normalizedOnce === normalizedTwice;
                }
            )
        );
    });

    // Property 2: Scope parse/format round-trip
    // Formatting a set of unique, non-whitespace scope tokens and parsing the result back
    // must yield the same deduplicated, sorted set. Filters out whitespace-containing
    // strings since those would be split into multiple tokens by parse().
    it('should round-trip correctly (Property 2)', () => {
        fc.assert(
            fc.property(
                fc.uniqueArray(fc.string(), {minLength: 0, maxLength: 10}),
                (scopes) => {
                    // Exclude strings that would be split into multiple scopes or are just whitespace
                    const validScopes = scopes
                        .map(s => s.trim())
                        .filter(s => s.length > 0 && !/\s/.test(s));

                    const formatted = ScopeNormalizer.format(validScopes);
                    const parsed = ScopeNormalizer.parse(formatted);
                    const expected = Array.from(new Set(validScopes)).sort();

                    return JSON.stringify(parsed) === JSON.stringify(expected);
                }
            )
        );
    });

    // Property 3: Invalid scope character rejection
    // For any arbitrary string, validate() must return true iff every character is in the
    // NQSCHAR + space range (printable ASCII excluding backslash and double-quote).
    // This uses fully random strings to ensure the validator doesn't have false positives
    // or false negatives on unexpected input.
    it('should validate correctly (Property 3)', () => {
        const validChars = ' !#$%&\'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[]^_`abcdefghijklmnopqrstuvwxyz{|}~';

        fc.assert(
            fc.property(
                fc.string(),
                (anyString) => {
                    const isValidNqschar = /^[ !#$%&'()*+,\-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\]^_`abcdefghijklmnopqrstuvwxyz{|}~]*$/.test(anyString);
                    return ScopeNormalizer.validate(anyString) === isValidNqschar;
                }
            )
        );
    });
});
