import * as fc from 'fast-check';
import {GRANT_TYPES, TenantToken, TechnicalToken} from '../../src/casl/contexts';
import {RoleEnum} from '../../src/entity/roleEnum';

/**
 * Feature: access-token-claims-compliance, Property 8: Profile data exclusion
 *
 * For any issued access token, the decoded JWT payload SHALL NOT contain
 * `email`, `name`, `userId`, or `userTenant`.
 *
 * **Validates: Requirements 5.1, 5.2, 5.3, 5.4**
 */
describe('Property 8: Profile data exclusion', () => {
    const VALID_OIDC_SCOPES = ['openid', 'profile', 'email'];
    const VALID_ROLES = [RoleEnum.SUPER_ADMIN, RoleEnum.TENANT_ADMIN, RoleEnum.TENANT_VIEWER];
    const TENANT_GRANT_TYPES = [GRANT_TYPES.PASSWORD, GRANT_TYPES.CODE, GRANT_TYPES.REFRESH_TOKEN];

    const EXCLUDED_FIELDS = ['email', 'name', 'userId', 'userTenant'];

    const uuidArb = fc.uuid();
    const nameArb = fc.string({ minLength: 1, maxLength: 50 });
    const domainArb = fc.domain();
    const scopesArb = fc.subarray(VALID_OIDC_SCOPES, { minLength: 0 });
    const rolesArb = fc.subarray(VALID_ROLES, { minLength: 0 });
    const grantTypeArb = fc.constantFrom(...TENANT_GRANT_TYPES);

    describe('TenantToken', () => {
        it('asPlainObject() does not contain email, name, userId, or userTenant', () => {
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
                        for (const field of EXCLUDED_FIELDS) {
                            expect(payload).not.toHaveProperty(field);
                        }
                    },
                ),
                { numRuns: 100 },
            );
        });
    });

    describe('TechnicalToken', () => {
        it('asPlainObject() does not contain email, name, userId, or userTenant', () => {
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
                        for (const field of EXCLUDED_FIELDS) {
                            expect(payload).not.toHaveProperty(field);
                        }
                    },
                ),
                { numRuns: 100 },
            );
        });
    });
});
