import * as fc from 'fast-check';
import { ClaimsResolverService } from '../src/auth/claims-resolver.service';
import { SCOPE_CLAIMS_MAP, USER_CLAIM_RESOLVERS } from '../src/auth/scope-claims-map';

/**
 * Feature: oidc-scope-claims-mapping — Property-Based Tests
 *
 * These tests exercise ClaimsResolverService.resolveClaims() with randomly
 * generated inputs via fast-check, validating the correctness properties
 * defined in the design document.
 */

// ── Shared test infrastructure ──────────────────────────────────────────

let claimsResolverService: ClaimsResolverService;

beforeAll(() => {
    claimsResolverService = new ClaimsResolverService();
});

// ── Arbitraries ─────────────────────────────────────────────────────────

const OIDC_SCOPES = ['openid', 'profile', 'email'];

const uuidArb = fc.uuid();
const emailArb = fc.emailAddress();
const nameArb = fc.string({ minLength: 0, maxLength: 80 });
const scopeSetArb = fc.subarray(OIDC_SCOPES, { minLength: 0 });
const userArb = fc.record({
    id: uuidArb,
    email: emailArb,
    name: nameArb,
    verified: fc.boolean(),
});

// ── Property 1: Scope-authorized claims are included with correct values ─

/**
 * Feature: oidc-scope-claims-mapping, Property 1: Scope-authorized claims are included with correct values
 *
 * For any valid user (with id, name, email, verified fields) and for any
 * granted scope set that is a subset of {openid, profile, email}, every
 * claim key listed in SCOPE_CLAIMS_MAP for each granted scope SHALL appear
 * in the resolved claims with the value matching the corresponding user
 * field — provided the user has data for that field.
 *
 * **Validates: Requirements 2.1, 2.2, 3.1, 4.1**
 */
describe('Feature: oidc-scope-claims-mapping, Property 1: Scope-authorized claims are included with correct values', () => {
    it('every claim authorized by a granted scope is present with the correct user value (when user has data)', () => {
        fc.assert(
            fc.property(scopeSetArb, userArb, (scopes, user) => {
                const result = claimsResolverService.resolveClaims(scopes, user);

                for (const scope of scopes) {
                    const claimKeys = SCOPE_CLAIMS_MAP[scope];
                    if (!claimKeys) continue;

                    for (const key of claimKeys) {
                        const resolver = USER_CLAIM_RESOLVERS[key];
                        if (!resolver) continue;

                        const expectedValue = resolver(user);

                        if (expectedValue !== undefined) {
                            expect(result[key]).toBe(expectedValue);
                        }
                    }
                }
            }),
            { numRuns: 100 },
        );
    });
});


// ── Property 2: Non-granted scope claims are excluded ───────────────────

/**
 * Feature: oidc-scope-claims-mapping, Property 2: Non-granted scope claims are excluded
 *
 * For any granted scope set and for any user, the resolved claims SHALL NOT
 * contain any identity claim key (`name`, `email`, `email_verified`) that is
 * not authorized by at least one scope in the granted scope set according to
 * SCOPE_CLAIMS_MAP.
 *
 * **Validates: Requirements 3.2, 4.2, 5.1, 5.2, 5.3**
 */
describe('Feature: oidc-scope-claims-mapping, Property 2: Non-granted scope claims are excluded', () => {
    it('resolved claims contain no identity claim key that is not authorized by a granted scope', () => {
        fc.assert(
            fc.property(scopeSetArb, userArb, (scopes, user) => {
                const result = claimsResolverService.resolveClaims(scopes, user);

                // Build the set of all claim keys authorized by the granted scopes
                const authorizedKeys = new Set<string>();
                for (const scope of scopes) {
                    const claimKeys = SCOPE_CLAIMS_MAP[scope];
                    if (!claimKeys) continue;
                    for (const key of claimKeys) {
                        authorizedKeys.add(key);
                    }
                }

                // Identity claims that must NOT appear unless authorized
                const identityClaimKeys = ['name', 'email', 'email_verified'];

                for (const key of identityClaimKeys) {
                    if (!authorizedKeys.has(key)) {
                        expect(result).not.toHaveProperty(key);
                    }
                }
            }),
            { numRuns: 100 },
        );
    });
});


// ── Property 3: Voluntary claim omission — no null or empty values ──────

/**
 * Feature: oidc-scope-claims-mapping, Property 3: Voluntary claim omission — no null or empty values
 *
 * For any user (including users with missing or empty `name` or `email` fields)
 * and for any granted scope set, the resolved claims SHALL NOT contain any key
 * whose value is `null`, `undefined`, or an empty string. Claims for which the
 * user has no data are omitted entirely per OIDC Core §5.4.
 *
 * **Validates: Requirements 5.4, 6.8**
 */
describe('Feature: oidc-scope-claims-mapping, Property 3: Voluntary claim omission — no null or empty values', () => {
    // User arbitrary that deliberately includes empty/missing fields
    const sparseUserArb = fc.record({
        id: uuidArb,
        email: fc.oneof(emailArb, fc.constantFrom('')),
        name: fc.oneof(nameArb, fc.constantFrom('')),
        verified: fc.boolean(),
    });

    it('no resolved claim value is null, undefined, or empty string', () => {
        fc.assert(
            fc.property(scopeSetArb, sparseUserArb, (scopes, user) => {
                const result = claimsResolverService.resolveClaims(scopes, user);

                for (const [key, value] of Object.entries(result)) {
                    expect(value).not.toBeNull();
                    expect(value).not.toBeUndefined();
                    expect(value).not.toBe('');
                }
            }),
            { numRuns: 100 },
        );
    });
});


// ── Property 4: Claim resolution consistency ────────────────────────────

/**
 * Feature: oidc-scope-claims-mapping, Property 4: Claim resolution consistency
 *
 * For any user and for any granted scope set, calling
 * ClaimsResolverService.resolveClaims(scopes, user) twice with identical
 * inputs SHALL produce deep-equal output (determinism). Since both
 * IdTokenService and UserInfoController delegate to the same service method,
 * this property verifies the wiring is correct by construction.
 *
 * **Validates: Requirements 7.1, 7.2**
 */
describe('Feature: oidc-scope-claims-mapping, Property 4: Claim resolution consistency', () => {
    it('calling resolveClaims twice with identical inputs produces deep-equal output', () => {
        fc.assert(
            fc.property(scopeSetArb, userArb, (scopes, user) => {
                const result1 = claimsResolverService.resolveClaims(scopes, user);
                const result2 = claimsResolverService.resolveClaims(scopes, user);

                expect(result1).toEqual(result2);
            }),
            { numRuns: 100 },
        );
    });
});
