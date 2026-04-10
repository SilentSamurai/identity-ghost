import * as fc from 'fast-check';
import {GRANT_TYPES, TenantToken, TechnicalToken} from '../../src/casl/contexts';
import {RoleEnum} from '../../src/entity/roleEnum';

/**
 * Feature: access-token-claims-compliance, Property 1: All required claims present
 *
 * For any valid token issuance (any grant type, any user, any tenant, any scope
 * combination), the decoded JWT payload SHALL contain all of: `iss`, `sub`, `aud`,
 * `exp`, `iat`, `nbf`, `jti`, `scope`, `client_id`, `tenant_id`, `grant_type`.
 *
 * Note: `iss`, `exp`, `iat` are set by the signing layer (JwtSignOptions), not by
 * asPlainObject(). This test verifies the payload builder emits all claims that it
 * is responsible for: `sub`, `aud`, `nbf`, `jti`, `scope`, `client_id`, `tenant_id`,
 * `grant_type`. The signing layer adds `iss`, `iat`, `exp`.
 *
 * **Validates: Requirements 1.1**
 */
describe('Property 1: All required claims present', () => {
    const VALID_OIDC_SCOPES = ['openid', 'profile', 'email'];
    const VALID_ROLES = [RoleEnum.SUPER_ADMIN, RoleEnum.TENANT_ADMIN, RoleEnum.TENANT_VIEWER];
    const TENANT_GRANT_TYPES = [GRANT_TYPES.PASSWORD, GRANT_TYPES.CODE, GRANT_TYPES.REFRESH_TOKEN];

    const uuidArb = fc.uuid();
    const emailArb = fc.emailAddress();
    const nameArb = fc.string({ minLength: 1, maxLength: 50 });
    const domainArb = fc.domain();
    const scopesArb = fc.subarray(VALID_OIDC_SCOPES, { minLength: 0 });
    const rolesArb = fc.subarray(VALID_ROLES, { minLength: 0 });
    const tenantGrantTypeArb = fc.constantFrom(...TENANT_GRANT_TYPES);

    // Claims the payload builder is responsible for
    const PAYLOAD_BUILDER_CLAIMS = [
        'sub', 'aud', 'nbf', 'jti', 'scope', 'client_id', 'tenant_id', 'grant_type',
    ];

    describe('TenantToken', () => {
        it('asPlainObject() contains all payload-builder claims for any input', () => {
            fc.assert(
                fc.property(
                    uuidArb, uuidArb, nameArb, domainArb, uuidArb,
                    scopesArb, rolesArb, tenantGrantTypeArb,
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
                        for (const claim of PAYLOAD_BUILDER_CLAIMS) {
                            expect(payload).toHaveProperty(claim);
                        }
                    },
                ),
                { numRuns: 100 },
            );
        });
    });

    describe('TechnicalToken', () => {
        it('asPlainObject() contains all payload-builder claims for any input', () => {
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
                        for (const claim of PAYLOAD_BUILDER_CLAIMS) {
                            expect(payload).toHaveProperty(claim);
                        }
                    },
                ),
                { numRuns: 100 },
            );
        });
    });
});
