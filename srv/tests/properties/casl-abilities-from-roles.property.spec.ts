import * as fc from 'fast-check';
import {CaslAbilityFactory} from '../../src/casl/casl-ability.factory';
import {GRANT_TYPES, TenantToken} from '../../src/casl/contexts';
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

                // Token with different OIDC scopes but same roles
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
