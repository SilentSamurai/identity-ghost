import {CanActivate, ExecutionContext, ForbiddenException, Injectable} from "@nestjs/common";
import {SecurityService} from "../casl/security.service";
import {TenantToken, Token} from "../casl/contexts";

/**
 * Restricts access to super-admin users only.
 * Used on admin routes that accept explicit :tenantId params for cross-tenant operations.
 * Must run after JwtAuthGuard.
 */
@Injectable()
export class SuperAdminGuard implements CanActivate {
    constructor(private readonly securityService: SecurityService) {
    }

    canActivate(context: ExecutionContext): boolean {
        const request = context.switchToHttp().getRequest();
        const securityContext = request["SECURITY_CONTEXT"] as Token;

        if (!securityContext || !securityContext.isTenantToken()) {
            throw new ForbiddenException("Super admin access required");
        }

        const token = securityContext as TenantToken;
        if (!this.securityService.isSuperAdmin(token)) {
            throw new ForbiddenException("Super admin access required");
        }

        return true;
    }
}
