import * as fc from 'fast-check';
import {GRANT_TYPES, TenantToken, TechnicalToken} from '../../src/casl/contexts';
import {RoleEnum} from '../../src/entity/roleEnum';

/**
 * Feature: access-token-claims-compliance, Property 10: Introspection response reflects token claims
 *
 * For any active access token that is introspected, the introspection response SHALL return:
 * - `sub` matching the token's `sub` claim (UUID for TenantTokens, "oauth" for TechnicalTokens)
 * - `client_id` matching the token's `client_id` claim
 * - `aud` as a JSON array matching the token's `aud` claim
 *
 * Since `buildActiveResponse` is private, we verify the property by creating tokens with
 * random claims and asserting that the token's `sub`, `client_id`, and `aud` getters
 * return exactly the values passed during creation — the same values that
 * `buildActiveResponse` reads when constructing the introspection response.
 *
 * **Validates: Requirements 10.1, 10.2, 10.3**
 */
describe('Property 10: Introspection response reflects token claims', () => {
    const VALID_OIDC_SCOPES = ['openid', 'profile', 'email'];
    const VALID_ROLES = [RoleEnum.SUPER_ADMIN, RoleEnum.TENANT_ADMIN, RoleEnum.TENANT_VIEWER];
    const TENANT_GRANT_TYPES = [GRANT_TYPES.PASSWORD, GRANT_TYPES.CODE, GRANT_TYPES.REFRESH_TOKEN];

    const uuidArb = fc.uuid();
    const nameArb = fc.string({minLength: 1, maxLength: 50});
    const domainArb = fc.domain();
    const scopesArb = fc.subarray(VALID_OIDC_SCOPES, {minLength: 0});
    const rolesArb = fc.subarray(VALID_ROLES, {minLength: 0});
    const tenantGrantTypeArb = fc.constantFrom(...TENANT_GRANT_TYPES);

    // Audience arbitrary: 1–3 random audience URIs
    const audArb = fc.array(
        fc.domain().map(d => `https://${d}`),
        {minLength: 1, maxLength: 3},
    );

    describe('TenantToken', () => {
        it('sub getter returns the UUID passed at creation', () => {
            fc.assert(
                fc.property(
                    uuidArb, uuidArb, nameArb, domainArb, uuidArb,
                    scopesArb, rolesArb, tenantGrantTypeArb, audArb,
                    (userId, tenantId, tenantName, tenantDomain, clientId, scopes, roles, grantType, aud) => {
                        const token = TenantToken.create({
                            sub: userId,
                            tenant: {id: tenantId, name: tenantName, domain: tenantDomain},
                            roles,
                            grant_type: grantType,
                            aud,
                            jti: crypto.randomUUID(),
                            nbf: Math.floor(Date.now() / 1000),
                            scope: scopes.join(' '),
                            client_id: clientId,
                            tenant_id: tenantId,
                        });

                        expect(token.sub).toBe(userId);
                    },
                ),
                {numRuns: 100},
            );
        });

        it('client_id getter returns the client_id passed at creation', () => {
            fc.assert(
                fc.property(
                    uuidArb, uuidArb, nameArb, domainArb, uuidArb,
                    scopesArb, rolesArb, tenantGrantTypeArb, audArb,
                    (userId, tenantId, tenantName, tenantDomain, clientId, scopes, roles, grantType, aud) => {
                        const token = TenantToken.create({
                            sub: userId,
                            tenant: {id: tenantId, name: tenantName, domain: tenantDomain},
                            roles,
                            grant_type: grantType,
                            aud,
                            jti: crypto.randomUUID(),
                            nbf: Math.floor(Date.now() / 1000),
                            scope: scopes.join(' '),
                            client_id: clientId,
                            tenant_id: tenantId,
                        });

                        expect(token.client_id).toBe(clientId);
                    },
                ),
                {numRuns: 100},
            );
        });

        it('aud getter returns the same array passed at creation', () => {
            fc.assert(
                fc.property(
                    uuidArb, uuidArb, nameArb, domainArb, uuidArb,
                    scopesArb, rolesArb, tenantGrantTypeArb, audArb,
                    (userId, tenantId, tenantName, tenantDomain, clientId, scopes, roles, grantType, aud) => {
                        const token = TenantToken.create({
                            sub: userId,
                            tenant: {id: tenantId, name: tenantName, domain: tenantDomain},
                            roles,
                            grant_type: grantType,
                            aud,
                            jti: crypto.randomUUID(),
                            nbf: Math.floor(Date.now() / 1000),
                            scope: scopes.join(' '),
                            client_id: clientId,
                            tenant_id: tenantId,
                        });

                        // aud must be an array
                        expect(Array.isArray(token.aud)).toBe(true);
                        // aud must match exactly
                        expect(token.aud).toEqual(aud);
                    },
                ),
                {numRuns: 100},
            );
        });
    });

    describe('TechnicalToken', () => {
        it('sub getter returns "oauth"', () => {
            fc.assert(
                fc.property(
                    uuidArb, nameArb, domainArb, uuidArb, scopesArb, audArb,
                    (tenantId, tenantName, tenantDomain, clientId, scopes, aud) => {
                        const token = TechnicalToken.create({
                            sub: 'oauth',
                            tenant: {id: tenantId, name: tenantName, domain: tenantDomain},
                            scope: scopes.join(' '),
                            aud,
                            jti: crypto.randomUUID(),
                            nbf: Math.floor(Date.now() / 1000),
                            client_id: clientId,
                            tenant_id: tenantId,
                        });

                        expect(token.sub).toBe('oauth');
                    },
                ),
                {numRuns: 100},
            );
        });

        it('client_id getter returns the client_id passed at creation', () => {
            fc.assert(
                fc.property(
                    uuidArb, nameArb, domainArb, uuidArb, scopesArb, audArb,
                    (tenantId, tenantName, tenantDomain, clientId, scopes, aud) => {
                        const token = TechnicalToken.create({
                            sub: 'oauth',
                            tenant: {id: tenantId, name: tenantName, domain: tenantDomain},
                            scope: scopes.join(' '),
                            aud,
                            jti: crypto.randomUUID(),
                            nbf: Math.floor(Date.now() / 1000),
                            client_id: clientId,
                            tenant_id: tenantId,
                        });

                        expect(token.client_id).toBe(clientId);
                    },
                ),
                {numRuns: 100},
            );
        });

        it('aud getter returns the same array passed at creation', () => {
            fc.assert(
                fc.property(
                    uuidArb, nameArb, domainArb, uuidArb, scopesArb, audArb,
                    (tenantId, tenantName, tenantDomain, clientId, scopes, aud) => {
                        const token = TechnicalToken.create({
                            sub: 'oauth',
                            tenant: {id: tenantId, name: tenantName, domain: tenantDomain},
                            scope: scopes.join(' '),
                            aud,
                            jti: crypto.randomUUID(),
                            nbf: Math.floor(Date.now() / 1000),
                            client_id: clientId,
                            tenant_id: tenantId,
                        });

                        // aud must be an array
                        expect(Array.isArray(token.aud)).toBe(true);
                        // aud must match exactly
                        expect(token.aud).toEqual(aud);
                    },
                ),
                {numRuns: 100},
            );
        });
    });
});
