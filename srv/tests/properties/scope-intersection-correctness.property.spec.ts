import * as fc from 'fast-check';
import { ScopeResolverService } from '../../src/casl/scope-resolver.service';
import { ScopeNormalizer } from '../../src/casl/scope-normalizer';
import { RoleEnum } from '../../src/entity/roleEnum';
import { BadRequestException } from '@nestjs/common';

/**
 * Feature: scope-model-refactoring, Property 4: Scope intersection correctness
 *
 * For any three sets of scopes (requested, client-allowed, role-permitted),
 * resolveUserScopes() shall return exactly the set intersection of all three.
 * For any two sets of scopes (requested, client-allowed), resolveClientScopes()
 * shall return exactly their intersection. When the requested scope is omitted
 * (null), the client-allowed scopes shall be used as the requested set.
 *
 * Validates: Requirements 2.1, 2.4, 5.4
 */
describe('Property 4: Scope intersection correctness', () => {
  const resolver = new ScopeResolverService();

  // Use the real OAuth scope vocabulary so role-permitted intersection is meaningful
  const oauthScopes = ['openid', 'profile', 'email', 'tenant.read', 'tenant.write'];
  const scopeSubsetArb = fc.subarray(oauthScopes, { minLength: 1 });
  const roleArb = fc.subarray(
    [RoleEnum.SUPER_ADMIN, RoleEnum.TENANT_ADMIN, RoleEnum.TENANT_VIEWER],
    { minLength: 1 },
  );

  /** Compute expected intersection of sorted, deduplicated arrays */
  function expectedIntersection(...arrays: string[][]): string[] {
    if (arrays.length === 0) return [];
    let result = new Set(arrays[0]);
    for (let i = 1; i < arrays.length; i++) {
      const other = new Set(arrays[i]);
      result = new Set([...result].filter(x => other.has(x)));
    }
    return Array.from(result).sort();
  }

  describe('resolveUserScopes — three-way intersection', () => {
    it('returns requested ∩ clientAllowed ∩ rolePermitted', () => {
      fc.assert(
        fc.property(scopeSubsetArb, scopeSubsetArb, roleArb, (requested, clientAllowed, roles) => {
          const requestedStr = ScopeNormalizer.format(requested);
          const clientAllowedStr = ScopeNormalizer.format(clientAllowed);

          // Compute role-permitted scopes the same way the service does
          const rolePermitted = new Set<string>();
          const ROLE_MAP: Record<string, string[]> = {
            [RoleEnum.SUPER_ADMIN]: ['openid', 'profile', 'email', 'tenant.read', 'tenant.write'],
            [RoleEnum.TENANT_ADMIN]: ['openid', 'profile', 'email', 'tenant.read', 'tenant.write'],
            [RoleEnum.TENANT_VIEWER]: ['openid', 'profile', 'email', 'tenant.read'],
          };
          for (const role of roles) {
            (ROLE_MAP[role] || []).forEach(s => rolePermitted.add(s));
          }

          const expected = expectedIntersection(requested, clientAllowed, Array.from(rolePermitted));

          if (expected.length === 0) {
            expect(() => resolver.resolveUserScopes(requestedStr, clientAllowedStr, roles))
              .toThrow(BadRequestException);
          } else {
            const result = resolver.resolveUserScopes(requestedStr, clientAllowedStr, roles);
            expect(result).toEqual(expected);
          }
        }),
        { numRuns: 200 },
      );
    });
  });

  describe('resolveClientScopes — two-way intersection', () => {
    it('returns requested ∩ clientAllowed', () => {
      fc.assert(
        fc.property(scopeSubsetArb, scopeSubsetArb, (requested, clientAllowed) => {
          const requestedStr = ScopeNormalizer.format(requested);
          const clientAllowedStr = ScopeNormalizer.format(clientAllowed);

          const expected = expectedIntersection(requested, clientAllowed);

          if (expected.length === 0) {
            expect(() => resolver.resolveClientScopes(requestedStr, clientAllowedStr))
              .toThrow(BadRequestException);
          } else {
            const result = resolver.resolveClientScopes(requestedStr, clientAllowedStr);
            expect(result).toEqual(expected);
          }
        }),
        { numRuns: 200 },
      );
    });
  });

  describe('null requestedScope falls back to clientAllowed', () => {
    it('resolveUserScopes with null requested uses clientAllowed as requested set', () => {
      fc.assert(
        fc.property(scopeSubsetArb, roleArb, (clientAllowed, roles) => {
          const clientAllowedStr = ScopeNormalizer.format(clientAllowed);

          const rolePermitted = new Set<string>();
          const ROLE_MAP: Record<string, string[]> = {
            [RoleEnum.SUPER_ADMIN]: ['openid', 'profile', 'email', 'tenant.read', 'tenant.write'],
            [RoleEnum.TENANT_ADMIN]: ['openid', 'profile', 'email', 'tenant.read', 'tenant.write'],
            [RoleEnum.TENANT_VIEWER]: ['openid', 'profile', 'email', 'tenant.read'],
          };
          for (const role of roles) {
            (ROLE_MAP[role] || []).forEach(s => rolePermitted.add(s));
          }

          // With null, requested = clientAllowed, so result = clientAllowed ∩ rolePermitted
          const expected = expectedIntersection(clientAllowed, Array.from(rolePermitted));

          if (expected.length === 0) {
            expect(() => resolver.resolveUserScopes(null, clientAllowedStr, roles))
              .toThrow(BadRequestException);
          } else {
            const result = resolver.resolveUserScopes(null, clientAllowedStr, roles);
            expect(result).toEqual(expected);
          }
        }),
        { numRuns: 200 },
      );
    });

    it('resolveClientScopes with null requested returns clientAllowed', () => {
      fc.assert(
        fc.property(scopeSubsetArb, (clientAllowed) => {
          const clientAllowedStr = ScopeNormalizer.format(clientAllowed);
          // With null, requested = clientAllowed, so intersection = clientAllowed ∩ clientAllowed = clientAllowed
          const expected = ScopeNormalizer.parse(clientAllowedStr);

          const result = resolver.resolveClientScopes(null, clientAllowedStr);
          expect(result).toEqual(expected);
        }),
        { numRuns: 200 },
      );
    });
  });
});
