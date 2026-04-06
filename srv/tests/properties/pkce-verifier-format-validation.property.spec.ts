import * as fc from 'fast-check';
import {ValidationSchema} from '../../src/validation/validation.schema';

/**
 * Feature: pkce-compliance, Property 1: Code verifier format validation
 *
 * For any string, the CodeGrantSchema code_verifier validator accepts it
 * if and only if the string has length in [43, 128] AND every character
 * belongs to the unreserved set [A-Za-z0-9\-._~].
 * Strings violating either condition are rejected.
 *
 * Validates: Requirements 1.1, 1.2, 1.3, 1.4
 */
describe('Property 1: Code verifier format validation', () => {

    // Valid base fields that satisfy the rest of CodeGrantSchema
    const validBase = {
        grant_type: 'authorization_code',
        code: 'some-auth-code',
        client_id: 'some-client-id',
    };

    const UNRESERVED_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';

    // Arbitrary: single valid unreserved character
    const unreservedCharArb = fc.constantFrom(...UNRESERVED_CHARS.split(''));

    // Arbitrary: valid code_verifier (length 43-128, unreserved charset)
    const validVerifierArb = fc.integer({min: 43, max: 128}).chain((len: number) =>
        fc.array(unreservedCharArb, {minLength: len, maxLength: len})
            .map((chars: string[]) => chars.join('')),
    );

    // Arbitrary: verifier too short (1-42 chars, valid charset)
    const tooShortVerifierArb = fc.integer({min: 1, max: 42}).chain((len: number) =>
        fc.array(unreservedCharArb, {minLength: len, maxLength: len})
            .map((chars: string[]) => chars.join('')),
    );

    // Arbitrary: verifier too long (129-200 chars, valid charset)
    const tooLongVerifierArb = fc.integer({min: 129, max: 200}).chain((len: number) =>
        fc.array(unreservedCharArb, {minLength: len, maxLength: len})
            .map((chars: string[]) => chars.join('')),
    );

    // Arbitrary: invalid character (outside unreserved set)
    const invalidCharArb = fc.oneof(
        fc.constantFrom(' ', '@', '#', '$', '!', '+', '/', '=', '(', ')'),
        fc.integer({min: 0x80, max: 0xFF}).map((c: number) => String.fromCharCode(c)),
    );

    // Arbitrary: verifier with valid length but containing at least one invalid char
    const invalidCharsetVerifierArb = fc.integer({min: 43, max: 128}).chain((len: number) =>
        fc.tuple(
            fc.integer({min: 0, max: len - 1}),
            invalidCharArb,
            fc.array(unreservedCharArb, {minLength: len - 1, maxLength: len - 1}),
        ).map(([pos, badChar, base]: [number, string, string[]]) => {
            const str = base.join('');
            return str.slice(0, pos) + badChar + str.slice(pos);
        }),
    );

    async function validateVerifier(verifier: string): Promise<boolean> {
        try {
            await ValidationSchema.CodeGrantSchema.validate({...validBase, code_verifier: verifier});
            return true;
        } catch {
            return false;
        }
    }

    it('accepts verifiers with valid length [43,128] and unreserved charset', async () => {
        await fc.assert(
            fc.asyncProperty(validVerifierArb, async (verifier: string) => {
                const result = await validateVerifier(verifier);
                expect(result).toBe(true);
            }),
            {numRuns: 200},
        );
    });

    it('rejects verifiers shorter than 43 characters', async () => {
        await fc.assert(
            fc.asyncProperty(tooShortVerifierArb, async (verifier: string) => {
                const result = await validateVerifier(verifier);
                expect(result).toBe(false);
            }),
            {numRuns: 200},
        );
    });

    it('rejects verifiers longer than 128 characters', async () => {
        await fc.assert(
            fc.asyncProperty(tooLongVerifierArb, async (verifier: string) => {
                const result = await validateVerifier(verifier);
                expect(result).toBe(false);
            }),
            {numRuns: 200},
        );
    });

    it('rejects verifiers with invalid characters even if length is valid', async () => {
        await fc.assert(
            fc.asyncProperty(invalidCharsetVerifierArb, async (verifier: string) => {
                const result = await validateVerifier(verifier);
                expect(result).toBe(false);
            }),
            {numRuns: 200},
        );
    });
});
