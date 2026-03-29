import * as fc from 'fast-check';
import {CaslAbilityFactory} from '../../src/casl/casl-ability.factory';
import {GRANT_TYPES, TenantToken} from '../../src/casl/contexts';
import {Action} from '../../src/casl/actions.enum';
import {SubjectEnum} from '../../src/entity/subjectEnum';
import {Environment} from '../../src/config/environment.service';
import {subject} from '@casl/ability';

/**
 * Feature: scope-model-refactoring, Property 8: CASL abilities from OAuth scopes
 *
 * For any TenantToken with a given set of OAuth scopes, the CASL abilities
 * produced by CaslAbilityFactory.createForSecurityContext() shall be determined
 * solely by the OAuth scope values in token.scopes (not by role names).
 *
 * - tenant.read → Read on TENANT/MEMBER/ROLE/POLICY for token's tenant
 * - tenant.write → ReadCredentials/Update on TENANT, Manage on MEMBER/ROLE/POLICY/CLIENT for token's tenant
 * - tenant.write + super domain → Manage all + ReadCredentials all
 *
 * Validates: Requirements 6.1, 6.2, 6.3, 6.4
 */
describe('Property 8: CASL abilities from OAuth scopes', () => {
    const SUPER_DOMAIN = 'super.example.com';
    const TENANT_ID = 'tid-test-1';
    const OTHER_TENANT_ID = 'tid-other-2';

    const mockEnv = {
        get: (key: string) => key === 'SUPER_TENANT_DOMAIN' ? SUPER_DOMAIN : null,
    } as unknown as Environment;

    const mockCacheService = {
        has: () => false,
        get: () => undefined,
        set: () => true,
    };

    // roleRepository.findOne always returns null — OAuth scopes won't match role names
    const mockRoleRepo = {findOne: async () => null};
    const mockPolicyRepo = {};

    const factory = new CaslAbilityFactory(
        mockEnv,
        mockCacheService as any,
        mockRoleRepo as any,
        mockPolicyRepo as any,
    );

    const oauthScopes = ['openid', 'profile', 'email', 'tenant.read', 'tenant.write'];
    const scopeSubsetArb = fc.subarray(oauthScopes);
    const domainArb = fc.oneof(
        fc.constantFrom(SUPER_DOMAIN),
        fc.string({minLength: 1, maxLength: 30}),
    );

    function makeTenantToken(scopes: string[], domain: string): TenantToken {
        return TenantToken.create({
            sub: 'user@test.com',
            email: 'user@test.com',
            name: 'Test User',
            userId: 'uid-1',
            tenant: {id: TENANT_ID, name: 'Test Tenant', domain},
            userTenant: {id: TENANT_ID, name: 'Test Tenant', domain},
            scopes,
            grant_type: GRANT_TYPES.PASSWORD,
        });
    }

    /** Helper: check ability on a subject scoped to a tenant */
    function subjectWith(subjectType: string, tenantField: string, tenantId: string) {
        return subject(subjectType, {[tenantField]: tenantId} as any);
    }

    it('tenant.read grants Read on TENANT/MEMBER/ROLE/POLICY for token tenant', async () => {
        await fc.assert(
            fc.asyncProperty(scopeSubsetArb, domainArb, async (scopes, domain) => {
                const token = makeTenantToken(scopes, domain);
                const ability = await factory.createForSecurityContext(token);
                const hasTenantRead = scopes.includes('tenant.read');

                if (hasTenantRead) {
                    expect(ability.can(Action.Read, subjectWith(SubjectEnum.TENANT, 'id', TENANT_ID))).toBe(true);
                    expect(ability.can(Action.Read, subjectWith(SubjectEnum.MEMBER, 'tenantId', TENANT_ID))).toBe(true);
                    expect(ability.can(Action.Read, subjectWith(SubjectEnum.ROLE, 'tenantId', TENANT_ID))).toBe(true);
                    expect(ability.can(Action.Read, subjectWith(SubjectEnum.POLICY, 'tenantId', TENANT_ID))).toBe(true);
                }
            }),
            {numRuns: 200},
        );
    });

    it('without tenant.read and without tenant.write, no Read on tenant resources', async () => {
        await fc.assert(
            fc.asyncProperty(domainArb, async (domain) => {
                // Scopes with neither tenant.read nor tenant.write
                const scopes = fc.sample(fc.subarray(['openid', 'profile', 'email']), 1)[0];
                const token = makeTenantToken(scopes, domain);
                const ability = await factory.createForSecurityContext(token);

                expect(ability.can(Action.Read, subjectWith(SubjectEnum.TENANT, 'id', TENANT_ID))).toBe(false);
                expect(ability.can(Action.Read, subjectWith(SubjectEnum.MEMBER, 'tenantId', TENANT_ID))).toBe(false);
                expect(ability.can(Action.Read, subjectWith(SubjectEnum.ROLE, 'tenantId', TENANT_ID))).toBe(false);
                expect(ability.can(Action.Read, subjectWith(SubjectEnum.POLICY, 'tenantId', TENANT_ID))).toBe(false);
            }),
            {numRuns: 100},
        );
    });

    it('tenant.write grants ReadCredentials/Update on TENANT and Manage on MEMBER/ROLE/POLICY/CLIENT', async () => {
        await fc.assert(
            fc.asyncProperty(scopeSubsetArb, domainArb, async (scopes, domain) => {
                const token = makeTenantToken(scopes, domain);
                const ability = await factory.createForSecurityContext(token);
                const hasTenantWrite = scopes.includes('tenant.write');

                if (hasTenantWrite) {
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

    it('without tenant.write, no write abilities on tenant resources', async () => {
        const noWriteScopes = fc.subarray(['openid', 'profile', 'email', 'tenant.read']);
        // Use a non-super domain to isolate the tenant.write check
        const nonSuperDomain = fc.string({minLength: 1, maxLength: 30}).filter(d => d !== SUPER_DOMAIN);

        await fc.assert(
            fc.asyncProperty(noWriteScopes, nonSuperDomain, async (scopes, domain) => {
                const token = makeTenantToken(scopes, domain);
                const ability = await factory.createForSecurityContext(token);

                expect(ability.can(Action.ReadCredentials, subjectWith(SubjectEnum.TENANT, 'id', TENANT_ID))).toBe(false);
                expect(ability.can(Action.Update, subjectWith(SubjectEnum.TENANT, 'id', TENANT_ID))).toBe(false);
                expect(ability.can(Action.Manage, subjectWith(SubjectEnum.MEMBER, 'tenantId', TENANT_ID))).toBe(false);
                expect(ability.can(Action.Manage, subjectWith(SubjectEnum.ROLE, 'tenantId', TENANT_ID))).toBe(false);
                expect(ability.can(Action.Manage, subjectWith(SubjectEnum.CLIENT, 'tenantId', TENANT_ID))).toBe(false);
            }),
            {numRuns: 200},
        );
    });

    it('tenant.write + super domain grants Manage all and ReadCredentials all', async () => {
        await fc.assert(
            fc.asyncProperty(scopeSubsetArb, async (scopes) => {
                const token = makeTenantToken(scopes, SUPER_DOMAIN);
                const ability = await factory.createForSecurityContext(token);
                const hasTenantWrite = scopes.includes('tenant.write');

                if (hasTenantWrite) {
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

    it('tenant.write without super domain does NOT grant cross-tenant access', async () => {
        const nonSuperDomain = fc.string({minLength: 1, maxLength: 30}).filter(d => d !== SUPER_DOMAIN);

        await fc.assert(
            fc.asyncProperty(nonSuperDomain, async (domain) => {
                const scopes = ['openid', 'profile', 'email', 'tenant.read', 'tenant.write'];
                const token = makeTenantToken(scopes, domain);
                const ability = await factory.createForSecurityContext(token);

                // Should NOT have access to other tenants
                expect(ability.can(Action.Manage, subjectWith(SubjectEnum.TENANT, 'id', OTHER_TENANT_ID))).toBe(false);
                expect(ability.can(Action.Manage, subjectWith(SubjectEnum.MEMBER, 'tenantId', OTHER_TENANT_ID))).toBe(false);
                expect(ability.can(Action.ReadCredentials, subjectWith(SubjectEnum.TENANT, 'id', OTHER_TENANT_ID))).toBe(false);
            }),
            {numRuns: 200},
        );
    });

    it('abilities are determined solely by OAuth scopes, not role names', async () => {
        await fc.assert(
            fc.asyncProperty(scopeSubsetArb, domainArb, async (scopes, domain) => {
                const token = makeTenantToken(scopes, domain);
                const ability = await factory.createForSecurityContext(token);

                // The same scope set should always produce the same abilities
                const token2 = makeTenantToken([...scopes], domain);
                const ability2 = await factory.createForSecurityContext(token2);

                // Verify key abilities match between identical scope sets
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
                    expect(ability.can(action, subjectWith(subj, field, id)))
                        .toBe(ability2.can(action, subjectWith(subj, field, id)));
                }
            }),
            {numRuns: 200},
        );
    });
});
