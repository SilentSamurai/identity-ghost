import * as fc from 'fast-check';
import {GRANT_TYPES, TenantToken, TechnicalToken} from '../../src/casl/contexts';
import {RoleEnum} from '../../src/entity/roleEnum';

/**
 * Feature: access-token-claims-compliance, Property 3: Scope/role separation
 *
 * For any issued access token, the `scope` claim SHALL contain only valid OIDC
 * scope values (`openid`, `profile`, `email`) and SHALL NOT contain any role
 * enum names (`SUPER_ADMIN`, `TENANT_ADMIN`, `TENANT_VIEWER`).
 *
 * For TenantTokens, the `roles` array SHALL contain only valid role enum names
 * and SHALL NOT contain any OIDC scope values.
 *
 * **Validates: Requirements 1.6, 5.6**
 */
describe('Property 3: Scope/role separation', () => {
    const VALID_OIDC_SCOPES = ['openid', 'profile', 'email'];
    const VALID_ROLES = [RoleEnum.SUPER_ADMIN, RoleEnum.TENANT_ADMIN, RoleEnum.TENANT_VIEWER];
    const TENANT_GRANT_TYPES = [GRANT_TYPES.PASSWORD, GRANT_TYPES.CODE, GRANT_TYPES.REFRESH_TOKEN];

    const uuidArb = fc.uuid();
    const nameArb = fc.string({ minLength: 1, maxLength: 50 });
    const domainArb = fc.domain();
    const scopesArb = fc.subarray(VALID_OIDC_SCOPES, { minLength: 0 });
    const rolesArb = fc.subarray(VALID_ROLES, { minLength: 0 });
    const grantTypeArb = fc.constantFrom(...TENANT_GRANT_TYPES);

    describe('TenantToken', () => {
        it('scope contains only OIDC values and no role enum names', () => {
            fc.assert(
                fc.property(
                    uuidArb, uuidArb, nameArb, domainArb, uuidArb,
                    scopesArb, rolesArb, grantTypeArb,
                    (userId, tenantId, tenantName, tenantDomain, clientId, scopes, roles, grantType) => {
                        const token = TenantToken.create({
                            sub: userId,
                            tenant: { id: tenantId, name: tenantName, domain: tenantDomain },
                            roles,
                            grant_type: grantType,
                            aud: ['https://auth.example.com'],
                            jti: crypto.randomUUID(),
                            nbf: Math.floor(Date.now() / 1000),
                            scope: scopes.join(' '),
                            client_id: clientId,
                            tenant_id: tenantId,
                        });

                        const payload = token.asPlainObject();

                        // scope must be a string
                        expect(typeof payload.scope).toBe('string');

                        // Each scope value must be a valid OIDC scope
                        const scopeValues = payload.scope.length > 0
                            ? payload.scope.split(' ')
                            : [];
                        for (const s of scopeValues) {
                            expect(VALID_OIDC_SCOPES).toContain(s);
                        }

                        // scope must NOT contain any role enum names
                        for (const role of VALID_ROLES) {
                            expect(payload.scope).not.toContain(role);
                        }
                    },
                ),
                { numRuns: 100 },
            );
        });

        it('roles contains only valid role enum names and no OIDC scope values', () => {
            fc.assert(
                fc.property(
                    uuidArb, uuidArb, nameArb, domainArb, uuidArb,
                    scopesArb, rolesArb, grantTypeArb,
                    (userId, tenantId, tenantName, tenantDomain, clientId, scopes, roles, grantType) => {
                        const token = TenantToken.create({
                            sub: userId,
                            tenant: { id: tenantId, name: tenantName, domain: tenantDomain },
                            roles,
                            grant_type: grantType,
                            aud: ['https://auth.example.com'],
                            jti: crypto.randomUUID(),
                            nbf: Math.floor(Date.now() / 1000),
                            scope: scopes.join(' '),
                            client_id: clientId,
                            tenant_id: tenantId,
                        });

                        const payload = token.asPlainObject();

                        // roles must be an array
                        expect(Array.isArray(payload.roles)).toBe(true);

                        // Each role must be a valid role enum name
                        for (const r of payload.roles) {
                            expect(VALID_ROLES).toContain(r);
                        }

                        // roles must NOT contain any OIDC scope values
                        for (const oidcScope of VALID_OIDC_SCOPES) {
                            expect(payload.roles).not.toContain(oidcScope);
                        }
                    },
                ),
                { numRuns: 100 },
            );
        });
    });

    describe('TechnicalToken', () => {
        it('scope contains only OIDC values and no role enum names', () => {
            fc.assert(
                fc.property(
                    uuidArb, nameArb, domainArb, uuidArb, scopesArb,
                    (tenantId, tenantName, tenantDomain, clientId, scopes) => {
                        const token = TechnicalToken.create({
                            sub: 'oauth',
                            tenant: { id: tenantId, name: tenantName, domain: tenantDomain },
                            scope: scopes.join(' '),
                            aud: ['https://auth.example.com'],
                            jti: crypto.randomUUID(),
                            nbf: Math.floor(Date.now() / 1000),
                            client_id: clientId,
                            tenant_id: tenantId,
                        });

                        const payload = token.asPlainObject();

                        // scope must be a string
                        expect(typeof payload.scope).toBe('string');

                        // Each scope value must be a valid OIDC scope
                        const scopeValues = payload.scope.length > 0
                            ? payload.scope.split(' ')
                            : [];
                        for (const s of scopeValues) {
                            expect(VALID_OIDC_SCOPES).toContain(s);
                        }

                        // scope must NOT contain any role enum names
                        for (const role of VALID_ROLES) {
                            expect(payload.scope).not.toContain(role);
                        }
                    },
                ),
                { numRuns: 100 },
            );
        });
    });
});
