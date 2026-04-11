import { Injectable } from '@nestjs/common';
import { User } from '../entity/user.entity';
import { SCOPE_CLAIMS_MAP, USER_CLAIM_RESOLVERS } from './scope-claims-map';

export interface ResolvedClaims {
  sub: string;
  [key: string]: unknown;
}

@Injectable()
export class ClaimsResolverService {
  /**
   * Resolve identity claims for the given granted scopes and user.
   *
   * 1. Iterates each granted scope present in SCOPE_CLAIMS_MAP
   * 2. For each authorized claim key, calls the resolver to extract the value
   * 3. Omits claims where the resolver returns undefined (voluntary claims)
   * 4. Returns the final claim set — always includes `sub`
   *
   * @param grantedScopes - Array of granted OIDC scope strings
   * @param user - User data (id, email, name, verified)
   * @returns Resolved claims object
   */
  resolveClaims(
    grantedScopes: string[],
    user: Pick<User, 'id' | 'email' | 'name' | 'verified'>,
  ): ResolvedClaims {
    const claims: Record<string, unknown> = {};

    for (const scope of grantedScopes) {
      const claimKeys = SCOPE_CLAIMS_MAP[scope];
      if (!claimKeys) continue;

      for (const key of claimKeys) {
        const resolver = USER_CLAIM_RESOLVERS[key];
        if (!resolver) continue;

        const value = resolver(user);
        if (value !== undefined) {
          claims[key] = value;
        }
      }
    }

    // sub is always present when openid is granted (enforced by caller),
    // but we ensure it here as a safety net
    if (!claims.sub) {
      claims.sub = user.id;
    }

    return claims as ResolvedClaims;
  }
}
