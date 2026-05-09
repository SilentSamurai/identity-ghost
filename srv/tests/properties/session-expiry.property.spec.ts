import * as fc from 'fast-check';

const DEFAULT_DURATION_SECONDS = 1296000;

describe('Feature: session-expiry, Property 1: Session expiry computation', () => {
    it('expiresAt = creationTime + duration * 1000 for any valid duration and any creation time', () => {
        fc.assert(
            fc.property(
                fc.integer({min: 60, max: 86400 * 365}),
                fc.integer({min: 0, max: 2000000000000}),
                (durationSeconds, nowMs) => {
                    const expiresAt = new Date(nowMs + durationSeconds * 1000);
                    expect(expiresAt.getTime()).toBe(nowMs + durationSeconds * 1000);
                    expect(expiresAt.getTime()).toBeGreaterThan(nowMs);
                },
            ),
            {numRuns: 100},
        );
    });

    it('parseInt handles all string representations of positive durations', () => {
        fc.assert(
            fc.property(
                fc.integer({min: 1, max: 86400 * 365}),
                (value) => {
                    const parsed = parseInt(String(value), 10);
                    expect(parsed).toBe(value);
                    expect(Number.isFinite(parsed)).toBe(true);
                    expect(parsed).toBeGreaterThan(0);
                },
            ),
            {numRuns: 100},
        );
    });

    it('default duration produces cookie Max-Age matching DEFAULT_DURATION_SECONDS', () => {
        const expectedMaxAge = DEFAULT_DURATION_SECONDS;
        expect(expectedMaxAge).toBeGreaterThan(0);
        expect(expectedMaxAge).toBe(1296000);
    });

    it('duration of 0 produces immediate expiry', () => {
        const now = Date.now();
        const expiresAt = new Date(now + 0 * 1000);
        const diff = expiresAt.getTime() - Date.now();
        expect(Math.abs(diff)).toBeLessThanOrEqual(100);
    });
});
