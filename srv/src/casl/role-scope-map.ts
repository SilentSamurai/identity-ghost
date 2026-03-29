
import { RoleEnum } from '../entity/roleEnum';
import { ScopeNormalizer } from './scope-normalizer';

export const ROLE_SCOPE_MAP: Record<RoleEnum, string[]> = {
  [RoleEnum.SUPER_ADMIN]: ['openid', 'profile', 'email', 'tenant.read', 'tenant.write'],
  [RoleEnum.TENANT_ADMIN]: ['openid', 'profile', 'email', 'tenant.read', 'tenant.write'],
  [RoleEnum.TENANT_VIEWER]: ['openid', 'profile', 'email', 'tenant.read'],
};

/** Compute the union of permitted scopes for a set of role names.
 *  Any tenant member is implicitly a viewer, so fall back to TENANT_VIEWER scopes
 *  when no recognised roles are provided. */
export function getPermittedScopes(roleNames: string[]): string[] {
  const allScopes = new Set<string>();
  for (const roleName of roleNames) {
    const scopes = ROLE_SCOPE_MAP[roleName as RoleEnum];
    if (scopes) {
      scopes.forEach(s => allScopes.add(s));
    }
  }
  // Every member is at least a viewer
  if (allScopes.size === 0) {
    ROLE_SCOPE_MAP[RoleEnum.TENANT_VIEWER].forEach(s => allScopes.add(s));
  }
  return Array.from(allScopes).sort();
}
