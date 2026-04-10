import * as fc from 'fast-check';
import {SecurityService} from '../../src/casl/security.service';
import {GRANT_TYPES, TenantToken} from '../../src/casl/contexts';
import {Environment} from '../../src/config/environment.service';

/**
 * Feature: scope-model-refactoring, Property 5: Super-admin check equivalence
 *
 * For any TenantToken, isSuperAdmin shall return true if and only if
 * the token's roles array contains 'SUPER_ADMIN' AND the token's
 * tenant.domain equals the configured super tenant domain.
 * For all other combinations, it shall return false.
 *
 * **Validates: Requirements 7.1, 7.2**
 */
describe('Property 5: Super-admin check equivalence', () => {
    const SUPER_DOMAIN = 'super.example.com';

    // Minimal mock of Environment — only `get` is used by isSuperAdmin
    const mockEnv = {get: (key: string) => key === 'SUPER_TENANT_DOMAIN' ? SUPER_DOMAIN : null} as unknown as Environment;

    // SecurityService requires caslAbilityFactory and authUserService in the constructor,
    // but isSuperAdmin uses neither — safe to pass null for this pure-logic test.
    const service = new SecurityService(mockEnv, null as any, null as any);

    const allRoles = ['SUPER_ADMIN', 'TENANT_ADMIN', 'TENANT_VIEWER'];
    const roleSubsetArb = fc.subarray(allRoles);
    const domainArb = fc.oneof(
        fc.constantFrom(SUPER_DOMAIN),
        fc.string({minLength: 1, maxLength: 30}),
    );

    function makeTenantToken(roles: string[], domain: string): TenantToken {
        const tenant = {id: 'tid-1', name: 'Test Tenant', domain};
        const token = TenantToken.create({
            sub: 'user@test.com',
            tenant,
            roles,
            grant_type: GRANT_TYPES.PASSWORD,
            aud: [domain],
            jti: 'test-jti',
            nbf: 0,
            scope: 'openid profile email',
            client_id: 'test-client',
            tenant_id: tenant.id,
        });
        token.email = 'user@test.com';
        token.name = 'Test User';
        token.userId = 'uid-1';
        token.userTenant = tenant;
        return token;
    }

    it('returns true iff SUPER_ADMIN ∈ roles AND domain === super tenant domain', () => {
        fc.assert(
            fc.property(roleSubsetArb, domainArb, (roles, domain) => {
                const token = makeTenantToken(roles, domain);
                const result = service.isSuperAdmin(token);
                const expected = roles.includes('SUPER_ADMIN') && domain === SUPER_DOMAIN;
                expect(result).toBe(expected);
            }),
            {numRuns: 500},
        );
    });

    it('always returns false when SUPER_ADMIN is absent regardless of domain', () => {
        const noSuperAdminRoles = fc.subarray(['TENANT_ADMIN', 'TENANT_VIEWER']);
        fc.assert(
            fc.property(noSuperAdminRoles, domainArb, (roles, domain) => {
                const token = makeTenantToken(roles, domain);
                expect(service.isSuperAdmin(token)).toBe(false);
            }),
            {numRuns: 200},
        );
    });

    it('always returns false when domain does not match regardless of roles', () => {
        // Generate domains that are guaranteed to differ from SUPER_DOMAIN
        const nonSuperDomain = fc.string({minLength: 1, maxLength: 30}).filter(d => d !== SUPER_DOMAIN);
        fc.assert(
            fc.property(roleSubsetArb, nonSuperDomain, (roles, domain) => {
                const token = makeTenantToken(roles, domain);
                expect(service.isSuperAdmin(token)).toBe(false);
            }),
            {numRuns: 200},
        );
    });
});
