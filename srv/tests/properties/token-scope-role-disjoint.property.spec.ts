import * as fc from 'fast-check';
import {GRANT_TYPES, TenantToken} from '../../src/casl/contexts';
import {RoleEnum} from '../../src/entity/roleEnum';

/**
 * Feature: scope-model-refactoring, Property 6: Token scopes and roles are disjoint
 *
 * For any TenantToken issued by the Auth Server, the `scopes` field contains
 * only OIDC values (`openid`, `profile`, `email`) and the `roles` field
 * contains only role enum names (`SUPER_ADMIN`, `TENANT_ADMIN`, `TENANT_VIEWER`).
 * No value appears in both fields.
 *
 * **Validates: Requirements 5.1, 5.2, 5.4, 9.4**
 */
describe('Property 6: Token scopes and roles are disjoint', () => {
    const VALID_OIDC_SCOPES = ['openid', 'profile', 'email'];
    const VALID_ROLES = [RoleEnum.SUPER_ADMIN, RoleEnum.TENANT_ADMIN, RoleEnum.TENANT_VIEWER];

    const oidcScopesArb = fc.subarray(VALID_OIDC_SCOPES, {minLength: 0});
    const rolesArb = fc.subarray(VALID_ROLES, {minLength: 0});

    function makeTenantToken(scopes: string[], roles: string[]): TenantToken {
        return TenantToken.create({
            sub: 'user@test.com',
            email: 'user@test.com',
            name: 'Test User',
            userId: 'uid-1',
            tenant: {id: 'tid-1', name: 'Test Tenant', domain: 'test.local'},
            userTenant: {id: 'tid-1', name: 'Test Tenant', domain: 'test.local'},
            scopes,
            roles,
            grant_type: GRANT_TYPES.PASSWORD,
        });
    }

    it('every value in scopes is a valid OIDC scope', () => {
        const validOidcSet = new Set(VALID_OIDC_SCOPES);

        fc.assert(
            fc.property(oidcScopesArb, rolesArb, (scopes, roles) => {
                const token = makeTenantToken(scopes, roles);
                for (const s of token.scopes) {
                    expect(validOidcSet.has(s)).toBe(true);
                }
            }),
            {numRuns: 500},
        );
    });

    it('every value in roles is a valid role enum name', () => {
        const validRoleSet = new Set<string>(VALID_ROLES);

        fc.assert(
            fc.property(oidcScopesArb, rolesArb, (scopes, roles) => {
                const token = makeTenantToken(scopes, roles);
                for (const r of token.roles) {
                    expect(validRoleSet.has(r)).toBe(true);
                }
            }),
            {numRuns: 500},
        );
    });

    it('scopes and roles are disjoint — no value appears in both fields', () => {
        fc.assert(
            fc.property(oidcScopesArb, rolesArb, (scopes, roles) => {
                const token = makeTenantToken(scopes, roles);
                const scopeSet = new Set(token.scopes);
                for (const r of token.roles) {
                    expect(scopeSet.has(r)).toBe(false);
                }
            }),
            {numRuns: 500},
        );
    });
});
