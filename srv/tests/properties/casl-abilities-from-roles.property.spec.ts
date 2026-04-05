import * as fc from 'fast-check';
import {CaslAbilityFactory} from '../../src/casl/casl-ability.factory';
import {GRANT_TYPES, TenantToken, TechnicalToken} from '../../src/casl/contexts';
import {Action} from '../../src/casl/actions.enum';
import {SubjectEnum} from '../../src/entity/subjectEnum';
import {RoleEnum} from '../../src/entity/roleEnum';
import {Environment} from '../../src/config/environment.service';
import {subject} from '@casl/ability';

/**
 * Feature: scope-model-refactoring, Property 7: CASL abilities from roles
 *
 * For any TenantToken, CASL abilities are determined by `token.roles`
 * (not `token.scopes`).
 * - TENANT_VIEWER grants Read on TENANT, MEMBER, ROLE, POLICY for token's tenant
 * - TENANT_ADMIN grants ReadCredentials/Update on TENANT, Manage on MEMBER/ROLE/POLICY/CLIENT
 * - SUPER_ADMIN + super domain grants Manage all + ReadCredentials all
 *
 * **Validates: Requirements 6.1, 6.2, 6.3, 6.4**
 */
describe('Property 7: CASL abilities from roles', () => {
    const SUPER_DOMAIN = 'super.example.com';
    const TENANT_ID = 'tid-test-1';
    const OTHER_TENANT_ID = 'tid-other-2';

    const mockEnv = {
        get: (key: string) => key === 'SUPER_TENANT_DOMAIN' ? SUPER_DOMAIN : null,
    } as unknown as Environment;

    const factory = new CaslAbilityFactory(mockEnv);

    const allRoles = [RoleEnum.SUPER_ADMIN, RoleEnum.TENANT_ADMIN, RoleEnum.TENANT_VIEWER];
    const roleSubsetArb = fc.subarray(allRoles);
    const domainArb = fc.oneof(
        fc.constantFrom(SUPER_DOMAIN),
        fc.string({minLength: 1, maxLength: 30}),
    );

    // OIDC scopes — these should NOT affect CASL abilities
    const oidcScopesArb = fc.subarray(['openid', 'profile', 'email']);

    function makeTenantToken(roles: string[], domain: string, scopes: string[] = ['openid', 'profile', 'email']): TenantToken {
        return TenantToken.create({
            sub: 'user@test.com',
            email: 'user@test.com',
            name: 'Test User',
            userId: 'uid-1',
            tenant: {id: TENANT_ID, name: 'Test Tenant', domain},
            userTenant: {id: TENANT_ID, name: 'Test Tenant', domain},
            scopes,
            roles,
            grant_type: GRANT_TYPES.PASSWORD,
        });
    }

    /** Helper: check ability on a subject scoped to a tenant */
    function subjectWith(subjectType: string, tenantField: string, tenantId: string) {
        return subject(subjectType, {[tenantField]: tenantId} as any);
    }

    it('TENANT_VIEWER grants Read on TENANT/MEMBER/ROLE/POLICY for token tenant', () => {
        fc.assert(
            fc.property(roleSubsetArb, domainArb, (roles, domain) => {
                const token = makeTenantToken(roles, domain);
                const ability = factory.createForSecurityContext(token);
                const hasViewer = roles.includes(RoleEnum.TENANT_VIEWER);

                if (hasViewer) {
                    expect(ability.can(Action.Read, subjectWith(SubjectEnum.TENANT, 'id', TENANT_ID))).toBe(true);
                    expect(ability.can(Action.Read, subjectWith(SubjectEnum.MEMBER, 'tenantId', TENANT_ID))).toBe(true);
                    expect(ability.can(Action.Read, subjectWith(SubjectEnum.ROLE, 'tenantId', TENANT_ID))).toBe(true);
                    expect(ability.can(Action.Read, subjectWith(SubjectEnum.POLICY, 'tenantId', TENANT_ID))).toBe(true);
                }
            }),
            {numRuns: 200},
        );
    });

    it('without TENANT_VIEWER or TENANT_ADMIN, no Read on tenant resources', () => {
        // Use non-super domain to isolate from SUPER_ADMIN granting Manage all
        const nonSuperDomain = fc.string({minLength: 1, maxLength: 30}).filter(d => d !== SUPER_DOMAIN);

        fc.assert(
            fc.property(nonSuperDomain, (domain) => {
                const token = makeTenantToken([], domain);
                const ability = factory.createForSecurityContext(token);

                expect(ability.can(Action.Read, subjectWith(SubjectEnum.TENANT, 'id', TENANT_ID))).toBe(false);
                expect(ability.can(Action.Read, subjectWith(SubjectEnum.MEMBER, 'tenantId', TENANT_ID))).toBe(false);
                expect(ability.can(Action.Read, subjectWith(SubjectEnum.ROLE, 'tenantId', TENANT_ID))).toBe(false);
                expect(ability.can(Action.Read, subjectWith(SubjectEnum.POLICY, 'tenantId', TENANT_ID))).toBe(false);
            }),
            {numRuns: 100},
        );
    });

    it('TENANT_ADMIN grants ReadCredentials/Update on TENANT and Manage on MEMBER/ROLE/POLICY/CLIENT', () => {
        fc.assert(
            fc.property(roleSubsetArb, domainArb, (roles, domain) => {
                const token = makeTenantToken(roles, domain);
                const ability = factory.createForSecurityContext(token);
                const hasAdmin = roles.includes(RoleEnum.TENANT_ADMIN);

                if (hasAdmin) {
                    expect(ability.can(Action.ReadCredentials, subjectWith(SubjectEnum.TENANT, 'id', TENANT_ID))).toBe(true);
                    expect(ability.can(Action.Update, subjectWith(SubjectEnum.TENANT, 'id', TENANT_ID))).toBe(true);
                    expect(ability.can(Action.Manage, subjectWith(SubjectEnum.MEMBER, 'tenantId', TENANT_ID))).toBe(true);
                    expect(ability.can(Action.Manage, subjectWith(SubjectEnum.ROLE, 'tenantId', TENANT_ID))).toBe(true);
                    expect(ability.can(Action.Manage, subjectWith(SubjectEnum.POLICY, 'tenantId', TENANT_ID))).toBe(true);
                    expect(ability.can(Action.Manage, subjectWith(SubjectEnum.CLIENT, 'tenantId', TENANT_ID))).toBe(true);
                }
            }),
            {numRuns: 200},
        );
    });

    it('without TENANT_ADMIN, no write abilities on tenant resources (non-super domain)', () => {
        const noAdminRoles = fc.subarray([RoleEnum.TENANT_VIEWER]);
        const nonSuperDomain = fc.string({minLength: 1, maxLength: 30}).filter(d => d !== SUPER_DOMAIN);

        fc.assert(
            fc.property(noAdminRoles, nonSuperDomain, (roles, domain) => {
                const token = makeTenantToken(roles, domain);
                const ability = factory.createForSecurityContext(token);

                expect(ability.can(Action.ReadCredentials, subjectWith(SubjectEnum.TENANT, 'id', TENANT_ID))).toBe(false);
                expect(ability.can(Action.Update, subjectWith(SubjectEnum.TENANT, 'id', TENANT_ID))).toBe(false);
                expect(ability.can(Action.Manage, subjectWith(SubjectEnum.MEMBER, 'tenantId', TENANT_ID))).toBe(false);
                expect(ability.can(Action.Manage, subjectWith(SubjectEnum.ROLE, 'tenantId', TENANT_ID))).toBe(false);
                expect(ability.can(Action.Manage, subjectWith(SubjectEnum.CLIENT, 'tenantId', TENANT_ID))).toBe(false);
            }),
            {numRuns: 200},
        );
    });

    it('SUPER_ADMIN + super domain grants Manage all and ReadCredentials all', () => {
        fc.assert(
            fc.property(roleSubsetArb, (roles) => {
                const token = makeTenantToken(roles, SUPER_DOMAIN);
                const ability = factory.createForSecurityContext(token);
                const hasSuperAdmin = roles.includes(RoleEnum.SUPER_ADMIN);

                if (hasSuperAdmin) {
                    // Manage all — can manage any subject, including other tenants
                    expect(ability.can(Action.Manage, subjectWith(SubjectEnum.TENANT, 'id', OTHER_TENANT_ID))).toBe(true);
                    expect(ability.can(Action.Manage, subjectWith(SubjectEnum.MEMBER, 'tenantId', OTHER_TENANT_ID))).toBe(true);
                    expect(ability.can(Action.Manage, subjectWith(SubjectEnum.ROLE, 'tenantId', OTHER_TENANT_ID))).toBe(true);
                    expect(ability.can(Action.ReadCredentials, subjectWith(SubjectEnum.TENANT, 'id', OTHER_TENANT_ID))).toBe(true);
                }
            }),
            {numRuns: 200},
        );
    });

    it('SUPER_ADMIN without super domain does NOT grant cross-tenant access', () => {
        const nonSuperDomain = fc.string({minLength: 1, maxLength: 30}).filter(d => d !== SUPER_DOMAIN);

        fc.assert(
            fc.property(nonSuperDomain, (domain) => {
                const roles = [RoleEnum.SUPER_ADMIN, RoleEnum.TENANT_ADMIN, RoleEnum.TENANT_VIEWER];
                const token = makeTenantToken(roles, domain);
                const ability = factory.createForSecurityContext(token);

                // Should NOT have access to other tenants
                expect(ability.can(Action.Manage, subjectWith(SubjectEnum.TENANT, 'id', OTHER_TENANT_ID))).toBe(false);
                expect(ability.can(Action.Manage, subjectWith(SubjectEnum.MEMBER, 'tenantId', OTHER_TENANT_ID))).toBe(false);
                expect(ability.can(Action.ReadCredentials, subjectWith(SubjectEnum.TENANT, 'id', OTHER_TENANT_ID))).toBe(false);
            }),
            {numRuns: 200},
        );
    });

    it('abilities are determined by roles, not by scopes — varying scopes does not change abilities', () => {
        fc.assert(
            fc.property(roleSubsetArb, domainArb, oidcScopesArb, (roles, domain, scopes) => {
                // Token with the given OIDC scopes
                const token1 = makeTenantToken(roles, domain, scopes);
                const ability1 = factory.createForSecurityContext(token1);

                // Token with different OIDC scope but same roles
                const token2 = makeTenantToken(roles, domain, ['openid']);
                const ability2 = factory.createForSecurityContext(token2);

                // Verify key abilities match — scopes should have no effect
                const checks = [
                    [Action.Read, SubjectEnum.TENANT, 'id', TENANT_ID],
                    [Action.ReadCredentials, SubjectEnum.TENANT, 'id', TENANT_ID],
                    [Action.Update, SubjectEnum.TENANT, 'id', TENANT_ID],
                    [Action.Manage, SubjectEnum.MEMBER, 'tenantId', TENANT_ID],
                    [Action.Manage, SubjectEnum.ROLE, 'tenantId', TENANT_ID],
                    [Action.Manage, SubjectEnum.POLICY, 'tenantId', TENANT_ID],
                    [Action.Manage, SubjectEnum.CLIENT, 'tenantId', TENANT_ID],
                ] as const;

                for (const [action, subj, field, id] of checks) {
                    expect(ability1.can(action, subjectWith(subj, field, id)))
                        .toBe(ability2.can(action, subjectWith(subj, field, id)));
                }
            }),
            {numRuns: 200},
        );
    });
});

