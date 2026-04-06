import * as fc from 'fast-check';
import {validateScopeSubset} from '../../src/auth/refresh-token.service';
import {OAuthException} from '../../src/exceptions/oauth-exception';

/**
 * Feature: db-refresh-token-rotation, Property 9: Scope down-scoping is a subset check
 *
 * For any scope set S and requested set R: if R ⊆ S then accept with granted scope R;
 * if R ⊄ S then reject with `invalid_scope`.
 *
 * Validates: Requirements 8.1, 8.2
 */
describe('Feature: db-refresh-token-rotation, Property 9: Scope down-scoping is a subset check', () => {
    const oauthScopes = ['openid', 'profile', 'email'];
    const scopeSubsetArb = fc.subarray(oauthScopes, {minLength: 1});

    it('when R ⊆ S, validateScopeSubset returns the granted scope equal to R', () => {
        fc.assert(
            fc.property(scopeSubsetArb, scopeSubsetArb, (requested, record) => {
                const requestedSet = new Set(requested);
                const recordSet = new Set(record);
                const isSubset = [...requestedSet].every(s => recordSet.has(s));

                if (isSubset) {
                    const result = validateScopeSubset(requested.join(' '), record.join(' '));
                    const resultScopes = new Set(result.split(' ').filter(Boolean));
                    expect(resultScopes).toEqual(requestedSet);
                }
            }),
            {numRuns: 200},
        );
    });

    it('when R ⊄ S (R contains at least one element not in S), validateScopeSubset throws OAuthException with invalid_scope', () => {
        fc.assert(
            fc.property(scopeSubsetArb, scopeSubsetArb, (requested, record) => {
                const requestedSet = new Set(requested);
                const recordSet = new Set(record);
                const isSubset = [...requestedSet].every(s => recordSet.has(s));

                if (!isSubset) {
                    try {
                        validateScopeSubset(requested.join(' '), record.join(' '));
                        fail('Expected OAuthException to be thrown');
                    } catch (e) {
                        expect(e).toBeInstanceOf(OAuthException);
                        expect((e as OAuthException).errorCode).toBe('invalid_scope');
                    }
                }
            }),
            {numRuns: 200},
        );
    });

    it('when R = S (exact match), the function succeeds and returns S', () => {
        fc.assert(
            fc.property(scopeSubsetArb, (scopes) => {
                const scopeStr = scopes.join(' ');
                const result = validateScopeSubset(scopeStr, scopeStr);
                const resultScopes = new Set(result.split(' ').filter(Boolean));
                expect(resultScopes).toEqual(new Set(scopes));
            }),
            {numRuns: 200},
        );
    });
});
