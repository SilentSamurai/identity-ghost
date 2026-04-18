import * as fc from 'fast-check';
import { ClaimsResolverService } from '../../src/auth/claims-resolver.service';
import { SCOPE_CLAIMS_MAP } from '../../src/auth/scope-claims-map';

/**
 * Feature: userinfo-endpoint — Property-Based Tests
 *
 * Property 5: Sub safety net fallback
 *
 * For any user and for any granted scope set that does NOT include `openid`,
 * the ClaimsResolverService SHALL still produce a `sub` claim equal to the
 * user's UUID via the safety net fallback.
 *
 * **Validates: Requirements 5.1, 5.2, 5.3**
 */

let claimsResolverService: ClaimsResolverService;

beforeAll(() => {
    claimsResolverService = new ClaimsResolverService();
});

// ── Arbitraries ─────────────────────────────────────────────────────────

const uuidArb = fc.uuid();
const emailArb = fc.emailAddress();
const nameArb = fc.string({ minLength: 0, maxLength: 80 });

// Scope set that explicitly excludes 'openid' (subsets of ['profile', 'email'])
const scopeSetWithoutOpenidArb = fc.subarray(['profile', 'email'], { minLength: 0 });

const userArb = fc.record({
    id: uuidArb,
    email: emailArb,
    name: nameArb,
    verified: fc.boolean(),
});

// ── Property 5: Sub safety net fallback ─────────────────────────────────

/**
 * Feature: userinfo-endpoint, Property 5: Sub safety net fallback
 *
 * For any user and for any granted scope set that does NOT include `openid`,
 * the ClaimsResolverService SHALL still produce a `sub` claim equal to the
 * user's UUID via the safety net fallback.
 *
 * **Validates: Requirements 5.1, 5.2, 5.3**
 */
describe('Feature: userinfo-endpoint, Property 5: Sub safety net fallback', () => {
    it('sub claim is always present and equals user.id even when openid is not granted', () => {
        fc.assert(
            fc.property(scopeSetWithoutOpenidArb, userArb, (scopes, user) => {
                // Verify that 'openid' is not in the scope set
                expect(scopes).not.toContain('openid');

                const result = claimsResolverService.resolveClaims(scopes, user);

                // Property 5.1: sub claim is always present
                expect(result).toHaveProperty('sub');
                expect(result.sub).toBeDefined();

                // Property 5.2: sub claim equals user.id
                expect(result.sub).toBe(user.id);
            }),
            { numRuns: 100 },
        );
    });
});