/**
 * Feature: casl-internal-external-separation, Property 2: TENANT_VIEWER grants read-only access
 *
 * For any TenantToken with the TENANT_VIEWER role and any tenant ID, the resulting ability
 * shall allow Read on Tenant, Member, Role, and Policy subjects with a condition matching
 * the token's tenant ID, and shall deny ReadCredentials on Tenant.
 *
 * **Validates: Requirements 1.4**
 */
describe('Property 2: TENANT_VIEWER grants read-only access', () => {
    const SUPER_DOMAIN = 'super.example.com';

    const mockEnv = {
        get: (key: string) => key === 'SUPER_TENANT_DOMAIN' ? SUPER_DOMAIN : null,
    } as unknown as Environment;

    const factory = new CaslAbilityFactory(mockEnv);

    // Generate random tenant IDs
    const tenantIdArb = fc.uuid().map(id => `tid-${id}`);

    // Generate random domains (avoiding super domain)
    const nonSuperDomainArb = fc.string({minLength: 1, maxLength: 30})
        .filter(d => d !== SUPER_DOMAIN);

    function makeTenantTokenWithTenantId(tenantId: string, domain: string): TenantToken {
        return TenantToken.create({
            sub: 'user@test.com',
            email: 'user@test.com',
            name: 'Test User',
            userId: 'uid-1',
            tenant: {id: tenantId, name: 'Test Tenant', domain},
            userTenant: {id: tenantId, name: 'Test Tenant', domain},
            scopes: ['openid', 'profile', 'email'],
            roles: [RoleEnum.TENANT_VIEWER],
            grant_type: GRANT_TYPES.PASSWORD,
        });
    }

    it('TENANT_VIEWER grants Read on Tenant, Member, Role, Policy for token tenant', () => {
        fc.assert(
            fc.property(tenantIdArb, nonSuperDomainArb, (tenantId, domain) => {
                const token = makeTenantTokenWithTenantId(tenantId, domain);
                const ability = factory.createForSecurityContext(token);

                // Verify Read access to all tenant resources
                expect(ability.can(Action.Read, subject(SubjectEnum.TENANT, {id: tenantId}))).toBe(true);
                expect(ability.can(Action.Read, subject(SubjectEnum.MEMBER, {tenantId}))).toBe(true);
                expect(ability.can(Action.Read, subject(SubjectEnum.ROLE, {tenantId}))).toBe(true);
                expect(ability.can(Action.Read, subject(SubjectEnum.POLICY, {tenantId}))).toBe(true);
            }),
            {numRuns: 100},
        );
    });

    it('TENANT_VIEWER denies ReadCredentials on Tenant', () => {
        fc.assert(
            fc.property(tenantIdArb, nonSuperDomainArb, (tenantId, domain) => {
                const token = makeTenantTokenWithTenantId(tenantId, domain);
                const ability = factory.createForSecurityContext(token);

                // ReadCredentials should be explicitly denied
                expect(ability.can(Action.ReadCredentials, subject(SubjectEnum.TENANT, {id: tenantId}))).toBe(false);
            }),
            {numRuns: 100},
        );
    });

    it('TENANT_VIEWER denies Manage on all tenant resources', () => {
        fc.assert(
            fc.property(tenantIdArb, nonSuperDomainArb, (tenantId, domain) => {
                const token = makeTenantTokenWithTenantId(tenantId, domain);
                const ability = factory.createForSecurityContext(token);

                // Verify no write access
                expect(ability.can(Action.Manage, SubjectEnum.TENANT)).toBe(false);
                expect(ability.can(Action.Manage, subject(SubjectEnum.MEMBER, {tenantId}))).toBe(false);
                expect(ability.can(Action.Manage, subject(SubjectEnum.ROLE, {tenantId}))).toBe(false);
                expect(ability.can(Action.Manage, subject(SubjectEnum.POLICY, {tenantId}))).toBe(false);
                expect(ability.can(Action.Manage, subject(SubjectEnum.CLIENT, {tenantId}))).toBe(false);
            }),
            {numRuns: 100},
        );
    });

    it('TENANT_VIEWER denies Update on Tenant', () => {
        fc.assert(
            fc.property(tenantIdArb, nonSuperDomainArb, (tenantId, domain) => {
                const token = makeTenantTokenWithTenantId(tenantId, domain);
                const ability = factory.createForSecurityContext(token);

                expect(ability.can(Action.Update, subject(SubjectEnum.TENANT, {id: tenantId}))).toBe(false);
            }),
            {numRuns: 100},
        );
    });

    it('TENANT_VIEWER does not grant access to other tenants', () => {
        fc.assert(
            fc.property(tenantIdArb, tenantIdArb, nonSuperDomainArb, (tenantId, otherTenantId, domain) => {
                // Skip if same tenant ID (rare but possible with UUID)
                fc.pre(tenantId !== otherTenantId);

                const token = makeTenantTokenWithTenantId(tenantId, domain);
                const ability = factory.createForSecurityContext(token);

                // Verify no access to other tenant's resources
                expect(ability.can(Action.Read, subject(SubjectEnum.TENANT, {id: otherTenantId}))).toBe(false);
                expect(ability.can(Action.Read, subject(SubjectEnum.MEMBER, {tenantId: otherTenantId}))).toBe(false);
                expect(ability.can(Action.Read, subject(SubjectEnum.ROLE, {tenantId: otherTenantId}))).toBe(false);
                expect(ability.can(Action.Read, subject(SubjectEnum.POLICY, {tenantId: otherTenantId}))).toBe(false);
            }),
            {numRuns: 100},
        );
    });
});

