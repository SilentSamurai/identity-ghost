import * as fc from 'fast-check';
import {CaslAbilityFactory} from '../../src/casl/casl-ability.factory';
import {GRANT_TYPES, TenantToken} from '../../src/casl/contexts';
import {Action} from '../../src/casl/actions.enum';
import {SubjectEnum} from '../../src/entity/subjectEnum';
import {RoleEnum} from '../../src/entity/roleEnum';
import {Environment} from '../../src/config/environment.service';
import {subject} from '@casl/ability';

/**
 * Feature: casl-internal-external-separation, Property 6: User self-management is always granted
 *
 * For any TenantToken regardless of which roles are present (including no RoleEnum roles),
 * the resulting ability shall allow Manage on the User subject scoped to the token holder's
 * own email and user ID.
 *
 * **Validates: Requirements 1.9, 8.2**
 */
describe('Property 6: User self-management is always granted', () => {
    const SUPER_DOMAIN = 'super.example.com';

    const mockEnv = {
        get: (key: string) => key === 'SUPER_TENANT_DOMAIN' ? SUPER_DOMAIN : null,
    } as unknown as Environment;

    const factory = new CaslAbilityFactory(mockEnv);

    const internalRoleValues = Object.values(RoleEnum);

    // Arbitrary subset of internal roles (including empty)
    const internalRolesArb = fc.subarray(internalRoleValues);

    // Custom role names that are NOT any RoleEnum value
    const customRoleArb = fc.string({minLength: 1, maxLength: 40})
        .filter(s => !internalRoleValues.includes(s as RoleEnum));

    // Array of 0-5 custom role names
    const customRolesArb = fc.array(customRoleArb, {minLength: 0, maxLength: 5});

    // Combine internal + custom roles for arbitrary role arrays
    const arbitraryRolesArb = fc.tuple(internalRolesArb, customRolesArb)
        .map(([internal, custom]) => [...internal, ...custom]);

    // Random user identity fields
    const emailArb = fc.emailAddress();
    const userIdArb = fc.uuid().map(id => `uid-${id}`);
    const tenantIdArb = fc.uuid().map(id => `tid-${id}`);

    // Domain: either the super domain or a random non-super domain
    const domainArb: fc.Arbitrary<string> = fc.oneof(
        fc.constantFrom(SUPER_DOMAIN),
        fc.string({minLength: 1, maxLength: 30}).filter(d => d !== SUPER_DOMAIN),
    );

    function makeTenantToken(
        roles: string[],
        email: string,
        userId: string,
        tenantId: string,
        domain: string,
    ): TenantToken {
        return TenantToken.create({
            sub: email,
            email,
            name: 'Test User',
            userId,
            tenant: {id: tenantId, name: 'Test Tenant', domain},
            userTenant: {id: tenantId, name: 'Test Tenant', domain},
            scopes: ['openid', 'profile', 'email'],
            roles,
            grant_type: GRANT_TYPES.PASSWORD,
        });
    }

    it('user can always Manage their own User by email', () => {
        fc.assert(
            fc.property(
                arbitraryRolesArb, emailArb, userIdArb, tenantIdArb, domainArb,
                (roles, email, userId, tenantId, domain) => {
                    const token = makeTenantToken(roles, email, userId, tenantId, domain);
                    const ability = factory.createForSecurityContext(token);

                    expect(ability.can(Action.Manage, subject(SubjectEnum.USER, {email}))).toBe(true);
                },
            ),
            {numRuns: 200},
        );
    });

    it('user can always Manage their own User by userId', () => {
        fc.assert(
            fc.property(
                arbitraryRolesArb, emailArb, userIdArb, tenantIdArb, domainArb,
                (roles, email, userId, tenantId, domain) => {
                    const token = makeTenantToken(roles, email, userId, tenantId, domain);
                    const ability = factory.createForSecurityContext(token);

                    expect(ability.can(Action.Manage, subject(SubjectEnum.USER, {id: userId}))).toBe(true);
                },
            ),
            {numRuns: 200},
        );
    });

    it('user cannot Manage other users', () => {
        fc.assert(
            fc.property(
                arbitraryRolesArb, emailArb, userIdArb, emailArb, userIdArb, tenantIdArb,
                (roles, email, userId, otherEmail, otherUserId, tenantId) => {
                    // Ensure the "other" user is actually different
                    fc.pre(email !== otherEmail);
                    fc.pre(userId !== otherUserId);

                    // Use non-super domain to avoid SUPER_ADMIN granting Manage all
                    const domain = 'regular.example.com';
                    const token = makeTenantToken(
                        roles.filter(r => r !== RoleEnum.SUPER_ADMIN),
                        email, userId, tenantId, domain,
                    );
                    const ability = factory.createForSecurityContext(token);

                    expect(ability.can(Action.Manage, subject(SubjectEnum.USER, {email: otherEmail}))).toBe(false);
                    expect(ability.can(Action.Manage, subject(SubjectEnum.USER, {id: otherUserId}))).toBe(false);
                },
            ),
            {numRuns: 200},
        );
    });

    it('user with only custom roles (no RoleEnum roles) still has User self-management', () => {
        fc.assert(
            fc.property(
                customRolesArb, emailArb, userIdArb, tenantIdArb, domainArb,
                (customRoles, email, userId, tenantId, domain) => {
                    const token = makeTenantToken(customRoles, email, userId, tenantId, domain);
                    const ability = factory.createForSecurityContext(token);

                    expect(ability.can(Action.Manage, subject(SubjectEnum.USER, {email}))).toBe(true);
                    expect(ability.can(Action.Manage, subject(SubjectEnum.USER, {id: userId}))).toBe(true);
                },
            ),
            {numRuns: 200},
        );
    });

    it('user with empty roles array still has User self-management', () => {
        fc.assert(
            fc.property(
                emailArb, userIdArb, tenantIdArb, domainArb,
                (email, userId, tenantId, domain) => {
                    const token = makeTenantToken([], email, userId, tenantId, domain);
                    const ability = factory.createForSecurityContext(token);

                    expect(ability.can(Action.Manage, subject(SubjectEnum.USER, {email}))).toBe(true);
                    expect(ability.can(Action.Manage, subject(SubjectEnum.USER, {id: userId}))).toBe(true);
                },
            ),
            {numRuns: 100},
        );
    });
});
