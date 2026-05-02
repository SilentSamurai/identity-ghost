import * as fc from 'fast-check';
import {clampExpiry} from '../../src/auth/refresh-token.service';

/**
 * Feature: db-refresh-token-rotation, Property 5: Sliding expiry clamped to absolute expiry
 *
 * For any sliding duration and absolute expiry, the new token's `expires_at`
 * never exceeds `absolute_expires_at`.
 *
 * Validates: Requirements 7.4
 */
describe('Feature: db-refresh-token-rotation, Property 5: Sliding expiry clamped to absolute expiry', () => {
    const now = Date.now();
    const slidingDurationArb = fc.integer({min: 1, max: 365 * 24 * 60 * 60 * 1000});
    const absoluteExpiryArb = fc.integer({min: now, max: now + 2 * 365 * 24 * 60 * 60 * 1000}).map(
        (ts) => new Date(ts),
    );

    it('clampExpiry never exceeds absoluteExpiresAt', () => {
        fc.assert(
            fc.property(slidingDurationArb, absoluteExpiryArb, (slidingMs, absoluteExpiresAt) => {
                const result = clampExpiry(slidingMs, absoluteExpiresAt);
                expect(result.getTime()).toBeLessThanOrEqual(absoluteExpiresAt.getTime());
            }),
            {numRuns: 200},
        );
    });

    it('when sliding expiry exceeds absolute, result equals absoluteExpiresAt', () => {
        fc.assert(
            fc.property(slidingDurationArb, absoluteExpiryArb, (slidingMs, absoluteExpiresAt) => {
                const slidingExpiry = new Date(Date.now() + slidingMs);
                const result = clampExpiry(slidingMs, absoluteExpiresAt);

                if (slidingExpiry > absoluteExpiresAt) {
                    expect(result.getTime()).toEqual(absoluteExpiresAt.getTime());
                }
            }),
            {numRuns: 200},
        );
    });

    it('when sliding expiry is within absolute, result is approximately now + slidingMs', () => {
        fc.assert(
            fc.property(slidingDurationArb, absoluteExpiryArb, (slidingMs, absoluteExpiresAt) => {
                const beforeCall = Date.now();
                const result = clampExpiry(slidingMs, absoluteExpiresAt);
                const afterCall = Date.now();

                const slidingExpiry = new Date(beforeCall + slidingMs);

                if (slidingExpiry < absoluteExpiresAt) {
                    // Result should be approximately now + slidingMs, within execution tolerance
                    const tolerance = afterCall - beforeCall + 5; // ms tolerance for test execution
                    expect(result.getTime()).toBeGreaterThanOrEqual(beforeCall + slidingMs);
                    expect(result.getTime()).toBeLessThanOrEqual(afterCall + slidingMs + tolerance);
                }
            }),
            {numRuns: 200},
        );
    });
});