/**
 * Feature: casl-internal-external-separation, Property 3: TENANT_ADMIN grants management access
 *
 * For any TenantToken with the TENANT_ADMIN role and any tenant ID, the resulting ability
 * shall allow Manage on Member, Role, Policy, and Client subjects scoped to the token's
 * tenant ID, and shall allow Read, Update, and ReadCredentials on Tenant scoped to the
 * token's tenant ID.
 *
 * **Validates: Requirements 1.5**
 */
describe('Property 3: TENANT_ADMIN grants management access', () => {
    const SUPER_DOMAIN = 'super.example.com';

    const mockEnv = {
        get: (key: string) => key === 'SUPER_TENANT_DOMAIN' ? SUPER_DOMAIN : null,
    } as unknown as Environment;

    const factory = new CaslAbilityFactory(mockEnv);

    // Generate random tenant IDs
    const tenantIdArb = fc.uuid().map(id => `tid-${id}`);

    // Generate random domains (avoiding super domain)
    const nonSuperDomainArb = fc.string({minLength: 1, maxLength: 30})
        .filter(d => d !== SUPER_DOMAIN);

    function makeTenantAdminToken(tenantId: string, domain: string): TenantToken {
        return TenantToken.create({
            sub: 'admin@test.com',
            email: 'admin@test.com',
            name: 'Admin User',
            userId: 'uid-admin',
            tenant: {id: tenantId, name: 'Test Tenant', domain},
            userTenant: {id: tenantId, name: 'Test Tenant', domain},
            scopes: ['openid', 'profile', 'email'],
            roles: [RoleEnum.TENANT_ADMIN],
            grant_type: GRANT_TYPES.PASSWORD,
        });
    }

    it('TENANT_ADMIN grants Manage on Member, Role, Policy, Client for token tenant', () => {
        fc.assert(
            fc.property(tenantIdArb, nonSuperDomainArb, (tenantId, domain) => {
                const token = makeTenantAdminToken(tenantId, domain);
                const ability = factory.createForSecurityContext(token);

                // Verify Manage access to tenant resources
                expect(ability.can(Action.Manage, subject(SubjectEnum.MEMBER, {tenantId}))).toBe(true);
                expect(ability.can(Action.Manage, subject(SubjectEnum.ROLE, {tenantId}))).toBe(true);
                expect(ability.can(Action.Manage, subject(SubjectEnum.POLICY, {tenantId}))).toBe(true);
                expect(ability.can(Action.Manage, subject(SubjectEnum.CLIENT, {tenantId}))).toBe(true);
            }),
            {numRuns: 100},
        );
    });

    it('TENANT_ADMIN grants Read, Update, ReadCredentials on Tenant for token tenant', () => {
        fc.assert(
            fc.property(tenantIdArb, nonSuperDomainArb, (tenantId, domain) => {
                const token = makeTenantAdminToken(tenantId, domain);
                const ability = factory.createForSecurityContext(token);

                // Verify Tenant-specific permissions
                expect(ability.can(Action.Read, subject(SubjectEnum.TENANT, {id: tenantId}))).toBe(true);
                expect(ability.can(Action.Update, subject(SubjectEnum.TENANT, {id: tenantId}))).toBe(true);
                expect(ability.can(Action.ReadCredentials, subject(SubjectEnum.TENANT, {id: tenantId}))).toBe(true);
            }),
            {numRuns: 100},
        );
    });

    it('TENANT_ADMIN does not grant Manage on Tenant', () => {
        fc.assert(
            fc.property(tenantIdArb, nonSuperDomainArb, (tenantId, domain) => {
                const token = makeTenantAdminToken(tenantId, domain);
                const ability = factory.createForSecurityContext(token);

                // TENANT_ADMIN cannot fully Manage Tenant (only Read/Update/ReadCredentials)
                expect(ability.can(Action.Manage, subject(SubjectEnum.TENANT, {id: tenantId}))).toBe(false);
            }),
            {numRuns: 100},
        );
    });

    it('TENANT_ADMIN does not grant access to other tenants', () => {
        fc.assert(
            fc.property(tenantIdArb, tenantIdArb, nonSuperDomainArb, (tenantId, otherTenantId, domain) => {
                // Skip if same tenant ID (rare but possible with UUID)
                fc.pre(tenantId !== otherTenantId);

                const token = makeTenantAdminToken(tenantId, domain);
                const ability = factory.createForSecurityContext(token);

                // Verify no access to other tenant's resources
                expect(ability.can(Action.Manage, subject(SubjectEnum.MEMBER, {tenantId: otherTenantId}))).toBe(false);
                expect(ability.can(Action.Manage, subject(SubjectEnum.ROLE, {tenantId: otherTenantId}))).toBe(false);
                expect(ability.can(Action.Manage, subject(SubjectEnum.POLICY, {tenantId: otherTenantId}))).toBe(false);
                expect(ability.can(Action.Manage, subject(SubjectEnum.CLIENT, {tenantId: otherTenantId}))).toBe(false);
                expect(ability.can(Action.Read, subject(SubjectEnum.TENANT, {id: otherTenantId}))).toBe(false);
                expect(ability.can(Action.Update, subject(SubjectEnum.TENANT, {id: otherTenantId}))).toBe(false);
                expect(ability.can(Action.ReadCredentials, subject(SubjectEnum.TENANT, {id: otherTenantId}))).toBe(false);
            }),
            {numRuns: 100},
        );
    });
});
/**
 * Feature: casl-internal-external-separation, Property 4: SUPER_ADMIN abilities are gated by tenant domain
 *
 * For any TenantToken with the SUPER_ADMIN role, the resulting ability shall grant
 * Manage and ReadCredentials on all subjects if and only if the token's tenant domain
 * equals the configured SUPER_TENANT_DOMAIN. When the domain does not match, no super
 * admin abilities shall be granted.
 *
 * **Validates: Requirements 1.6, 1.7**
 */
