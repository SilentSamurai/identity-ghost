import * as fc from 'fast-check';
import {JwtService} from '@nestjs/jwt';
import * as jwt from 'jsonwebtoken';

/**
 * Feature: shared-test-infrastructure, Property 5: JWT decode round-trip
 *
 * For any valid JWT payload, signing it with jsonwebtoken.sign() and then
 * decoding with a standalone JwtService().decode() should return a payload
 * containing the same fields that were signed.
 *
 * Validates: Requirements 8.3
 */
describe('Property 5: JWT decode round-trip', () => {
    const TEST_SECRET = 'test-secret-for-property-test';
    const jwtService = new JwtService({});

    const tenantArbitrary = fc.record({
        id: fc.uuid(),
        name: fc.string({minLength: 1, maxLength: 50}),
    });

    const payloadArbitrary = fc.record({
        sub: fc.uuid(),
        scope: fc.constantFrom('openid profile email'),
        client_id: fc.string({minLength: 1, maxLength: 50}),
        tenant: tenantArbitrary,
    });

    it('decode returns the same payload fields that were signed', () => {
        fc.assert(
            fc.property(payloadArbitrary, (payload) => {
                const token = jwt.sign(payload, TEST_SECRET);
                const decoded = jwtService.decode(token) as Record<string, any>;

                expect(decoded).toBeTruthy();
                expect(decoded.sub).toBe(payload.sub);
                expect(decoded.scope).toBe(payload.scope);
                expect(decoded.client_id).toBe(payload.client_id);
                expect(decoded.tenant).toEqual(payload.tenant);
            }),
            {numRuns: 100},
        );
    });
});
