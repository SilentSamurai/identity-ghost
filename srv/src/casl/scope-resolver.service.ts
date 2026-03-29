import { BadRequestException, Injectable } from '@nestjs/common';
import { ScopeNormalizer } from './scope-normalizer';
import { getPermittedScopes } from './role-scope-map';

@Injectable()
export class ScopeResolverService {
  /**
   * Compute granted scopes for a user token request.
   * Returns the intersection of: requested ∩ clientAllowed ∩ rolePermitted.
   * If requestedScope is null/undefined, uses clientAllowed as the requested set.
   * Throws BadRequestException with invalid_scope if result is empty.
   */
  resolveUserScopes(
    requestedScope: string | null | undefined,
    clientAllowedScopes: string,
    roleNames: string[],
  ): string[] {
    const clientAllowed = ScopeNormalizer.parse(clientAllowedScopes);
    const rolePermitted = getPermittedScopes(roleNames);
    const requested = requestedScope != null
      ? ScopeNormalizer.parse(requestedScope)
      : clientAllowed;

    const result = ScopeNormalizer.intersect(
      ScopeNormalizer.intersect(requested, clientAllowed),
      rolePermitted,
    );

    if (result.length === 0) {
      throw new BadRequestException({
        error: 'invalid_scope',
        error_description: 'The requested scope is not valid or not permitted',
      });
    }

    return result;
  }

  /**
   * Compute granted scopes for a client_credentials request.
   * Returns the intersection of: requested ∩ clientAllowed.
   * If requestedScope is null/undefined, uses clientAllowed as the requested set.
   * Throws BadRequestException with invalid_scope if result is empty.
   */
  resolveClientScopes(
    requestedScope: string | null | undefined,
    clientAllowedScopes: string,
  ): string[] {
    const clientAllowed = ScopeNormalizer.parse(clientAllowedScopes);
    const requested = requestedScope != null
      ? ScopeNormalizer.parse(requestedScope)
      : clientAllowed;

    const result = ScopeNormalizer.intersect(requested, clientAllowed);

    if (result.length === 0) {
      throw new BadRequestException({
        error: 'invalid_scope',
        error_description: 'The requested scope is not valid or not permitted',
      });
    }

    return result;
  }
}
