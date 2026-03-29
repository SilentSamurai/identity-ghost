import * as fc from 'fast-check';
import {CaslAbilityFactory} from '../../src/casl/casl-ability.factory';
import {GRANT_TYPES, TenantToken} from '../../src/casl/contexts';
import {Action} from '../../src/casl/actions.enum';
import {SubjectEnum} from '../../src/entity/subjectEnum';
import {RoleEnum} from '../../src/entity/roleEnum';
import {Environment} from '../../src/config/environment.service';
import {subject} from '@casl/ability';

/**
 * Feature: casl-internal-external-separation, Property 1: Custom roles do not affect internal abilities
 *
 * For any TenantToken with a set of internal roles I ⊆ RoleEnum and any set of custom role names C
 * (where no element of C is in RoleEnum), the CASL abilities produced by createForSecurityContext()
 * for a token with roles I ∪ C shall be identical to the abilities produced for a token with roles I alone.
 *
 * **Validates: Requirements 1.1, 1.2, 6.3**
 */
describe('Property 1: Custom roles do not affect internal abilities', () => {
    const SUPER_DOMAIN = 'super.example.com';
    const TENANT_ID = 'tid-prop1';

    const mockEnv = {
        get: (key: string) => key === 'SUPER_TENANT_DOMAIN' ? SUPER_DOMAIN : null,
    } as unknown as Environment;

    const factory = new CaslAbilityFactory(mockEnv);

    const internalRoleValues = Object.values(RoleEnum);

    // Arbitrary subset of internal roles
    const internalRolesArb = fc.subarray(internalRoleValues);

    // Custom role names: non-empty strings that are NOT any RoleEnum value
    const customRoleArb = fc.string({minLength: 1, maxLength: 40})
        .filter(s => !internalRoleValues.includes(s as RoleEnum));

    // Array of 0-5 custom role names
    const customRolesArb = fc.array(customRoleArb, {minLength: 1, maxLength: 5});

    // Domain: either the super domain or a random non-super domain
    const domainArb: fc.Arbitrary<string> = fc.oneof(
        fc.constantFrom(SUPER_DOMAIN),
        fc.string({minLength: 1, maxLength: 30}).filter(d => d !== SUPER_DOMAIN),
    );

    function makeTenantToken(roles: string[], domain: string): TenantToken {
        return TenantToken.create({
            sub: 'user@test.com',
            email: 'user@test.com',
            name: 'Test User',
            userId: 'uid-prop1',
            tenant: {id: TENANT_ID, name: 'Test Tenant', domain},
            userTenant: {id: TENANT_ID, name: 'Test Tenant', domain},
            scopes: ['openid', 'profile', 'email'],
            roles,
            grant_type: GRANT_TYPES.PASSWORD,
        });
    }

    function subjectWith(subjectType: string, tenantField: string, tenantId: string) {
        return subject(subjectType, {[tenantField]: tenantId} as any);
    }

    // All action/subject combos to check — covers every ability the factory can grant
    const abilityChecks = [
        [Action.Read, SubjectEnum.TENANT, 'id'],
        [Action.Update, SubjectEnum.TENANT, 'id'],
        [Action.ReadCredentials, SubjectEnum.TENANT, 'id'],
        [Action.Manage, SubjectEnum.TENANT, 'id'],
        [Action.Read, SubjectEnum.MEMBER, 'tenantId'],
        [Action.Manage, SubjectEnum.MEMBER, 'tenantId'],
        [Action.Read, SubjectEnum.ROLE, 'tenantId'],
        [Action.Manage, SubjectEnum.ROLE, 'tenantId'],
        [Action.Read, SubjectEnum.POLICY, 'tenantId'],
        [Action.Manage, SubjectEnum.POLICY, 'tenantId'],
        [Action.Manage, SubjectEnum.CLIENT, 'tenantId'],
        [Action.Manage, SubjectEnum.USER, 'email'],
    ] as const;

    it('adding custom roles to a token does not change any CASL ability', () => {
        fc.assert(
            fc.property(
                internalRolesArb,
                customRolesArb,
                domainArb,
                (internalRoles, customRoles, domain) => {
                    const internalOnlyToken = makeTenantToken([...internalRoles], domain);
                    const mixedToken = makeTenantToken([...internalRoles, ...customRoles], domain);

                    const internalAbility = factory.createForSecurityContext(internalOnlyToken);
                    const mixedAbility = factory.createForSecurityContext(mixedToken);

                    for (const [action, subj, field] of abilityChecks) {
                        const subjectInstance = subjectWith(subj, field, TENANT_ID);
                        expect(mixedAbility.can(action, subjectInstance))
                            .toBe(internalAbility.can(action, subjectInstance));
                    }
                },
            ),
            {numRuns: 200},
        );
    });

    it('a token with only custom roles produces the same abilities as a token with no roles', () => {
        fc.assert(
            fc.property(
                customRolesArb,
                domainArb,
                (customRoles, domain) => {
                    const noRolesToken = makeTenantToken([], domain);
                    const customOnlyToken = makeTenantToken([...customRoles], domain);

                    const noRolesAbility = factory.createForSecurityContext(noRolesToken);
                    const customOnlyAbility = factory.createForSecurityContext(customOnlyToken);

                    for (const [action, subj, field] of abilityChecks) {
                        const subjectInstance = subjectWith(subj, field, TENANT_ID);
                        expect(customOnlyAbility.can(action, subjectInstance))
                            .toBe(noRolesAbility.can(action, subjectInstance));
                    }
                },
            ),
            {numRuns: 200},
        );
    });

    it('ability.rules arrays are identical regardless of custom roles', () => {
        fc.assert(
            fc.property(
                internalRolesArb,
                customRolesArb,
                domainArb,
                (internalRoles, customRoles, domain) => {
                    const internalOnlyAbility = factory.createForSecurityContext(
                        makeTenantToken([...internalRoles], domain),
                    );
                    const mixedAbility = factory.createForSecurityContext(
                        makeTenantToken([...internalRoles, ...customRoles], domain),
                    );

                    // The raw rules arrays should be structurally identical
                    expect(mixedAbility.rules).toEqual(internalOnlyAbility.rules);
                },
            ),
            {numRuns: 200},
        );
    });
});
