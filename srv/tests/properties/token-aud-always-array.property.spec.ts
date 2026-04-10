import * as fc from 'fast-check';
import {GRANT_TYPES, TenantToken, TechnicalToken} from '../../src/casl/contexts';
import {RoleEnum} from '../../src/entity/roleEnum';

/**
 * Feature: access-token-claims-compliance, Property 6: Audience is always an array
 *
 * For any issued access token, the `aud` claim SHALL be a JSON array and
 * SHALL NOT be a bare string.
 *
 * **Validates: Requirements 3.1, 3.2**
 */
describe('Property 6: Audience is always an array', () => {
    const VALID_OIDC_SCOPES = ['openid', 'profile', 'email'];
    const VALID_ROLES = [RoleEnum.SUPER_ADMIN, RoleEnum.TENANT_ADMIN, RoleEnum.TENANT_VIEWER];
    const TENANT_GRANT_TYPES = [GRANT_TYPES.PASSWORD, GRANT_TYPES.CODE, GRANT_TYPES.REFRESH_TOKEN];

    const uuidArb = fc.uuid();
    const nameArb = fc.string({ minLength: 1, maxLength: 50 });
    const domainArb = fc.domain();
    const scopesArb = fc.subarray(VALID_OIDC_SCOPES, { minLength: 0 });
    const rolesArb = fc.subarray(VALID_ROLES, { minLength: 0 });
    const grantTypeArb = fc.constantFrom(...TENANT_GRANT_TYPES);

    // Generate random audience arrays (1-3 audience values)
    const audArb = fc.array(fc.webUrl(), { minLength: 1, maxLength: 3 });

    describe('TenantToken', () => {
        it('aud is always an array in the payload', () => {
            fc.assert(
                fc.property(
                    uuidArb, uuidArb, nameArb, domainArb, uuidArb,
                    scopesArb, rolesArb, grantTypeArb, audArb,
                    (userId, tenantId, tenantName, tenantDomain, clientId, scopes, roles, grantType, aud) => {
                        const token = TenantToken.create({
                            sub: userId,
                            tenant: { id: tenantId, name: tenantName, domain: tenantDomain },
                            roles,
                            grant_type: grantType,
                            aud,
                            jti: crypto.randomUUID(),
                            nbf: Math.floor(Date.now() / 1000),
                            scope: scopes.join(' '),
                            client_id: clientId,
                            tenant_id: tenantId,
                        });

                        const payload = token.asPlainObject();

                        expect(Array.isArray(payload.aud)).toBe(true);
                        expect(typeof payload.aud).not.toBe('string');
                    },
                ),
                { numRuns: 100 },
            );
        });
    });

    describe('TechnicalToken', () => {
        it('aud is always an array in the payload', () => {
            fc.assert(
                fc.property(
                    uuidArb, nameArb, domainArb, uuidArb, scopesArb, audArb,
                    (tenantId, tenantName, tenantDomain, clientId, scopes, aud) => {
                        const token = TechnicalToken.create({
                            sub: 'oauth',
                            tenant: { id: tenantId, name: tenantName, domain: tenantDomain },
                            scope: scopes.join(' '),
                            aud,
                            jti: crypto.randomUUID(),
                            nbf: Math.floor(Date.now() / 1000),
                            client_id: clientId,
                            tenant_id: tenantId,
                        });

                        const payload = token.asPlainObject();

                        expect(Array.isArray(payload.aud)).toBe(true);
                        expect(typeof payload.aud).not.toBe('string');
                    },
                ),
                { numRuns: 100 },
            );
        });
    });
});
