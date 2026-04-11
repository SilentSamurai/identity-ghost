import { User } from '../entity/user.entity';

/**
 * OIDC scope-to-claims mapping per OIDC Core §5.4.
 *
 * Each key is an OIDC scope value. Each value is the array of claim keys
 * that scope authorizes. The `openid` scope authorizes `sub` (the only
 * mandatory identity claim). Other scopes add voluntary identity claims.
 *
 * This map is the single source of truth for claim inclusion in both
 * ID Tokens and UserInfo responses.
 *
 * To add a new claim when the User entity is extended:
 *   1. Add the claim key to the appropriate scope's array
 *   2. Add the claim resolver in USER_CLAIM_RESOLVERS
 *   No changes to IdTokenService or UserInfoController are needed.
 */
export const SCOPE_CLAIMS_MAP: Readonly<Record<string, readonly string[]>> = {
  openid: ['sub'],
  profile: ['name'],
  email: ['email', 'email_verified'],
} as const;

export type ClaimResolver = (user: Pick<User, 'id' | 'email' | 'name' | 'verified'>) => unknown;

/**
 * Maps each claim key to a function that extracts its value from the user.
 * Returns undefined when the user has no data for the claim (voluntary omission).
 */
export const USER_CLAIM_RESOLVERS: Readonly<Record<string, ClaimResolver>> = {
  sub: (user) => user.id,
  name: (user) => user.name || undefined,
  email: (user) => user.email || undefined,
  email_verified: (user) => (user.email ? user.verified : undefined),
} as const;
