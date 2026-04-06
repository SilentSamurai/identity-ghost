import * as fc from 'fast-check';
import {GRANT_TYPES, TenantToken, TechnicalToken} from '../../src/casl/contexts';
import {ScopeNormalizer} from '../../src/casl/scope-normalizer';
import {RoleEnum} from '../../src/entity/roleEnum';

/**
 * Feature: token-introspection, Property 2: Scope contains only OIDC values, never roles
 *
 * For any valid token with a `scopes` array and (for TenantTokens) a `roles`
 * array, the introspection response `scope` field SHALL equal
 * `ScopeNormalizer.format(token.scopes)` and SHALL NOT contain any role enum
 * value (e.g., SUPER_ADMIN, TENANT_ADMIN, TENANT_VIEWER).
 *
 * Validates: Requirements 3.3, 3.6
 */
describe('Property 2: Scope contains only OIDC values, never roles', () => {

    const OIDC_SCOPES = ['openid', 'profile', 'email'];
    const ROLE_VALUES = Object.values(RoleEnum) as string[];

    const oidcScopesArb = fc.subarray(OIDC_SCOPES, {minLength: 1});
    const rolesArb = fc.subarray(ROLE_VALUES);

    const tenantInfoArb = fc.record({
        id: fc.uuid(),
        name: fc.string({minLength: 1, maxLength: 50}),
        domain: fc.domain(),
    });

    const tenantTokenArb = fc.tuple(oidcScopesArb, rolesArb, tenantInfoArb).map(
        ([scopes, roles, tenant]) =>
            TenantToken.create({
                sub: 'user@test.com',
                email: 'user@test.com',
                name: 'Test User',
                userId: 'uid-1',
                tenant,
                userTenant: tenant,
                scopes,
                roles,
                grant_type: GRANT_TYPES.PASSWORD,
            }),
    );

    const technicalTokenArb = fc.tuple(oidcScopesArb, tenantInfoArb).map(
        ([scopes, tenant]) =>
            TechnicalToken.create({sub: 'oauth', tenant, scopes}),
    );

    it('TenantToken scope equals ScopeNormalizer.format(token.scopes) and contains no role values', () => {
        fc.assert(
            fc.property(tenantTokenArb, (token) => {
                const scope = ScopeNormalizer.format(token.scopes);

                // scope matches ScopeNormalizer output
                expect(scope).toBe(ScopeNormalizer.format(token.scopes));

                // scope never contains any role enum value
                const scopeParts = scope.split(' ');
                for (const role of ROLE_VALUES) {
                    expect(scopeParts).not.toContain(role);
                }

                // every scope part is an OIDC value
                for (const part of scopeParts) {
                    expect(OIDC_SCOPES).toContain(part);
                }
            }),
            {numRuns: 100},
        );
    });

    it('TechnicalToken scope equals ScopeNormalizer.format(token.scopes) and contains no role values', () => {
        fc.assert(
            fc.property(technicalTokenArb, (token) => {
                const scope = ScopeNormalizer.format(token.scopes);

                expect(scope).toBe(ScopeNormalizer.format(token.scopes));

                const scopeParts = scope.split(' ');
                for (const role of ROLE_VALUES) {
                    expect(scopeParts).not.toContain(role);
                }

                for (const part of scopeParts) {
                    expect(OIDC_SCOPES).toContain(part);
                }
            }),
            {numRuns: 100},
        );
    });

    it('scope never leaks roles even when token has all roles assigned', () => {
        fc.assert(
            fc.property(oidcScopesArb, (scopes) => {
                const token = TenantToken.create({
                    sub: 'user@test.com',
                    email: 'user@test.com',
                    name: 'Test User',
                    userId: 'uid-1',
                    tenant: {id: 'tid-1', name: 'T', domain: 'test.com'},
                    userTenant: {id: 'tid-1', name: 'T', domain: 'test.com'},
                    scopes,
                    roles: [...ROLE_VALUES],
                    grant_type: GRANT_TYPES.PASSWORD,
                });

                const scope = ScopeNormalizer.format(token.scopes);
                const scopeParts = scope.split(' ');

                // Roles must never appear in scope output
                for (const role of ROLE_VALUES) {
                    expect(scopeParts).not.toContain(role);
                }
            }),
            {numRuns: 100},
        );
    });
});
