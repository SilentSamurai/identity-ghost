import {BadRequestException, Injectable} from '@nestjs/common';
import {ScopeNormalizer} from './scope-normalizer';

@Injectable()
export class ScopeResolverService {
    /**
     * Compute granted OIDC scopes.
     * Returns the intersection of: requested ∩ clientAllowed.
     * If requestedScope is null, uses clientAllowed as the full set.
     * Throws BadRequestException with invalid_scope if result is empty.
     */
    resolveScopes(
        requestedScope: string | null,
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
