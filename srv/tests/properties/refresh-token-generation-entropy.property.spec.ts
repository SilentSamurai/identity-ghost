import * as fc from 'fast-check';
import {generateOpaqueToken} from '../../src/auth/refresh-token.service';

/**
 * Feature: db-refresh-token-rotation, Property 1: Token generation produces sufficient entropy
 *
 * For any call to the token generation function, the returned opaque string
 * SHALL have at least 32 bytes of entropy, and any two independently generated
 * tokens SHALL be distinct.
 *
 * Validates: Requirements 1.1
 */
describe('Feature: db-refresh-token-rotation, Property 1: Token generation produces sufficient entropy', () => {

    it('each generated token decodes from base64url to at least 32 bytes', () => {
        fc.assert(
            fc.property(fc.integer({min: 0, max: 1000}), () => {
                const token = generateOpaqueToken();
                const decoded = Buffer.from(token, 'base64url');
                expect(decoded.length).toBeGreaterThanOrEqual(32);
            }),
            {numRuns: 200},
        );
    });

    it('any two independently generated tokens are distinct', () => {
        fc.assert(
            fc.property(fc.integer({min: 0, max: 1000}), () => {
                const tokenA = generateOpaqueToken();
                const tokenB = generateOpaqueToken();
                expect(tokenA).not.toEqual(tokenB);
            }),
            {numRuns: 200},
        );
    });

    it('generated tokens are valid base64url strings', () => {
        fc.assert(
            fc.property(fc.integer({min: 0, max: 1000}), () => {
                const token = generateOpaqueToken();
                // base64url alphabet: A-Z, a-z, 0-9, -, _ (no padding =)
                expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
                // Round-trip: encoding the decoded bytes back should yield the same string
                const decoded = Buffer.from(token, 'base64url');
                const reEncoded = decoded.toString('base64url');
                expect(reEncoded).toEqual(token);
            }),
            {numRuns: 200},
        );
    });
});
