import * as fc from 'fast-check';
import { redactBody, maskAuthCode, SENSITIVE_FIELDS } from '../../src/log/redaction.util';

/**
 * Feature: security-logging-monitoring — Property-Based Tests for Redaction Utilities
 *
 * These tests exercise the redaction utility functions with randomly generated
 * inputs via fast-check, validating the correctness properties defined in the
 * design document.
 */

// ── Property 1: Sensitive field redaction preserves non-sensitive data and masks sensitive data ──

/**
 * Feature: security-logging-monitoring, Property 1: Sensitive field redaction preserves non-sensitive data and masks sensitive data
 *
 * For any request body object containing an arbitrary mix of sensitive field names
 * (from the set: password, client_secret, code, access_token, refresh_token, id_token,
 * token, code_verifier) and non-sensitive field names, applying the redaction function
 * SHALL produce an object where every sensitive field has the value "[REDACTED]" and
 * every non-sensitive field retains its original value.
 *
 * **Validates: Requirements 1.1, 1.2**
 */
describe('Feature: security-logging-monitoring, Property 1: Sensitive field redaction preserves non-sensitive data and masks sensitive data', () => {
    // Arbitrary for sensitive field names
    const sensitiveFieldArb = fc.constantFrom(
        'password',
        'client_secret',
        'code',
        'access_token',
        'refresh_token',
        'id_token',
        'token',
        'code_verifier',
    );

    // Arbitrary for non-sensitive field names (any string that's not in SENSITIVE_FIELDS)
    // Also filter out __proto__ which is a special JavaScript property that causes issues
    const nonSensitiveFieldArb = fc
        .string({ minLength: 1, maxLength: 20 })
        .filter((s) => !SENSITIVE_FIELDS.has(s) && s !== '__proto__');

    // Arbitrary for any value (string, number, boolean, null)
    const valueArb = fc.oneof(
        fc.string({ maxLength: 50 }),
        fc.integer(),
        fc.boolean(),
        fc.constantFrom(null as null),
    );

    it('every sensitive field is redacted and every non-sensitive field retains its original value', () => {
        fc.assert(
            fc.property(
                // Generate a record with sensitive fields
                fc.dictionary(sensitiveFieldArb, valueArb),
                // Generate a record with non-sensitive fields
                fc.dictionary(nonSensitiveFieldArb, valueArb),
                (sensitiveFields, nonSensitiveFields) => {
                    // Combine both into a single body object
                    const body = { ...sensitiveFields, ...nonSensitiveFields };

                    // Apply redaction
                    const result = redactBody(body);

                    // Verify all sensitive fields are redacted
                    for (const key of Object.keys(sensitiveFields)) {
                        expect(result[key]).toBe('[REDACTED]');
                    }

                    // Verify all non-sensitive fields retain their original values
                    for (const [key, value] of Object.entries(nonSensitiveFields)) {
                        expect(result[key]).toEqual(value);
                    }
                },
            ),
            { numRuns: 100 },
        );
    });

    it('empty body object returns empty object', () => {
        const body = {};
        const result = redactBody(body);
        expect(result).toEqual({});
    });

    it('body with only non-sensitive fields returns identical content', () => {
        fc.assert(
            fc.property(fc.dictionary(nonSensitiveFieldArb, valueArb), (body) => {
                const result = redactBody(body);
                expect(result).toEqual(body);
            }),
            { numRuns: 100 },
        );
    });

    it('body with only sensitive fields returns all redacted', () => {
        fc.assert(
            fc.property(fc.dictionary(sensitiveFieldArb, valueArb), (body) => {
                const result = redactBody(body);
                for (const key of Object.keys(body)) {
                    expect(result[key]).toBe('[REDACTED]');
                }
            }),
            { numRuns: 100 },
        );
    });
});

// ── Property 2: Authorization code masking format ──

/**
 * Feature: security-logging-monitoring, Property 2: Authorization code masking format
 *
 * For any string of length ≥ 1, the masking function SHALL produce a string
 * consisting of the first min(4, length) characters of the input followed by "****".
 * The output length is always min(4, length) + 4.
 *
 * **Validates: Requirements 1.4**
 */
describe('Feature: security-logging-monitoring, Property 2: Authorization code masking format', () => {
    // Arbitrary for non-empty strings (authorization codes)
    const nonEmptyStringArb = fc.string({ minLength: 1, maxLength: 100 });

    it('output format is first min(4, length) chars followed by ****', () => {
        fc.assert(
            fc.property(nonEmptyStringArb, (code) => {
                const result = maskAuthCode(code);

                const expectedPrefixLength = Math.min(4, code.length);
                const expectedPrefix = code.substring(0, expectedPrefixLength);
                const expectedOutput = `${expectedPrefix}****`;

                expect(result).toBe(expectedOutput);
            }),
            { numRuns: 100 },
        );
    });

    it('output length is min(4, length) + 4', () => {
        fc.assert(
            fc.property(nonEmptyStringArb, (code) => {
                const result = maskAuthCode(code);

                const expectedLength = Math.min(4, code.length) + 4;
                expect(result.length).toBe(expectedLength);
            }),
            { numRuns: 100 },
        );
    });

    it('codes of length 1-4 return the full code plus ****', () => {
        fc.assert(
            fc.property(fc.string({ minLength: 1, maxLength: 4 }), (code) => {
                const result = maskAuthCode(code);
                expect(result).toBe(`${code}****`);
                expect(result.length).toBe(code.length + 4);
            }),
            { numRuns: 100 },
        );
    });

    it('codes longer than 4 characters return first 4 chars plus ****', () => {
        fc.assert(
            fc.property(fc.string({ minLength: 5, maxLength: 100 }), (code) => {
                const result = maskAuthCode(code);
                expect(result).toBe(`${code.substring(0, 4)}****`);
                expect(result.length).toBe(8);
            }),
            { numRuns: 100 },
        );
    });

    it('masking is deterministic - same input always produces same output', () => {
        fc.assert(
            fc.property(nonEmptyStringArb, (code) => {
                const result1 = maskAuthCode(code);
                const result2 = maskAuthCode(code);
                expect(result1).toBe(result2);
            }),
            { numRuns: 100 },
        );
    });
});
