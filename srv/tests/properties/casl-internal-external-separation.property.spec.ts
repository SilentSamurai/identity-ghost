import * as fc from 'fast-check';
import {CaslAbilityFactory} from '../../src/casl/casl-ability.factory';
import {GRANT_TYPES, TenantToken, TechnicalToken} from '../../src/casl/contexts';
import {Action} from '../../src/casl/actions.enum';
import {SubjectEnum} from '../../src/entity/subjectEnum';
import {RoleEnum} from '../../src/entity/roleEnum';
import {Environment} from '../../src/config/environment.service';
import {subject} from '@casl/ability';

/**
 * Feature: casl-internal-external-separation
 *
 * Property tests for the refactored CaslAbilityFactory.
 * The factory is synchronous, takes only Environment, and builds
 * CASL abilities exclusively from the 3 RoleEnum values.
 */
describe('Feature: casl-internal-external-separation — Property Tests', () => {
    const SUPER_DOMAIN = 'super.example.com';

    const mockEnv = {
        get: (key: string) => key === 'SUPER_TENANT_DOMAIN' ? SUPER_DOMAIN : null,
    } as unknown as Environment;

    const factory = new CaslAbilityFactory(mockEnv);

    // --- Arbitraries ---

    /** Random tenant ID */
    const tenantIdArb = fc.uuid();

    /** Random user ID */
    const userIdArb = fc.uuid();

    /** Random email */
    const emailArb = fc.emailAddress();

    /** Random domain string that is NOT the super domain */
    const nonSuperDomainArb = fc.string({minLength: 1, maxLength: 40}).filter(d => d !== SUPER_DOMAIN);

    /** Random domain — either super or non-super */
    const domainArb = fc.oneof(fc.constantFrom(SUPER_DOMAIN), nonSuperDomainArb);

    /** Custom role names — strings that are NOT in RoleEnum */
    const internalRoleNames = Object.values(RoleEnum) as string[];
    const customRoleNameArb = fc.string({minLength: 1, maxLength: 30}).filter(
        s => !internalRoleNames.includes(s),
    );
    const customRolesArb = fc.array(customRoleNameArb, {minLength: 0, maxLength: 5});

    /** Subset of internal roles */
    const internalRolesArb = fc.subarray(internalRoleNames);

    /** OIDC scopes */
    const oidcScopesArb = fc.subarray(['openid', 'profile', 'email']);

    // --- Helpers ---

    function makeTenantToken(overrides: {
        roles: string[];
        tenantId?: string;
        domain?: string;
        email?: string;
        userId?: string;
    }): TenantToken {
        const tenantId = overrides.tenantId ?? 'tid-1';
        const domain = overrides.domain ?? 'test.com';
        const email = overrides.email ?? 'user@test.com';
        const userId = overrides.userId ?? 'uid-1';
        const tenant = {
            id: tenantId,
            name: 'Test Tenant',
            domain,
        };
        const token = TenantToken.create({
            sub: email,
            tenant,
            roles: overrides.roles,
            grant_type: GRANT_TYPES.PASSWORD,
            aud: [domain],
            jti: 'test-jti',
            nbf: 0,
            scope: 'openid profile email',
            client_id: 'test-client',
            tenant_id: tenantId,
        });
        token.email = email;
        token.name = 'Test User';
        token.userId = userId;
        token.userTenant = tenant;
        return token;
    }

    function makeTechnicalToken(tenantId: string, domain: string = 'test.com'): TechnicalToken {
        return TechnicalToken.create({
            sub: 'client-app',
            tenant: {id: tenantId, name: 'Test Tenant', domain},
            scope: 'openid profile email',
            aud: [domain],
            jti: 'test-jti',
            nbf: 0,
            client_id: 'test-client',
            tenant_id: tenantId,
        });
    }

    function subjectWith(subjectType: string, tenantField: string, tenantId: string) {
        return subject(subjectType, {[tenantField]: tenantId} as any);
    }


    // =========================================================================
    // Feature: casl-internal-external-separation, Property 1: Custom roles do not affect internal abilities
    // Validates: Requirements 1.1, 1.2, 6.3
    // =========================================================================
    describe('Property 1: Custom roles do not affect internal abilities', () => {
        it('abilities for token with internal+custom roles equal abilities for internal-only token', () => {
            fc.assert(
                fc.property(
                    internalRolesArb,
                    customRolesArb,
                    tenantIdArb,
                    domainArb,
                    emailArb,
                    userIdArb,
                    (internalRoles: string[], customRoles: string[], tenantId: string, domain: string, email: string, userId: string) => {
                        const mixedToken = makeTenantToken({
                            roles: [...internalRoles, ...customRoles],
                            tenantId, domain, email, userId,
                        });
                        const internalOnlyToken = makeTenantToken({
                            roles: [...internalRoles],
                            tenantId, domain, email, userId,
                        });

                        const mixedAbility = factory.createForSecurityContext(mixedToken);
                        const internalAbility = factory.createForSecurityContext(internalOnlyToken);

                        // Check all relevant action/subject combos produce identical results
                        const subjects = [
                            [SubjectEnum.TENANT, 'id', tenantId],
                            [SubjectEnum.MEMBER, 'tenantId', tenantId],
                            [SubjectEnum.ROLE, 'tenantId', tenantId],
                            [SubjectEnum.POLICY, 'tenantId', tenantId],
                            [SubjectEnum.CLIENT, 'tenantId', tenantId],
                        ] as const;

                        const actions = [Action.Read, Action.Manage, Action.Update, Action.ReadCredentials];

                        for (const action of actions) {
                            for (const [subj, field, id] of subjects) {
                                expect(mixedAbility.can(action, subjectWith(subj, field, id)))
                                    .toBe(internalAbility.can(action, subjectWith(subj, field, id)));
                            }
                        }

                        // Also check User self-management
                        expect(mixedAbility.can(Action.Manage, subject(SubjectEnum.USER, {email} as any)))
                            .toBe(internalAbility.can(Action.Manage, subject(SubjectEnum.USER, {email} as any)));
                        expect(mixedAbility.can(Action.Manage, subject(SubjectEnum.USER, {id: userId} as any)))
                            .toBe(internalAbility.can(Action.Manage, subject(SubjectEnum.USER, {id: userId} as any)));
                    },
                ),
                {numRuns: 100},
            );
        });
    });

    // =========================================================================
    // Feature: casl-internal-external-separation, Property 2: TENANT_VIEWER grants read-only access
    // Validates: Requirements 1.4
    // =========================================================================
    describe('Property 2: TENANT_VIEWER grants read-only access to tenant resources', () => {
        it('TENANT_VIEWER grants Read on Tenant/Member/Role/Policy and denies ReadCredentials on Tenant', () => {
            fc.assert(
                fc.property(tenantIdArb, (tenantId) => {
                    const token = makeTenantToken({
                        roles: [RoleEnum.TENANT_VIEWER],
                        tenantId,
                        domain: 'viewer-tenant.com',
                    });
                    const ability = factory.createForSecurityContext(token);

                    // Read grants
                    expect(ability.can(Action.Read, subjectWith(SubjectEnum.TENANT, 'id', tenantId))).toBe(true);
                    expect(ability.can(Action.Read, subjectWith(SubjectEnum.MEMBER, 'tenantId', tenantId))).toBe(true);
                    expect(ability.can(Action.Read, subjectWith(SubjectEnum.ROLE, 'tenantId', tenantId))).toBe(true);
                    expect(ability.can(Action.Read, subjectWith(SubjectEnum.POLICY, 'tenantId', tenantId))).toBe(true);

                    // ReadCredentials denied
                    expect(ability.can(Action.ReadCredentials, subjectWith(SubjectEnum.TENANT, 'id', tenantId))).toBe(false);
                }),
                {numRuns: 100},
            );
        });
    });

    // =========================================================================
    // Feature: casl-internal-external-separation, Property 3: TENANT_ADMIN grants management access
    // Validates: Requirements 1.5
    // =========================================================================
    describe('Property 3: TENANT_ADMIN grants management access to tenant resources', () => {
        it('TENANT_ADMIN grants Manage on Member/Role/Policy/Client and Read/Update/ReadCredentials on Tenant', () => {
            fc.assert(
                fc.property(tenantIdArb, (tenantId) => {
                    const token = makeTenantToken({
                        roles: [RoleEnum.TENANT_ADMIN],
                        tenantId,
                        domain: 'admin-tenant.com',
                    });
                    const ability = factory.createForSecurityContext(token);

                    // Manage grants on scoped subjects
                    expect(ability.can(Action.Manage, subjectWith(SubjectEnum.MEMBER, 'tenantId', tenantId))).toBe(true);
                    expect(ability.can(Action.Manage, subjectWith(SubjectEnum.ROLE, 'tenantId', tenantId))).toBe(true);
                    expect(ability.can(Action.Manage, subjectWith(SubjectEnum.POLICY, 'tenantId', tenantId))).toBe(true);
                    expect(ability.can(Action.Manage, subjectWith(SubjectEnum.CLIENT, 'tenantId', tenantId))).toBe(true);

                    // Tenant-specific grants
                    expect(ability.can(Action.Read, subjectWith(SubjectEnum.TENANT, 'id', tenantId))).toBe(true);
                    expect(ability.can(Action.Update, subjectWith(SubjectEnum.TENANT, 'id', tenantId))).toBe(true);
                    expect(ability.can(Action.ReadCredentials, subjectWith(SubjectEnum.TENANT, 'id', tenantId))).toBe(true);
                }),
                {numRuns: 100},
            );
        });
    });


    // =========================================================================
    // Feature: casl-internal-external-separation, Property 4: SUPER_ADMIN abilities gated by domain
    // Validates: Requirements 1.6, 1.7
    // =========================================================================
    describe('Property 4: SUPER_ADMIN abilities are gated by tenant domain', () => {
        it('SUPER_ADMIN + super domain grants Manage and ReadCredentials on all subjects', () => {
            fc.assert(
                fc.property(tenantIdArb, (tenantId) => {
                    const token = makeTenantToken({
                        roles: [RoleEnum.SUPER_ADMIN],
                        tenantId,
                        domain: SUPER_DOMAIN,
                    });
                    const ability = factory.createForSecurityContext(token);

                    // Can manage any subject, including other tenants
                    const otherTenantId = 'other-' + tenantId;
                    expect(ability.can(Action.Manage, subjectWith(SubjectEnum.TENANT, 'id', otherTenantId))).toBe(true);
                    expect(ability.can(Action.Manage, subjectWith(SubjectEnum.MEMBER, 'tenantId', otherTenantId))).toBe(true);
                    expect(ability.can(Action.Manage, subjectWith(SubjectEnum.ROLE, 'tenantId', otherTenantId))).toBe(true);
                    expect(ability.can(Action.Manage, subjectWith(SubjectEnum.POLICY, 'tenantId', otherTenantId))).toBe(true);
                    expect(ability.can(Action.Manage, subjectWith(SubjectEnum.CLIENT, 'tenantId', otherTenantId))).toBe(true);
                    expect(ability.can(Action.ReadCredentials, subjectWith(SubjectEnum.TENANT, 'id', otherTenantId))).toBe(true);
                }),
                {numRuns: 100},
            );
        });

        it('SUPER_ADMIN without super domain does NOT grant super admin abilities', () => {
            fc.assert(
                fc.property(tenantIdArb, nonSuperDomainArb, (tenantId, domain) => {
                    const token = makeTenantToken({
                        roles: [RoleEnum.SUPER_ADMIN],
                        tenantId,
                        domain,
                    });
                    const ability = factory.createForSecurityContext(token);

                    // Should NOT have cross-tenant access
                    const otherTenantId = 'other-' + tenantId;
                    expect(ability.can(Action.Manage, subjectWith(SubjectEnum.TENANT, 'id', otherTenantId))).toBe(false);
                    expect(ability.can(Action.Manage, subjectWith(SubjectEnum.MEMBER, 'tenantId', otherTenantId))).toBe(false);
                    expect(ability.can(Action.ReadCredentials, subjectWith(SubjectEnum.TENANT, 'id', otherTenantId))).toBe(false);
                }),
                {numRuns: 100},
            );
        });
    });

    // =========================================================================
    // Feature: casl-internal-external-separation, Property 5: TechnicalToken grants scoped read access
    // Validates: Requirements 1.8
    // =========================================================================
    describe('Property 5: TechnicalToken grants scoped read access', () => {
        it('TechnicalToken grants Read on Tenant/Member/Role/Policy and ReadCredentials on Tenant, scoped to tenant ID', () => {
            fc.assert(
                fc.property(tenantIdArb, (tenantId) => {
                    const token = makeTechnicalToken(tenantId);
                    const ability = factory.createForSecurityContext(token);

                    // Read grants scoped to tenant
                    expect(ability.can(Action.Read, subjectWith(SubjectEnum.TENANT, 'id', tenantId))).toBe(true);
                    expect(ability.can(Action.Read, subjectWith(SubjectEnum.MEMBER, 'tenantId', tenantId))).toBe(true);
                    expect(ability.can(Action.Read, subjectWith(SubjectEnum.ROLE, 'tenantId', tenantId))).toBe(true);
                    expect(ability.can(Action.Read, subjectWith(SubjectEnum.POLICY, 'tenantId', tenantId))).toBe(true);
                    expect(ability.can(Action.ReadCredentials, subjectWith(SubjectEnum.TENANT, 'id', tenantId))).toBe(true);

                    // Should NOT have access to other tenants
                    const otherTenantId = 'other-' + tenantId;
                    expect(ability.can(Action.Read, subjectWith(SubjectEnum.TENANT, 'id', otherTenantId))).toBe(false);
                    expect(ability.can(Action.Read, subjectWith(SubjectEnum.MEMBER, 'tenantId', otherTenantId))).toBe(false);

                    // Should NOT have Manage access
                    expect(ability.can(Action.Manage, subjectWith(SubjectEnum.TENANT, 'id', tenantId))).toBe(false);
                    expect(ability.can(Action.Manage, subjectWith(SubjectEnum.MEMBER, 'tenantId', tenantId))).toBe(false);
                }),
                {numRuns: 100},
            );
        });
    });

    // =========================================================================
    // Feature: casl-internal-external-separation, Property 6: User self-management always granted
    // Validates: Requirements 1.9, 8.2
    // =========================================================================
    describe('Property 6: User self-management is always granted', () => {
        it('any TenantToken (including empty roles) grants Manage on User scoped to own email and userId', () => {
            fc.assert(
                fc.property(
                    fc.array(fc.string({minLength: 1, maxLength: 20}), {minLength: 0, maxLength: 5}),
                    tenantIdArb,
                    nonSuperDomainArb,
                    emailArb,
                    userIdArb,
                    (roles, tenantId, domain, email, userId) => {
                        const token = makeTenantToken({roles, tenantId, domain, email, userId});
                        const ability = factory.createForSecurityContext(token);

                        // User can manage their own User subject by email
                        expect(ability.can(Action.Manage, subject(SubjectEnum.USER, {email} as any))).toBe(true);
                        // User can manage their own User subject by ID
                        expect(ability.can(Action.Manage, subject(SubjectEnum.USER, {id: userId} as any))).toBe(true);
                    },
                ),
                {numRuns: 100},
            );
        });

        it('TenantToken cannot manage other users', () => {
            fc.assert(
                fc.property(
                    internalRolesArb.filter(r => !r.includes(RoleEnum.SUPER_ADMIN)),
                    nonSuperDomainArb,
                    emailArb,
                    userIdArb,
                    emailArb,
                    userIdArb,
                    (roles, domain, ownEmail, ownUserId, otherEmail, otherUserId) => {
                        fc.pre(ownEmail !== otherEmail && ownUserId !== otherUserId);

                        const token = makeTenantToken({
                            roles,
                            domain,
                            email: ownEmail,
                            userId: ownUserId,
                        });
                        const ability = factory.createForSecurityContext(token);

                        // Cannot manage other users
                        expect(ability.can(Action.Manage, subject(SubjectEnum.USER, {email: otherEmail} as any))).toBe(false);
                        expect(ability.can(Action.Manage, subject(SubjectEnum.USER, {id: otherUserId} as any))).toBe(false);
                    },
                ),
                {numRuns: 100},
            );
        });
    });

    // =========================================================================
    // Feature: casl-internal-external-separation, Property 9: Role classification is pure enum membership
    // Validates: Requirements 6.1, 6.2
    // =========================================================================
    describe('Property 9: Role classification is a pure enum membership check', () => {
        it('isInternalRole returns true only for the 3 RoleEnum values', () => {
            fc.assert(
                fc.property(fc.string({minLength: 0, maxLength: 50}), (s) => {
                    const result = CaslAbilityFactory.isInternalRole(s);
                    const expected = internalRoleNames.includes(s);
                    expect(result).toBe(expected);
                }),
                {numRuns: 100},
            );
        });

        it('all 3 RoleEnum values are classified as internal', () => {
            for (const role of internalRoleNames) {
                expect(CaslAbilityFactory.isInternalRole(role)).toBe(true);
            }
        });

        it('case variations and partial matches are NOT internal', () => {
            fc.assert(
                fc.property(
                    fc.constantFrom('super_admin', 'Super_Admin', 'TENANT_viewer', 'tenant_admin', 'SUPER', 'ADMIN', 'TENANT', ''),
                    (s) => {
                        expect(CaslAbilityFactory.isInternalRole(s)).toBe(false);
                    },
                ),
                {numRuns: 100},
            );
        });
    });
});