describe('Property 4: SUPER_ADMIN abilities are gated by tenant domain', () => {
    const SUPER_DOMAIN = 'super.example.com';

    const mockEnv = {
        get: (key: string) => key === 'SUPER_TENANT_DOMAIN' ? SUPER_DOMAIN : null,
    } as unknown as Environment;

    const factory = new CaslAbilityFactory(mockEnv);

    // Generate random tenant IDs
    const tenantIdArb = fc.uuid().map(id => `tid-${id}`);
    const otherTenantIdArb = fc.uuid().map(id => `tid-other-${id}`);

    // Generate random domains that match the super domain
    const superDomainArb = fc.constantFrom(SUPER_DOMAIN);

    // Generate random domains that do NOT match the super domain
    const nonSuperDomainArb = fc.string({minLength: 1, maxLength: 30})
        .filter(d => d !== SUPER_DOMAIN);

    function makeSuperAdminToken(tenantId: string, domain: string): TenantToken {
        return TenantToken.create({
            sub: 'superadmin@test.com',
            email: 'superadmin@test.com',
            name: 'Super Admin User',
            userId: 'uid-superadmin',
            tenant: {id: tenantId, name: 'Super Tenant', domain},
            userTenant: {id: tenantId, name: 'Super Tenant', domain},
            scopes: ['openid', 'profile', 'email'],
            roles: [RoleEnum.SUPER_ADMIN],
            grant_type: GRANT_TYPES.PASSWORD,
        });
    }

    it('SUPER_ADMIN with matching domain grants Manage on all subjects including other tenants', () => {
        fc.assert(
            fc.property(tenantIdArb, otherTenantIdArb, superDomainArb, (tenantId, otherTenantId, domain) => {
                // Skip if same tenant ID (rare but possible with UUID)
                fc.pre(tenantId !== otherTenantId);

                const token = makeSuperAdminToken(tenantId, domain);
                const ability = factory.createForSecurityContext(token);

                // Verify Manage access to own tenant
                expect(ability.can(Action.Manage, subject(SubjectEnum.TENANT, {id: tenantId}))).toBe(true);
                expect(ability.can(Action.Manage, subject(SubjectEnum.MEMBER, {tenantId}))).toBe(true);
                expect(ability.can(Action.Manage, subject(SubjectEnum.ROLE, {tenantId}))).toBe(true);
                expect(ability.can(Action.Manage, subject(SubjectEnum.POLICY, {tenantId}))).toBe(true);
                expect(ability.can(Action.Manage, subject(SubjectEnum.CLIENT, {tenantId}))).toBe(true);

                // Verify Manage access to OTHER tenants (super admin power)
                expect(ability.can(Action.Manage, subject(SubjectEnum.TENANT, {id: otherTenantId}))).toBe(true);
                expect(ability.can(Action.Manage, subject(SubjectEnum.MEMBER, {tenantId: otherTenantId}))).toBe(true);
                expect(ability.can(Action.Manage, subject(SubjectEnum.ROLE, {tenantId: otherTenantId}))).toBe(true);
                expect(ability.can(Action.Manage, subject(SubjectEnum.POLICY, {tenantId: otherTenantId}))).toBe(true);
                expect(ability.can(Action.Manage, subject(SubjectEnum.CLIENT, {tenantId: otherTenantId}))).toBe(true);
            }),
            {numRuns: 100},
        );
    });

    it('SUPER_ADMIN with matching domain grants ReadCredentials on all subjects', () => {
        fc.assert(
            fc.property(tenantIdArb, otherTenantIdArb, superDomainArb, (tenantId, otherTenantId, domain) => {
                fc.pre(tenantId !== otherTenantId);

                const token = makeSuperAdminToken(tenantId, domain);
                const ability = factory.createForSecurityContext(token);

                // Verify ReadCredentials on own tenant
                expect(ability.can(Action.ReadCredentials, subject(SubjectEnum.TENANT, {id: tenantId}))).toBe(true);

                // Verify ReadCredentials on OTHER tenants (super admin power)
                expect(ability.can(Action.ReadCredentials, subject(SubjectEnum.TENANT, {id: otherTenantId}))).toBe(true);
            }),
            {numRuns: 100},
        );
    });

    it('SUPER_ADMIN without matching domain does NOT grant cross-tenant Manage', () => {
        fc.assert(
            fc.property(tenantIdArb, otherTenantIdArb, nonSuperDomainArb, (tenantId, otherTenantId, domain) => {
                fc.pre(tenantId !== otherTenantId);

                const token = makeSuperAdminToken(tenantId, domain);
                const ability = factory.createForSecurityContext(token);

                // Should NOT have Manage access to other tenants
                expect(ability.can(Action.Manage, subject(SubjectEnum.TENANT, {id: otherTenantId}))).toBe(false);
                expect(ability.can(Action.Manage, subject(SubjectEnum.MEMBER, {tenantId: otherTenantId}))).toBe(false);
                expect(ability.can(Action.Manage, subject(SubjectEnum.ROLE, {tenantId: otherTenantId}))).toBe(false);
                expect(ability.can(Action.Manage, subject(SubjectEnum.POLICY, {tenantId: otherTenantId}))).toBe(false);
                expect(ability.can(Action.Manage, subject(SubjectEnum.CLIENT, {tenantId: otherTenantId}))).toBe(false);
            }),
            {numRuns: 100},
        );
    });

    it('SUPER_ADMIN without matching domain does NOT grant cross-tenant ReadCredentials', () => {
        fc.assert(
            fc.property(tenantIdArb, otherTenantIdArb, nonSuperDomainArb, (tenantId, otherTenantId, domain) => {
                fc.pre(tenantId !== otherTenantId);

                const token = makeSuperAdminToken(tenantId, domain);
                const ability = factory.createForSecurityContext(token);

                // Should NOT have ReadCredentials on other tenants
                expect(ability.can(Action.ReadCredentials, subject(SubjectEnum.TENANT, {id: otherTenantId}))).toBe(false);
            }),
            {numRuns: 100},
        );
    });

    it('SUPER_ADMIN without matching domain has no elevated abilities beyond base User self-management', () => {
        fc.assert(
            fc.property(tenantIdArb, nonSuperDomainArb, (tenantId, domain) => {
                const token = makeSuperAdminToken(tenantId, domain);
                const ability = factory.createForSecurityContext(token);

                // Should NOT have Manage on own tenant resources (no TENANT_ADMIN or TENANT_VIEWER)
                expect(ability.can(Action.Manage, subject(SubjectEnum.MEMBER, {tenantId}))).toBe(false);
                expect(ability.can(Action.Manage, subject(SubjectEnum.ROLE, {tenantId}))).toBe(false);
                expect(ability.can(Action.Manage, subject(SubjectEnum.POLICY, {tenantId}))).toBe(false);
                expect(ability.can(Action.Manage, subject(SubjectEnum.CLIENT, {tenantId}))).toBe(false);

                // Should NOT have Read on tenant resources
                expect(ability.can(Action.Read, subject(SubjectEnum.TENANT, {id: tenantId}))).toBe(false);
                expect(ability.can(Action.Read, subject(SubjectEnum.MEMBER, {tenantId}))).toBe(false);
                expect(ability.can(Action.Read, subject(SubjectEnum.ROLE, {tenantId}))).toBe(false);
                expect(ability.can(Action.Read, subject(SubjectEnum.POLICY, {tenantId}))).toBe(false);

                // Should still have User self-management (base permission)
                expect(ability.can(Action.Manage, subject(SubjectEnum.USER, {email: 'superadmin@test.com'}))).toBe(true);
                expect(ability.can(Action.Manage, subject(SubjectEnum.USER, {id: 'uid-superadmin'}))).toBe(true);
            }),
            {numRuns: 100},
        );
    });

    it('SUPER_ADMIN domain gating is case-sensitive', () => {
        fc.assert(
            fc.property(tenantIdArb, otherTenantIdArb, (tenantId, otherTenantId) => {
                fc.pre(tenantId !== otherTenantId);

                // Test with case variations of the super domain
                const caseVariations = [
                    SUPER_DOMAIN.toUpperCase(), // SUPER.EXAMPLE.COM
                    SUPER_DOMAIN.toLowerCase(), // super.example.com (same as original)
                    'Super.Example.Com',        // Mixed case
                ];

                for (const variant of caseVariations) {
                    // Skip the exact match (lowercase is same as SUPER_DOMAIN)
                    if (variant === SUPER_DOMAIN) continue;

                    const token = makeSuperAdminToken(tenantId, variant);
                    const ability = factory.createForSecurityContext(token);

                    // Should NOT have cross-tenant access (domain doesn't match exactly)
                    expect(ability.can(Action.Manage, subject(SubjectEnum.TENANT, {id: otherTenantId}))).toBe(false);
                    expect(ability.can(Action.ReadCredentials, subject(SubjectEnum.TENANT, {id: otherTenantId}))).toBe(false);
                }
            }),
            {numRuns: 50},
        );
    });
});

