import {createParamDecorator, ExecutionContext} from "@nestjs/common";

/**
 * Extracts the resolved tenant ID from the request.
 * Set by TenantResolutionGuard from the JWT token — no IDOR possible.
 */
export const CurrentTenantId = createParamDecorator(
    (data: unknown, ctx: ExecutionContext): string => {
        const request = ctx.switchToHttp().getRequest();
        return request["RESOLVED_TENANT_ID"];
    },
);

/**
 * Extracts the resolved user tenant ID from the request.
 * Only available for TenantToken (user-based auth), not TechnicalToken.
 */
export const CurrentUserTenantId = createParamDecorator(
    (data: unknown, ctx: ExecutionContext): string => {
        const request = ctx.switchToHttp().getRequest();
        return request["RESOLVED_USER_TENANT_ID"];
    },
);
