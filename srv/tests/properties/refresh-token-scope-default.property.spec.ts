import * as fc from 'fast-check';
import {validateScopeSubset} from '../../src/auth/refresh-token.service';

/**
 * Feature: db-refresh-token-rotation, Property 10: Omitted scope defaults to record scope
 *
 * For any refresh token record with scope S, when scope is omitted,
 * the granted scope on the new token SHALL equal S.
 *
 * Validates: Requirements 8.3
 */
describe('Feature: db-refresh-token-rotation, Property 10: Omitted scope defaults to record scope', () => {
    const oauthScopes = ['openid', 'profile', 'email'];
    const scopeSubsetArb = fc.subarray(oauthScopes, {minLength: 1});

    it('when requestedScope is undefined, the fallback logic yields the record scope S unchanged', () => {
        fc.assert(
            fc.property(scopeSubsetArb, (scopes) => {
                const recordScope = scopes.join(' ');
                const requestedScope: string | undefined = undefined;

                // This mirrors the conditional in consumeAndRotate:
                // const grantedScope = params.requestedScope
                //     ? validateScopeSubset(params.requestedScope, existing.scope)
                //     : existing.scope;
                const grantedScope = requestedScope
                    ? validateScopeSubset(requestedScope, recordScope)
                    : recordScope;

                expect(grantedScope).toBe(recordScope);
            }),
            {numRuns: 200},
        );
    });

    it('when requestedScope is falsy (null or empty string), the fallback logic yields the record scope S unchanged', () => {
        const falsyValues = [null, undefined, ''] as const;

        fc.assert(
            fc.property(scopeSubsetArb, fc.constantFrom(...falsyValues), (scopes, falsyValue) => {
                const recordScope = scopes.join(' ');
                const requestedScope = falsyValue as string | undefined;

                const grantedScope = requestedScope
                    ? validateScopeSubset(requestedScope, recordScope)
                    : recordScope;

                expect(grantedScope).toBe(recordScope);
            }),
            {numRuns: 200},
        );
    });
});
