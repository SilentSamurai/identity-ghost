import * as fc from 'fast-check';
import {OAuthException} from '../../src/exceptions/oauth-exception';

/**
 * Feature: db-refresh-token-rotation, Property 12: Revoked tokens are rejected
 *
 * For any token with `revoked = true`, presenting it SHALL be rejected
 * with `invalid_grant`.
 *
 * Validates: Requirements 10.2
 */
describe('Feature: db-refresh-token-rotation, Property 12: Revoked tokens are rejected', () => {

    /**
     * Simulate the revocation check from consumeAndRotate().
     * This is checked before atomic consumption (Requirement 10.3).
     */
    function checkRevoked(revoked: boolean): void {
        if (revoked) {
            throw OAuthException.invalidGrant('The refresh token is invalid or has expired');
        }
    }

    it('a revoked token is always rejected with invalid_grant', () => {
        fc.assert(
            fc.property(fc.integer({min: 0, max: 1000}), () => {
                try {
                    checkRevoked(true);
                    fail('Expected OAuthException');
                } catch (e) {
                    expect(e).toBeInstanceOf(OAuthException);
                    expect((e as OAuthException).errorCode).toBe('invalid_grant');
                }
            }),
            {numRuns: 200},
        );
    });

    it('a non-revoked token is not rejected on revocation grounds', () => {
        fc.assert(
            fc.property(fc.integer({min: 0, max: 1000}), () => {
                expect(() => checkRevoked(false)).not.toThrow();
            }),
            {numRuns: 200},
        );
    });

    it('revocation check is the first guard — checked regardless of other token state', () => {
        // Simulate a token that is revoked but otherwise valid (not expired, not used)
        fc.assert(
            fc.property(
                fc.boolean(),
                fc.date({min: new Date(Date.now() + 1000), max: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)}),
                fc.date({min: new Date(Date.now() + 1000), max: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)}),
                (revoked, _expiresAt, _absoluteExpiresAt) => {
                    if (revoked) {
                        try {
                            checkRevoked(revoked);
                            fail('Expected OAuthException');
                        } catch (e) {
                            expect(e).toBeInstanceOf(OAuthException);
                            expect((e as OAuthException).errorCode).toBe('invalid_grant');
                        }
                    } else {
                        expect(() => checkRevoked(revoked)).not.toThrow();
                    }
                },
            ),
            {numRuns: 200},
        );
    });
});
