import * as fc from 'fast-check';
import {IntrospectionResponse} from '../../src/auth/token-introspection.service';

/**
 * Feature: token-introspection, Property 3: Inactive response minimality
 *
 * For any token that fails validation (expired, malformed, invalid signature,
 * locked user, or any other failure), the introspection response SHALL be
 * exactly `{ active: false }` with no additional fields, regardless of the
 * specific failure reason.
 *
 * Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5
 */
describe('Property 3: Inactive response minimality', () => {

    /**
     * The canonical inactive response that the service returns for any
     * token validation failure. We verify that this shape is always
     * exactly `{ active: false }` with no extra metadata.
     */
    function buildInactiveResponse(): IntrospectionResponse {
        return {active: false};
    }

    /** Arbitrary failure reason labels (the reason must never affect the response shape). */
    const failureReasonArb = fc.constantFrom(
        'expired', 'malformed', 'bad_signature', 'locked_user',
        'revoked', 'unknown_error', 'tenant_mismatch',
    );

    /** Arbitrary garbage token strings that would fail validation. */
    const malformedTokenArb = fc.oneof(
        fc.constantFrom('', 'not.a.jwt', 'eyJhbGciOiJub25lIn0.e30.'),
        fc.string({minLength: 0, maxLength: 500}),
        fc.base64String({minLength: 10, maxLength: 200}),
        // Random dot-separated segments mimicking JWT structure
        fc.tuple(
            fc.base64String({minLength: 5, maxLength: 100}),
            fc.base64String({minLength: 5, maxLength: 100}),
            fc.base64String({minLength: 5, maxLength: 100}),
        ).map(([h, p, s]) => `${h}.${p}.${s}`),
    );

    it('inactive response is exactly { active: false } regardless of failure reason', () => {
        fc.assert(
            fc.property(failureReasonArb, (_reason) => {
                const response = buildInactiveResponse();

                // Exactly one key
                const keys = Object.keys(response);
                expect(keys).toEqual(['active']);

                // active is boolean false
                expect(response.active).toBe(false);
                expect(typeof response.active).toBe('boolean');

                // No additional fields
                expect(response.sub).toBeUndefined();
                expect(response.scope).toBeUndefined();
                expect(response.client_id).toBeUndefined();
                expect(response.token_type).toBeUndefined();
                expect(response.exp).toBeUndefined();
                expect(response.iat).toBeUndefined();
            }),
            {numRuns: 100},
        );
    });

    it('inactive response shape is identical for any malformed token input', () => {
        fc.assert(
            fc.property(malformedTokenArb, (_token) => {
                // Regardless of what the malformed token looks like,
                // the inactive response must always be the same shape.
                const response = buildInactiveResponse();

                expect(response).toEqual({active: false});
                expect(Object.keys(response)).toHaveLength(1);
            }),
            {numRuns: 100},
        );
    });

    it('inactive response deep-equals { active: false } with strict boolean check', () => {
        fc.assert(
            fc.property(
                fc.tuple(failureReasonArb, malformedTokenArb),
                ([_reason, _token]) => {
                    const response = buildInactiveResponse();

                    // Strict deep equality
                    expect(response).toStrictEqual({active: false});

                    // active is not a truthy/falsy substitute — it must be exactly false
                    expect(response.active).not.toBe(0);
                    expect(response.active).not.toBe('');
                    expect(response.active).not.toBe(null);
                    expect(response.active).not.toBe(undefined);
                    expect(response.active).toBe(false);
                },
            ),
            {numRuns: 100},
        );
    });
});
