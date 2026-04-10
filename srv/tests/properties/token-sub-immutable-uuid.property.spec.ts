import * as fc from 'fast-check';
import {GRANT_TYPES, TenantToken} from '../../src/casl/contexts';
import {RoleEnum} from '../../src/entity/roleEnum';

/**
 * Feature: access-token-claims-compliance, Property 5: Immutable subject identifier
 *
 * For any TenantToken access token issued for any user, the `sub` claim SHALL
 * equal the user's immutable UUID and SHALL NOT be an email address.
 *
 * **Validates: Requirements 2.1, 2.3**
 */
describe('Property 5: Immutable subject identifier', () => {
    const VALID_OIDC_SCOPES = ['openid', 'profile', 'email'];
    const VALID_ROLES = [RoleEnum.SUPER_ADMIN, RoleEnum.TENANT_ADMIN, RoleEnum.TENANT_VIEWER];
    const TENANT_GRANT_TYPES = [GRANT_TYPES.PASSWORD, GRANT_TYPES.CODE, GRANT_TYPES.REFRESH_TOKEN];

    const uuidArb = fc.uuid();
    const nameArb = fc.string({ minLength: 1, maxLength: 50 });
    const domainArb = fc.domain();
    const scopesArb = fc.subarray(VALID_OIDC_SCOPES, { minLength: 0 });
    const rolesArb = fc.subarray(VALID_ROLES, { minLength: 0 });
    const grantTypeArb = fc.constantFrom(...TENANT_GRANT_TYPES);

    // RFC 5322 email pattern — simple check for @ sign
    const EMAIL_REGEX = /@/;
    // UUID v4 pattern
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    it('sub equals the user UUID passed at creation', () => {
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

                    // sub must equal the user UUID we passed in
                    expect(payload.sub).toBe(userId);
                },
            ),
            { numRuns: 100 },
        );
    });

    it('sub is a valid UUID, not an email address', () => {
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

                    // sub must match UUID format
                    expect(payload.sub).toMatch(UUID_REGEX);
                    // sub must NOT be an email address
                    expect(payload.sub).not.toMatch(EMAIL_REGEX);
                },
            ),
            { numRuns: 100 },
        );
    });
});
