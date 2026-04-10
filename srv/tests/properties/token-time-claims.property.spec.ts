import * as fc from 'fast-check';
import {GRANT_TYPES, TenantToken, TechnicalToken} from '../../src/casl/contexts';
import {RoleEnum} from '../../src/entity/roleEnum';

/**
 * Feature: access-token-claims-compliance, Property 2: Time claims consistency
 *
 * For any issued access token, `nbf` SHALL be an integer Unix timestamp
 * (seconds since epoch).
 *
 * Note: `iat` and `exp` are set by the signing layer (JwtSignOptions), not by
 * asPlainObject(). This test verifies only `nbf` which is set by the payload builder.
 *
 * **Validates: Requirements 1.3, 1.4, 1.5**
 */
describe('Property 2: Time claims consistency', () => {
    const VALID_OIDC_SCOPES = ['openid', 'profile', 'email'];
    const VALID_ROLES = [RoleEnum.SUPER_ADMIN, RoleEnum.TENANT_ADMIN, RoleEnum.TENANT_VIEWER];
    const TENANT_GRANT_TYPES = [GRANT_TYPES.PASSWORD, GRANT_TYPES.CODE, GRANT_TYPES.REFRESH_TOKEN];

    const uuidArb = fc.uuid();
    const nameArb = fc.string({ minLength: 1, maxLength: 50 });
    const domainArb = fc.domain();
    const scopesArb = fc.subarray(VALID_OIDC_SCOPES, { minLength: 0 });
    const rolesArb = fc.subarray(VALID_ROLES, { minLength: 0 });
    const grantTypeArb = fc.constantFrom(...TENANT_GRANT_TYPES);

    // Reasonable Unix timestamp range: 2020-01-01 to 2040-01-01
    const MIN_TIMESTAMP = 1577836800;
    const MAX_TIMESTAMP = 2208988800;
    const nbfArb = fc.integer({ min: MIN_TIMESTAMP, max: MAX_TIMESTAMP });

    describe('TenantToken', () => {
        it('nbf in asPlainObject() is a number and a reasonable Unix timestamp', () => {
            fc.assert(
                fc.property(
                    uuidArb, uuidArb, nameArb, domainArb, uuidArb,
                    scopesArb, rolesArb, grantTypeArb, nbfArb,
                    (userId, tenantId, tenantName, tenantDomain, clientId, scopes, roles, grantType, nbf) => {
                        const token = TenantToken.create({
                            sub: userId,
                            tenant: { id: tenantId, name: tenantName, domain: tenantDomain },
                            roles,
                            grant_type: grantType,
                            aud: ['https://auth.example.com'],
                            jti: crypto.randomUUID(),
                            nbf,
                            scope: scopes.join(' '),
                            client_id: clientId,
                            tenant_id: tenantId,
                        });

                        const payload = token.asPlainObject();

                        // nbf must be a number
                        expect(typeof payload.nbf).toBe('number');
                        // nbf must be an integer (Unix timestamp in seconds)
                        expect(Number.isInteger(payload.nbf)).toBe(true);
                        // nbf must be a reasonable Unix timestamp
                        expect(payload.nbf).toBeGreaterThanOrEqual(MIN_TIMESTAMP);
                        expect(payload.nbf).toBeLessThanOrEqual(MAX_TIMESTAMP);
                        // nbf must match the value passed at creation
                        expect(payload.nbf).toBe(nbf);
                    },
                ),
                { numRuns: 100 },
            );
        });
    });

    describe('TechnicalToken', () => {
        it('nbf in asPlainObject() is a number and a reasonable Unix timestamp', () => {
            fc.assert(
                fc.property(
                    uuidArb, nameArb, domainArb, uuidArb, scopesArb, nbfArb,
                    (tenantId, tenantName, tenantDomain, clientId, scopes, nbf) => {
                        const token = TechnicalToken.create({
                            sub: 'oauth',
                            tenant: { id: tenantId, name: tenantName, domain: tenantDomain },
                            scope: scopes.join(' '),
                            aud: ['https://auth.example.com'],
                            jti: crypto.randomUUID(),
                            nbf,
                            client_id: clientId,
                            tenant_id: tenantId,
                        });

                        const payload = token.asPlainObject();

                        // nbf must be a number
                        expect(typeof payload.nbf).toBe('number');
                        // nbf must be an integer (Unix timestamp in seconds)
                        expect(Number.isInteger(payload.nbf)).toBe(true);
                        // nbf must be a reasonable Unix timestamp
                        expect(payload.nbf).toBeGreaterThanOrEqual(MIN_TIMESTAMP);
                        expect(payload.nbf).toBeLessThanOrEqual(MAX_TIMESTAMP);
                        // nbf must match the value passed at creation
                        expect(payload.nbf).toBe(nbf);
                    },
                ),
                { numRuns: 100 },
            );
        });
    });
});
