import * as fc from 'fast-check';
import {ScopeNormalizer} from '../../src/casl/scope-normalizer';
import {TechnicalTokenService} from '../../src/core/technical-token.service';

/**
 * Feature: scope-model-refactoring, Property 6: Technical token scope merging
 *
 * For any set of additional scopes passed to TechnicalTokenService.createTechnicalToken(),
 * the resulting token's scopes shall be the normalized union of the default scopes
 * (openid, profile, email, tenant.read) and the additional scopes. The result shall
 * be deduplicated and sorted.
 *
 * Validates: Requirements 8.1, 8.2
 */
describe('Property 6: Technical token scope merging', () => {
    const DEFAULT_SCOPES = ['openid', 'profile', 'email', 'tenant.read'];

    const fakeTenant = {
        id: 'tenant-1',
        name: 'Test Tenant',
        domain: 'test.example.com',
        privateKey: 'unused',
    } as any;

    // Create service with a no-op token generator (createTechnicalToken doesn't use it)
    const service = new TechnicalTokenService({sign: async () => ''} as any);

    const scopeTokenArb = fc.oneof(
        fc.constantFrom('openid', 'profile', 'email', 'tenant.read', 'tenant.write'),
        fc.string({
            unit: fc.stringMatching(/^[a-z]$/),
            minLength: 1,
            maxLength: 15,
        }),
    );

    const additionalScopesArb = fc.array(scopeTokenArb, {minLength: 0, maxLength: 10});

    it('result is the normalized union of defaults and additional scopes', () => {
        fc.assert(
            fc.property(additionalScopesArb, (additionalScopes) => {
                const token = service.createTechnicalToken(fakeTenant, additionalScopes);

                const expectedUnion = [...DEFAULT_SCOPES, ...additionalScopes];
                const expected = ScopeNormalizer.parse(ScopeNormalizer.format(expectedUnion));

                expect(token.scopes).toEqual(expected);
            }),
            {numRuns: 200},
        );
    });

    it('result always contains the default scopes', () => {
        fc.assert(
            fc.property(additionalScopesArb, (additionalScopes) => {
                const token = service.createTechnicalToken(fakeTenant, additionalScopes);

                for (const scope of DEFAULT_SCOPES) {
                    expect(token.scopes).toContain(scope);
                }
            }),
            {numRuns: 200},
        );
    });

    it('result is deduplicated and sorted', () => {
        fc.assert(
            fc.property(additionalScopesArb, (additionalScopes) => {
                const token = service.createTechnicalToken(fakeTenant, additionalScopes);

                // No duplicates
                expect(new Set(token.scopes).size).toBe(token.scopes.length);
                // Sorted lexicographically
                expect(token.scopes).toEqual([...token.scopes].sort());
            }),
            {numRuns: 200},
        );
    });

    it('handles non-array roles gracefully (null, undefined)', () => {
        const tokenNull = service.createTechnicalToken(fakeTenant, null as any);
        const tokenUndef = service.createTechnicalToken(fakeTenant, undefined as any);

        const expectedDefault = ScopeNormalizer.parse(ScopeNormalizer.format(DEFAULT_SCOPES));
        expect(tokenNull.scopes).toEqual(expectedDefault);
        expect(tokenUndef.scopes).toEqual(expectedDefault);
    });
});
