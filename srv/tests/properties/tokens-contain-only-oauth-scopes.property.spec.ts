import * as fc from 'fast-check';
import {RoleEnum} from '../../src/entity/roleEnum';
import {getPermittedScopes} from '../../src/casl/role-scope-map';

/**
 * Feature: scope-model-refactoring, Property 7: Tokens contain only OAuth scopes
 *
 * For any token issued by the Auth Server (via createUserAccessToken or
 * createSubscribedUserAccessToken), the scopes field in the token payload shall
 * contain only valid OAuth scope values from the defined scope vocabulary
 * (openid, profile, email, tenant.read, tenant.write) and shall never contain
 * role enum names (SUPER_ADMIN, TENANT_ADMIN, TENANT_VIEWER).
 *
 * Validates: Requirements 9.1, 9.2, 9.3
 */
describe('Property 7: Tokens contain only OAuth scopes', () => {
    const OAUTH_SCOPE_VOCABULARY = new Set([
        'openid',
        'profile',
        'email',
        'tenant.read',
        'tenant.write',
    ]);

    const ROLE_ENUM_NAMES = new Set([
        RoleEnum.SUPER_ADMIN,
        RoleEnum.TENANT_ADMIN,
        RoleEnum.TENANT_VIEWER,
    ]);

    const allRoles = Object.values(RoleEnum);

    const roleSubsetArb = fc.subarray(allRoles, {minLength: 0, maxLength: allRoles.length});

    it('getPermittedScopes returns only OAuth scope vocabulary values', () => {
        fc.assert(
            fc.property(roleSubsetArb, (roles) => {
                const scopes = getPermittedScopes(roles);

                for (const scope of scopes) {
                    expect(OAUTH_SCOPE_VOCABULARY.has(scope)).toBe(true);
                }
            }),
            {numRuns: 200},
        );
    });

    it('getPermittedScopes never returns role enum names', () => {
        fc.assert(
            fc.property(roleSubsetArb, (roles) => {
                const scopes = getPermittedScopes(roles);

                for (const scope of scopes) {
                    expect(ROLE_ENUM_NAMES.has(scope as RoleEnum)).toBe(false);
                }
            }),
            {numRuns: 200},
        );
    });

    it('result is non-empty when at least one valid role is provided', () => {
        fc.assert(
            fc.property(
                fc.subarray(allRoles, {minLength: 1, maxLength: allRoles.length}),
                (roles) => {
                    const scopes = getPermittedScopes(roles);
                    expect(scopes.length).toBeGreaterThan(0);
                },
            ),
            {numRuns: 200},
        );
    });

    it('result falls back to TENANT_VIEWER scopes for unknown role names', () => {
        const protoKeys = new Set(['__proto__', 'constructor', 'toString', 'valueOf', 'hasOwnProperty']);
        const unknownRoleArb = fc.array(
            fc.string({minLength: 1, maxLength: 20}).filter(
                (s) => !allRoles.includes(s as RoleEnum) && !protoKeys.has(s),
            ),
            {minLength: 1, maxLength: 5},
        );

        const TENANT_VIEWER_SCOPES = ['email', 'openid', 'profile', 'tenant.read'];

        fc.assert(
            fc.property(unknownRoleArb, (roles) => {
                const scopes = getPermittedScopes(roles);
                expect(scopes).toEqual(TENANT_VIEWER_SCOPES);
            }),
            {numRuns: 200},
        );
    });

    it('simulated token creation produces only OAuth scopes, never role names', () => {
        fc.assert(
            fc.property(roleSubsetArb, (roles) => {
                // Simulate what createUserAccessToken does:
                // let oauthScopes = getPermittedScopes(roles.map(r => r.name));
                // oauthScopes = [...new Set(oauthScopes)].sort();
                const oauthScopes = getPermittedScopes(roles);
                const finalScopes = [...new Set(oauthScopes)].sort();

                for (const scope of finalScopes) {
                    expect(OAUTH_SCOPE_VOCABULARY.has(scope)).toBe(true);
                    expect(ROLE_ENUM_NAMES.has(scope as RoleEnum)).toBe(false);
                }
            }),
            {numRuns: 200},
        );
    });
});
