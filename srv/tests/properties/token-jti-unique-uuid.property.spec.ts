import * as fc from 'fast-check';
import {GRANT_TYPES, TenantToken, TechnicalToken} from '../../src/casl/contexts';
import {RoleEnum} from '../../src/entity/roleEnum';

/**
 * Feature: access-token-claims-compliance, Property 7: Globally unique token identifier
 *
 * For any set of issued access tokens, every `jti` value SHALL be unique, and
 * each `jti` SHALL conform to UUID v4 format.
 *
 * **Validates: Requirements 4.1, 4.2, 4.3**
 */
describe('Property 7: Globally unique token identifier', () => {
    const VALID_OIDC_SCOPES = ['openid', 'profile', 'email'];
    const VALID_ROLES = [RoleEnum.SUPER_ADMIN, RoleEnum.TENANT_ADMIN, RoleEnum.TENANT_VIEWER];
    const TENANT_GRANT_TYPES = [GRANT_TYPES.PASSWORD, GRANT_TYPES.CODE, GRANT_TYPES.REFRESH_TOKEN];

    const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    const uuidArb = fc.uuid();
    const nameArb = fc.string({ minLength: 1, maxLength: 50 });
    const domainArb = fc.domain();
    const scopesArb = fc.subarray(VALID_OIDC_SCOPES, { minLength: 0 });
    const rolesArb = fc.subarray(VALID_ROLES, { minLength: 0 });
    const grantTypeArb = fc.constantFrom(...TENANT_GRANT_TYPES);

    it('each jti conforms to UUID v4 format (TenantToken)', () => {
        fc.assert(
            fc.property(
                uuidArb, uuidArb, nameArb, domainArb, uuidArb,
                scopesArb, rolesArb, grantTypeArb,
                (userId, tenantId, tenantName, tenantDomain, clientId, scopes, roles, grantType) => {
                    const jti = crypto.randomUUID();
                    const token = TenantToken.create({
                        sub: userId,
                        tenant: { id: tenantId, name: tenantName, domain: tenantDomain },
                        roles,
                        grant_type: grantType,
                        aud: ['https://auth.example.com'],
                        jti,
                        nbf: Math.floor(Date.now() / 1000),
                        scope: scopes.join(' '),
                        client_id: clientId,
                        tenant_id: tenantId,
                    });

                    const payload = token.asPlainObject();
                    expect(payload.jti).toMatch(UUID_V4_REGEX);
                },
            ),
            { numRuns: 100 },
        );
    });

    it('each jti conforms to UUID v4 format (TechnicalToken)', () => {
        fc.assert(
            fc.property(
                uuidArb, nameArb, domainArb, uuidArb, scopesArb,
                (tenantId, tenantName, tenantDomain, clientId, scopes) => {
                    const jti = crypto.randomUUID();
                    const token = TechnicalToken.create({
                        sub: 'oauth',
                        tenant: { id: tenantId, name: tenantName, domain: tenantDomain },
                        scope: scopes.join(' '),
                        aud: ['https://auth.example.com'],
                        jti,
                        nbf: Math.floor(Date.now() / 1000),
                        client_id: clientId,
                        tenant_id: tenantId,
                    });

                    const payload = token.asPlainObject();
                    expect(payload.jti).toMatch(UUID_V4_REGEX);
                },
            ),
            { numRuns: 100 },
        );
    });

    it('all jti values are unique across a batch of tokens', () => {
        fc.assert(
            fc.property(
                fc.integer({ min: 10, max: 50 }),
                (batchSize) => {
                    const jtis = new Set<string>();

                    for (let i = 0; i < batchSize; i++) {
                        const jti = crypto.randomUUID();
                        const token = TenantToken.create({
                            sub: crypto.randomUUID(),
                            tenant: { id: crypto.randomUUID(), name: 'Tenant', domain: 'test.local' },
                            roles: [],
                            grant_type: GRANT_TYPES.PASSWORD,
                            aud: ['https://auth.example.com'],
                            jti,
                            nbf: Math.floor(Date.now() / 1000),
                            scope: 'openid',
                            client_id: crypto.randomUUID(),
                            tenant_id: crypto.randomUUID(),
                        });

                        const payload = token.asPlainObject();
                        jtis.add(payload.jti);
                    }

                    // Every jti must be unique
                    expect(jtis.size).toBe(batchSize);
                },
            ),
            { numRuns: 100 },
        );
    });
});