/**
 * Feature: casl-internal-external-separation, Property 5: TechnicalToken grants scoped read access
 *
 * For any TechnicalToken with any tenant ID, the resulting ability shall allow Read on
 * Tenant, Member, Role, and Policy subjects and ReadCredentials on Tenant, all scoped
 * to the technical token's tenant ID.
 *
 * **Validates: Requirements 1.8**
 */
describe('Property 5: TechnicalToken grants scoped read access', () => {
    const SUPER_DOMAIN = 'super.example.com';

    const mockEnv = {
        get: (key: string) => key === 'SUPER_TENANT_DOMAIN' ? SUPER_DOMAIN : null,
    } as unknown as Environment;

    const factory = new CaslAbilityFactory(mockEnv);

    const tenantIdArb = fc.uuid().map(id => `tid-${id}`);
    const otherTenantIdArb = fc.uuid().map(id => `tid-other-${id}`);
    const domainArb = fc.string({minLength: 1, maxLength: 30});

    function makeTechnicalToken(tenantId: string, domain: string): TechnicalToken {
        return TechnicalToken.create({
            sub: 'tech@test.com',
            tenant: {id: tenantId, name: 'Tech Tenant', domain},
            scopes: ['openid', 'profile', 'email'],
        });
    }

    it('TechnicalToken grants Read on Tenant, Member, Role, Policy scoped to tenant ID', () => {
        fc.assert(
            fc.property(tenantIdArb, domainArb, (tenantId, domain) => {
                const token = makeTechnicalToken(tenantId, domain);
                const ability = factory.createForSecurityContext(token);

                expect(ability.can(Action.Read, subject(SubjectEnum.TENANT, {id: tenantId}))).toBe(true);
                expect(ability.can(Action.Read, subject(SubjectEnum.MEMBER, {tenantId}))).toBe(true);
                expect(ability.can(Action.Read, subject(SubjectEnum.ROLE, {tenantId}))).toBe(true);
                expect(ability.can(Action.Read, subject(SubjectEnum.POLICY, {tenantId}))).toBe(true);
            }),
            {numRuns: 100},
        );
    });

    it('TechnicalToken grants ReadCredentials on Tenant scoped to tenant ID', () => {
        fc.assert(
            fc.property(tenantIdArb, domainArb, (tenantId, domain) => {
                const token = makeTechnicalToken(tenantId, domain);
                const ability = factory.createForSecurityContext(token);

                expect(ability.can(Action.ReadCredentials, subject(SubjectEnum.TENANT, {id: tenantId}))).toBe(true);
            }),
            {numRuns: 100},
        );
    });

    it('TechnicalToken does not grant access to other tenants', () => {
        fc.assert(
            fc.property(tenantIdArb, otherTenantIdArb, domainArb, (tenantId, otherTenantId, domain) => {
                fc.pre(tenantId !== otherTenantId);

                const token = makeTechnicalToken(tenantId, domain);
                const ability = factory.createForSecurityContext(token);

                expect(ability.can(Action.Read, subject(SubjectEnum.TENANT, {id: otherTenantId}))).toBe(false);
                expect(ability.can(Action.Read, subject(SubjectEnum.MEMBER, {tenantId: otherTenantId}))).toBe(false);
                expect(ability.can(Action.Read, subject(SubjectEnum.ROLE, {tenantId: otherTenantId}))).toBe(false);
                expect(ability.can(Action.Read, subject(SubjectEnum.POLICY, {tenantId: otherTenantId}))).toBe(false);
                expect(ability.can(Action.ReadCredentials, subject(SubjectEnum.TENANT, {id: otherTenantId}))).toBe(false);
            }),
            {numRuns: 100},
        );
    });

    it('TechnicalToken does not grant Manage or Update on any subject', () => {
        fc.assert(
            fc.property(tenantIdArb, domainArb, (tenantId, domain) => {
                const token = makeTechnicalToken(tenantId, domain);
                const ability = factory.createForSecurityContext(token);

                expect(ability.can(Action.Manage, subject(SubjectEnum.TENANT, {id: tenantId}))).toBe(false);
                expect(ability.can(Action.Manage, subject(SubjectEnum.MEMBER, {tenantId}))).toBe(false);
                expect(ability.can(Action.Manage, subject(SubjectEnum.ROLE, {tenantId}))).toBe(false);
                expect(ability.can(Action.Manage, subject(SubjectEnum.POLICY, {tenantId}))).toBe(false);
                expect(ability.can(Action.Manage, subject(SubjectEnum.CLIENT, {tenantId}))).toBe(false);
                expect(ability.can(Action.Update, subject(SubjectEnum.TENANT, {id: tenantId}))).toBe(false);
            }),
            {numRuns: 100},
        );
    });
});


