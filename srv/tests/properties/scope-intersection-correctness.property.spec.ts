import * as fc from 'fast-check';
import {ScopeResolverService} from '../../src/casl/scope-resolver.service';
import {ScopeNormalizer} from '../../src/casl/scope-normalizer';
import {BadRequestException} from '@nestjs/common';

/**
 * Feature: scope-model-refactoring, Property 4: Scope intersection correctness (two-way)
 *
 * For any two sets of scopes (requested, client-allowed), resolveScopes()
 * shall return exactly their intersection. When the requested scope is omitted
 * (null), the client-allowed scopes shall be used as the requested set.
 *
 * Validates: Requirements 2.1, 2.3
 */
describe('Property 4: Scope intersection correctness', () => {
    const resolver = new ScopeResolverService();

    const oauthScopes = ['openid', 'profile', 'email'];
    const scopeSubsetArb = fc.subarray(oauthScopes, {minLength: 1});

    /** Compute expected intersection of sorted, deduplicated arrays */
    function expectedIntersection(...arrays: string[][]): string[] {
        if (arrays.length === 0) return [];
        let result = new Set(arrays[0]);
        for (let i = 1; i < arrays.length; i++) {
            const other = new Set(arrays[i]);
            result = new Set([...result].filter(x => other.has(x)));
        }
        return Array.from(result).sort();
    }

    describe('resolveScopes — two-way intersection', () => {
        it('returns requested ∩ clientAllowed', () => {
            fc.assert(
                fc.property(scopeSubsetArb, scopeSubsetArb, (requested, clientAllowed) => {
                    const requestedStr = ScopeNormalizer.format(requested);
                    const clientAllowedStr = ScopeNormalizer.format(clientAllowed);

                    const expected = expectedIntersection(requested, clientAllowed);

                    if (expected.length === 0) {
                        expect(() => resolver.resolveScopes(requestedStr, clientAllowedStr))
                            .toThrow(BadRequestException);
                    } else {
                        const result = resolver.resolveScopes(requestedStr, clientAllowedStr);
                        expect(result).toEqual(expected);
                    }
                }),
                {numRuns: 200},
            );
        });
    });

    describe('null requestedScope falls back to clientAllowed', () => {
        it('resolveScopes with null requested returns clientAllowed', () => {
            fc.assert(
                fc.property(scopeSubsetArb, (clientAllowed) => {
                    const clientAllowedStr = ScopeNormalizer.format(clientAllowed);
                    // With null, requested = clientAllowed, so intersection = clientAllowed
                    const expected = ScopeNormalizer.parse(clientAllowedStr);

                    const result = resolver.resolveScopes(null, clientAllowedStr);
                    expect(result).toEqual(expected);
                }),
                {numRuns: 200},
            );
        });
    });
});
