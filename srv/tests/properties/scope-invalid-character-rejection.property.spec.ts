import * as fc from 'fast-check';
import {ScopeNormalizer} from '../../src/casl/scope-normalizer';

/**
 * Feature: scope-model-refactoring, Property 3: Invalid scope character rejection
 *
 * For any string containing characters outside the NQSCHAR range (printable
 * ASCII excluding backslash `\` and double-quote `"`), the
 * ScopeNormalizer.validate() method shall return false. Conversely, for any
 * string composed only of valid NQSCHAR characters and spaces, validate()
 * shall return true.
 *
 * NQSCHAR = %x21 / %x23-5B / %x5D-7E  (per RFC 6749 §3.3)
 * Space (%x20) is allowed as the scope delimiter.
 * So the full valid range for a scope string is: %x20-21 / %x23-5B / %x5D-7E
 *
 * Validates: Requirements 1.6
 */
describe('Property 3: Invalid scope character rejection', () => {
    // Arbitrary producing strings of only valid NQSCHAR + space characters
    const validScopeCharArb = fc.stringMatching(/^[\x20-\x21\x23-\x5B\x5D-\x7E]$/);
    const validScopeStringArb = fc.array(validScopeCharArb, {minLength: 1, maxLength: 60})
        .map(chars => chars.join(''));

    // Arbitrary producing strings that contain at least one invalid character
    // Invalid chars: \x00-\x1F (control), \x22 ("), \x5C (\), \x7F+
    const invalidCharArb = fc.oneof(
        fc.integer({min: 0x00, max: 0x1F}).map(c => String.fromCharCode(c)),   // control chars
        fc.integer({min: 0x22, max: 0x22}).map(c => String.fromCharCode(c)),   // double-quote
        fc.integer({min: 0x5C, max: 0x5C}).map(c => String.fromCharCode(c)),   // backslash
        fc.integer({min: 0x7F, max: 0xFF}).map(c => String.fromCharCode(c)),   // DEL + extended ASCII
    );

    const stringWithInvalidCharArb = fc.tuple(
        fc.array(validScopeCharArb, {minLength: 0, maxLength: 20}),
        invalidCharArb,
        fc.array(validScopeCharArb, {minLength: 0, maxLength: 20}),
    ).map(([prefix, bad, suffix]) => prefix.join('') + bad + suffix.join(''));

    it('validate() returns true for strings composed only of valid NQSCHAR + space characters', () => {
        fc.assert(
            fc.property(validScopeStringArb, (scopeString) => {
                expect(ScopeNormalizer.validate(scopeString)).toBe(true);
            }),
            {numRuns: 200},
        );
    });

    it('validate() returns false for strings containing non-NQSCHAR characters', () => {
        fc.assert(
            fc.property(stringWithInvalidCharArb, (scopeString) => {
                expect(ScopeNormalizer.validate(scopeString)).toBe(false);
            }),
            {numRuns: 200},
        );
    });

    it('validate() returns true for null, undefined, and empty string', () => {
        expect(ScopeNormalizer.validate(null)).toBe(true);
        expect(ScopeNormalizer.validate(undefined)).toBe(true);
        expect(ScopeNormalizer.validate('')).toBe(true);
    });

    it('validate() rejects specific known-invalid characters', () => {
        expect(ScopeNormalizer.validate('openid"profile')).toBe(false);   // double-quote
        expect(ScopeNormalizer.validate('openid\\profile')).toBe(false);  // backslash
        expect(ScopeNormalizer.validate('openid\x00profile')).toBe(false); // null byte
        expect(ScopeNormalizer.validate('openid\nprofile')).toBe(false);  // newline
        expect(ScopeNormalizer.validate('openid\tprofile')).toBe(false);  // tab
    });

    it('validate() accepts specific known-valid scope strings', () => {
        expect(ScopeNormalizer.validate('openid profile email')).toBe(true);
        expect(ScopeNormalizer.validate('tenant.read tenant.write')).toBe(true);
        expect(ScopeNormalizer.validate('a')).toBe(true);
        expect(ScopeNormalizer.validate('!#$%&\'()*+,-./:;<=>?@[]^_`{|}~')).toBe(true);
    });
});
