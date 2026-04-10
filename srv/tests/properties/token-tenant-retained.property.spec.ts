import * as fc from 'fast-check';
import {GRANT_TYPES, TenantToken, TechnicalToken} from '../../src/casl/contexts';
import {RoleEnum} from '../../src/entity/roleEnum';

/**
 * Feature: access-token-claims-compliance, Property 9: Tenant object retained
 *
 * For any issued access token, the payload SHALL contain a `tenant` object with
 * `id` (valid UUID), `name` (non-empty string), and `domain` (non-empty string).
 *
 * **Validates: Requirements 5.5**
 */
describe('Property 9: Tenant object retained', () => {
    const VALID_OIDC_SCOPES = ['openid', 'profile', 'email'];
    const VALID_ROLES = [RoleEnum.SUPER_ADMIN, RoleEnum.TENANT_ADMIN, RoleEnum.TENANT_VIEWER];
    const TENANT_GRANT_TYPES = [GRANT_TYPES.PASSWORD, GRANT_TYPES.CODE, GRANT_TYPES.REFRESH_TOKEN];

    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    const uuidArb = fc.uuid();
    const nameArb = fc.string({ minLength: 1, maxLength: 50 });
    const domainArb = fc.domain();
    const scopesArb = fc.subarray(VALID_OIDC_SCOPES, { minLength: 0 });
    const rolesArb = fc.subarray(VALID_ROLES, { minLength: 0 });
    const grantTypeArb = fc.constantFrom(...TENANT_GRANT_TYPES);

    describe('TenantToken', () => {
        it('asPlainObject() contains tenant with id (UUID), name (non-empty), and domain (non-empty)', () => {
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

                        // tenant must be present
                        expect(payload).toHaveProperty('tenant');
                        expect(typeof payload.tenant).toBe('object');
                        expect(payload.tenant).not.toBeNull();

                        // tenant.id must be a valid UUID
                        expect(payload.tenant.id).toMatch(UUID_REGEX);

                        // tenant.name must be a non-empty string
                        expect(typeof payload.tenant.name).toBe('string');
                        expect(payload.tenant.name.length).toBeGreaterThan(0);

                        // tenant.domain must be a non-empty string
                        expect(typeof payload.tenant.domain).toBe('string');
                        expect(payload.tenant.domain.length).toBeGreaterThan(0);

                        // Values must match what was passed at creation
                        expect(payload.tenant.id).toBe(tenantId);
                        expect(payload.tenant.name).toBe(tenantName);
                        expect(payload.tenant.domain).toBe(tenantDomain);
                    },
                ),
                { numRuns: 100 },
            );
        });
    });

    describe('TechnicalToken', () => {
        it('asPlainObject() contains tenant with id (UUID), name (non-empty), and domain (non-empty)', () => {
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

                        // tenant must be present
                        expect(payload).toHaveProperty('tenant');
                        expect(typeof payload.tenant).toBe('object');
                        expect(payload.tenant).not.toBeNull();

                        // tenant.id must be a valid UUID
                        expect(payload.tenant.id).toMatch(UUID_REGEX);

                        // tenant.name must be a non-empty string
                        expect(typeof payload.tenant.name).toBe('string');
                        expect(payload.tenant.name.length).toBeGreaterThan(0);

                        // tenant.domain must be a non-empty string
                        expect(typeof payload.tenant.domain).toBe('string');
                        expect(payload.tenant.domain.length).toBeGreaterThan(0);

                        // Values must match what was passed at creation
                        expect(payload.tenant.id).toBe(tenantId);
                        expect(payload.tenant.name).toBe(tenantName);
                        expect(payload.tenant.domain).toBe(tenantDomain);
                    },
                ),
                { numRuns: 100 },
            );
        });
    });
});
