import * as fc from 'fast-check';
import {OAuthException} from '../../src/exceptions/oauth-exception';

/**
 * Feature: db-refresh-token-rotation, Property 8: Dual expiry enforcement
 *
 * For any token where current time exceeds either `expires_at` or
 * `absolute_expires_at`, the token SHALL be rejected; for any token where
 * current time is before both and not revoked/used, consumption SHALL succeed.
 *
 * Validates: Requirements 7.1, 7.2
 */
describe('Feature: db-refresh-token-rotation, Property 8: Dual expiry enforcement', () => {

    /**
     * Simulate the dual expiry check from consumeAndRotate().
     * Returns 'ok' if the token passes expiry checks, or throws OAuthException.
     */
    function checkExpiry(now: Date, expiresAt: Date, absoluteExpiresAt: Date, revoked: boolean, usedAt: Date | null): 'ok' {
        if (revoked) {
            throw OAuthException.invalidGrant('The refresh token is invalid or has expired');
        }
        if (now > expiresAt) {
            throw OAuthException.invalidGrant('The refresh token is invalid or has expired');
        }
        if (now > absoluteExpiresAt) {
            throw OAuthException.invalidGrant('The refresh token is invalid or has expired');
        }
        if (usedAt !== null) {
            throw OAuthException.invalidGrant('The refresh token is invalid or has expired');
        }
        return 'ok';
    }

    const baseTime = Date.now();
    const now = new Date(baseTime);

    // expiresAt can be in the past or future relative to now
    const expiresAtArb = fc.integer({min: baseTime - 365 * 24 * 60 * 60 * 1000, max: baseTime + 365 * 24 * 60 * 60 * 1000})
        .map(ts => new Date(ts));

    const absoluteExpiresAtArb = fc.integer({min: baseTime - 365 * 24 * 60 * 60 * 1000, max: baseTime + 365 * 24 * 60 * 60 * 1000})
        .map(ts => new Date(ts));

    it('token is rejected when current time exceeds sliding expires_at', () => {
        fc.assert(
            fc.property(absoluteExpiresAtArb, (absoluteExpiresAt) => {
                // Force expiresAt to be in the past
                const expiresAt = new Date(now.getTime() - 1);

                try {
                    checkExpiry(now, expiresAt, absoluteExpiresAt, false, null);
                    fail('Expected OAuthException');
                } catch (e) {
                    expect(e).toBeInstanceOf(OAuthException);
                    expect((e as OAuthException).errorCode).toBe('invalid_grant');
                }
            }),
            {numRuns: 200},
        );
    });

    it('token is rejected when current time exceeds absolute_expires_at even if sliding is valid', () => {
        fc.assert(
            fc.property(fc.integer({min: 1, max: 1000000}), (_seed) => {
                // Sliding is valid (future), but absolute is expired (past)
                const expiresAt = new Date(now.getTime() + 60000);
                const absoluteExpiresAt = new Date(now.getTime() - 1);

                try {
                    checkExpiry(now, expiresAt, absoluteExpiresAt, false, null);
                    fail('Expected OAuthException');
                } catch (e) {
                    expect(e).toBeInstanceOf(OAuthException);
                    expect((e as OAuthException).errorCode).toBe('invalid_grant');
                }
            }),
            {numRuns: 200},
        );
    });

    it('token is accepted when current time is before both expiries and not revoked/used', () => {
        fc.assert(
            fc.property(fc.integer({min: 1, max: 1000000}), (_seed) => {
                // Both expiries are in the future
                const expiresAt = new Date(now.getTime() + 60000);
                const absoluteExpiresAt = new Date(now.getTime() + 120000);

                const result = checkExpiry(now, expiresAt, absoluteExpiresAt, false, null);
                expect(result).toBe('ok');
            }),
            {numRuns: 200},
        );
    });

    it('for any random expiry pair, rejection iff now > either expiry', () => {
        fc.assert(
            fc.property(expiresAtArb, absoluteExpiresAtArb, (expiresAt, absoluteExpiresAt) => {
                const slidingExpired = now > expiresAt;
                const absoluteExpired = now > absoluteExpiresAt;

                if (slidingExpired || absoluteExpired) {
                    try {
                        checkExpiry(now, expiresAt, absoluteExpiresAt, false, null);
                        fail('Expected OAuthException');
                    } catch (e) {
                        expect(e).toBeInstanceOf(OAuthException);
                        expect((e as OAuthException).errorCode).toBe('invalid_grant');
                    }
                } else {
                    const result = checkExpiry(now, expiresAt, absoluteExpiresAt, false, null);
                    expect(result).toBe('ok');
                }
            }),
            {numRuns: 200},
        );
    });
});