/**
 * Feature: casl-internal-external-separation, Property 9: Role classification is a pure enum membership check
 *
 * For any string s, isInternalRole(s) shall return true if and only if s is exactly one of
 * "SUPER_ADMIN", "TENANT_ADMIN", or "TENANT_VIEWER". For all other strings (including empty
 * string, whitespace, partial matches, case variations), it shall return false.
 *
 * **Validates: Requirements 6.1, 6.2**
 */
describe('Property 9: Role classification is a pure enum membership check', () => {
    const INTERNAL_ROLES = Object.values(RoleEnum);

    it('returns true for all RoleEnum values', () => {
        for (const role of INTERNAL_ROLES) {
            expect(CaslAbilityFactory.isInternalRole(role)).toBe(true);
        }
    });

    it('returns false for arbitrary random strings', () => {
        fc.assert(
            fc.property(fc.string(), (s) => {
                if (INTERNAL_ROLES.includes(s as RoleEnum)) return; // skip exact matches
                expect(CaslAbilityFactory.isInternalRole(s)).toBe(false);
            }),
            {numRuns: 200},
        );
    });

    it('returns false for case variations of internal role names', () => {
        fc.assert(
            fc.property(fc.constantFrom(...INTERNAL_ROLES), (role) => {
                const lower = role.toLowerCase();
                const mixed = role.charAt(0) + role.slice(1).toLowerCase();
                // Only the exact enum value should match
                if (lower !== role) {
                    expect(CaslAbilityFactory.isInternalRole(lower)).toBe(false);
                }
                if (mixed !== role) {
                    expect(CaslAbilityFactory.isInternalRole(mixed)).toBe(false);
                }
            }),
            {numRuns: 100},
        );
    });

    it('returns false for partial matches and substrings of internal role names', () => {
        fc.assert(
            fc.property(
                fc.constantFrom(...INTERNAL_ROLES),
                fc.integer({min: 1, max: 5}),
                (role, trimLen) => {
                    const prefix = role.slice(0, Math.max(1, role.length - trimLen));
                    const suffix = role.slice(trimLen);
                    if (prefix !== role) {
                        expect(CaslAbilityFactory.isInternalRole(prefix)).toBe(false);
                    }
                    if (suffix !== role) {
                        expect(CaslAbilityFactory.isInternalRole(suffix)).toBe(false);
                    }
                },
            ),
            {numRuns: 100},
        );
    });

    it('returns false for internal role names with extra whitespace or padding', () => {
        fc.assert(
            fc.property(fc.constantFrom(...INTERNAL_ROLES), (role) => {
                expect(CaslAbilityFactory.isInternalRole(` ${role}`)).toBe(false);
                expect(CaslAbilityFactory.isInternalRole(`${role} `)).toBe(false);
                expect(CaslAbilityFactory.isInternalRole(` ${role} `)).toBe(false);
            }),
            {numRuns: 100},
        );
    });

    it('returns false for empty string', () => {
        expect(CaslAbilityFactory.isInternalRole('')).toBe(false);
    });

    it('classification is a pure function — same input always yields same output', () => {
        fc.assert(
            fc.property(fc.string(), (s) => {
                const result1 = CaslAbilityFactory.isInternalRole(s);
                const result2 = CaslAbilityFactory.isInternalRole(s);
                expect(result1).toBe(result2);
            }),
            {numRuns: 200},
        );
    });
});
