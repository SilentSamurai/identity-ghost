import {CanActivate, ExecutionContext, Injectable} from "@nestjs/common";
import {TechnicalToken, TenantToken, Token} from "../casl/contexts";

/**
 * Derives the tenant from the JWT token and sets RESOLVED_TENANT_ID on the request.
 * Must run after JwtAuthGuard so that SECURITY_CONTEXT is already populated.
 *
 * For TenantToken: sets both RESOLVED_TENANT_ID (the app tenant) and RESOLVED_USER_TENANT_ID (the user's own tenant).
 * For TechnicalToken: sets RESOLVED_TENANT_ID only.
 * For unauthenticated or internal requests: passes through (lets JwtAuthGuard handle auth).
 */
@Injectable()
export class TenantResolutionGuard implements CanActivate {
    canActivate(context: ExecutionContext): boolean {
        const request = context.switchToHttp().getRequest();
        const securityContext = request["SECURITY_CONTEXT"] as Token;

        if (!securityContext) return true; // Let JwtAuthGuard handle this

        if (securityContext.isTenantToken()) {
            const token = securityContext as TenantToken;
            request["RESOLVED_TENANT_ID"] = token.tenant.id;
            request["RESOLVED_USER_TENANT_ID"] = token.userTenant?.id;
        } else if (securityContext.isTechnicalToken()) {
            const token = securityContext as TechnicalToken;
            request["RESOLVED_TENANT_ID"] = token.tenant.id;
        }

        return true;
    }
}
