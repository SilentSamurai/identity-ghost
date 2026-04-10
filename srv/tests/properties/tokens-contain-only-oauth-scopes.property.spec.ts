import * as fc from 'fast-check';
import {GRANT_TYPES, TenantToken, TechnicalToken} from '../../src/casl/contexts';
import {RoleEnum} from '../../src/entity/roleEnum';

/**
 * Feature: scope-model-refactoring, Property 6: Tokens contain only OAuth scopes
 *
 * For any TenantToken, the `scopes` field contains only OIDC values and the
 * `roles` field contains only role enum names.
 * For any TechnicalToken, the `scopes` field contains only OIDC values and
 * no `roles` field exists.
 *
 * **Validates: Requirements 5.1, 5.2, 5.4, 5.5, 9.4**
 */
describe('Property 6: Tokens contain only OAuth scopes', () => {
    const VALID_OIDC_SCOPES = ['openid', 'profile', 'email'];
    const VALID_ROLES = [RoleEnum.SUPER_ADMIN, RoleEnum.TENANT_ADMIN, RoleEnum.TENANT_VIEWER];

    const OIDC_SET = new Set(VALID_OIDC_SCOPES);
    const ROLE_SET = new Set<string>(VALID_ROLES);

    const oidcScopesArb = fc.subarray(VALID_OIDC_SCOPES, {minLength: 0});
    const rolesArb = fc.subarray(VALID_ROLES, {minLength: 0});

    function makeTenantToken(scopes: string[], roles: string[]): TenantToken {
        const tenant = {id: 'tid-1', name: 'Test Tenant', domain: 'test.local'};
        const token = TenantToken.create({
            sub: 'user@test.com',
            tenant,
            roles,
            grant_type: GRANT_TYPES.PASSWORD,
            aud: ['test.local'],
            jti: 'test-jti',
            nbf: 0,
            scope: scopes.join(' '),
            client_id: 'test-client',
            tenant_id: tenant.id,
        });
        token.email = 'user@test.com';
        token.name = 'Test User';
        token.userId = 'uid-1';
        return token;
    }

    function makeTechnicalToken(scopes: string[]): TechnicalToken {
        const tenant = {id: 'tid-1', name: 'Test Tenant', domain: 'test.local'};
        return TechnicalToken.create({
            sub: 'client:test.local',
            tenant,
            scope: scopes.join(' '),
            aud: ['test.local'],
            jti: 'test-jti',
            nbf: 0,
            client_id: 'test-client',
            tenant_id: tenant.id,
        });
    }

    describe('TenantToken', () => {
        it('scopes field contains only OIDC values', () => {
            fc.assert(
                fc.property(oidcScopesArb, rolesArb, (scopes, roles) => {
                    const token = makeTenantToken(scopes, roles);
                    for (const s of token.scopes) {
                        expect(OIDC_SET.has(s)).toBe(true);
                    }
                }),
                {numRuns: 200},
            );
        });

        it('roles field contains only role enum names', () => {
            fc.assert(
                fc.property(oidcScopesArb, rolesArb, (scopes, roles) => {
                    const token = makeTenantToken(scopes, roles);
                    for (const r of token.roles) {
                        expect(ROLE_SET.has(r)).toBe(true);
                    }
                }),
                {numRuns: 200},
            );
        });
    });

    describe('TechnicalToken', () => {
        it('scopes field contains only OIDC values', () => {
            fc.assert(
                fc.property(oidcScopesArb, (scopes) => {
                    const token = makeTechnicalToken(scopes);
                    for (const s of token.scopes) {
                        expect(OIDC_SET.has(s)).toBe(true);
                    }
                }),
                {numRuns: 200},
            );
        });

        it('has no roles field', () => {
            fc.assert(
                fc.property(oidcScopesArb, (scopes) => {
                    const token = makeTechnicalToken(scopes);
                    expect((token as any).roles).toBeUndefined();
                }),
                {numRuns: 200},
            );
        });
    });
});
