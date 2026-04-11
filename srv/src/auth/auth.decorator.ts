import {createParamDecorator, ExecutionContext, ForbiddenException, Inject, Injectable, PipeTransform, forwardRef} from "@nestjs/common";
import {AuthContext, TenantToken, Token} from "../casl/contexts";
import {AuthUserService} from "../casl/authUser.service";
import {SecurityService} from "../casl/security.service";
import {Action} from "../casl/actions.enum";
import {subject} from "@casl/ability";
import {User} from "../entity/user.entity";

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

/**
 * Extracts the full Token (security context) from the request.
 * Set by JwtAuthGuard. Returns the Token interface which can be
 * narrowed via isTenantToken() / isTechnicalToken().
 */
export const CurrentToken = createParamDecorator(
    (data: unknown, ctx: ExecutionContext): Token => {
        const request = ctx.switchToHttp().getRequest();
        return request["SECURITY_CONTEXT"];
    },
);

/**
 * Pipe that resolves a user ID (sub) to a full User entity from the database.
 */
@Injectable()
export class ResolveUserPipe implements PipeTransform<string, Promise<User>> {
    constructor(private readonly authUserService: AuthUserService) {}

    async transform(userId: string): Promise<User> {
        return this.authUserService.findUserById(userId);
    }
}

/**
 * Extracts the authenticated user's ID (sub) from the TenantToken.
 * Pair with ResolveUserPipe to get the full User entity:
 *   @CurrentUser() user: User
 */
const CurrentUserSub = createParamDecorator(
    (data: unknown, ctx: ExecutionContext): string => {
        const request = ctx.switchToHttp().getRequest();
        const token = request["SECURITY_CONTEXT"];
        if (!token || !token.isTenantToken()) {
            throw new ForbiddenException("This endpoint requires user authentication");
        }
        return (token as TenantToken).sub;
    },
);

/**
 * Parameter decorator that resolves the authenticated user from the database.
 * Extracts sub from the JWT, then loads the User entity via AuthUserService.
 * Throws ForbiddenException if the caller is a TechnicalToken.
 *
 * Usage: @CurrentUser() user: User
 */
export const CurrentUser = () => CurrentUserSub(undefined, ResolveUserPipe);


/**
 * Wraps AuthContext with a convenience method for authorization checks.
 * Delegates to SecurityService.isAuthorized() under the hood.
 */
export class Permission {
    constructor(
        /** @deprecated Use Permission methods directly instead of accessing authContext. Pass `permission.authContext` to services only when required by existing service signatures. */
        readonly authContext: AuthContext,
        private readonly securityService: SecurityService,
    ) {}

    /**
     * Check if the current user is authorized to perform the given action on the subject.
     * Throws ForbiddenException if not authorized.
     */
    isAuthorized(action: Action, subjectType: string, obj: any = null): boolean {
        return this.securityService.isAuthorized(this.authContext, action, subjectType, obj);
    }
}

/**
 * Extracts the AuthContext from the request (SECURITY_CONTEXT + SCOPE_ABILITIES).
 */
const CurrentAuthContext = createParamDecorator(
    (data: unknown, ctx: ExecutionContext): AuthContext => {
        const request = ctx.switchToHttp().getRequest();
        return {
            SECURITY_CONTEXT: request["SECURITY_CONTEXT"],
            SCOPE_ABILITIES: request["SCOPE_ABILITIES"],
        } as AuthContext;
    },
);

/**
 * Pipe that wraps an AuthContext into a Permission object with SecurityService access.
 */
@Injectable()
export class ResolvePermissionPipe implements PipeTransform<AuthContext, Permission> {
    constructor(@Inject(forwardRef(() => SecurityService)) private readonly securityService: SecurityService) {}

    transform(authContext: AuthContext): Permission {
        return new Permission(authContext, this.securityService);
    }
}

/**
 * Parameter decorator that provides a Permission object for authorization checks.
 * Extracts AuthContext from the request and wraps it with SecurityService.
 *
 * Usage:
 *   @CurrentPermission() permission: Permission
 *   permission.isAuthorized(Action.Read, SubjectEnum.USER);
 *   // Pass permission.authContext to services that need AuthContext
 */
export const CurrentPermission = () => CurrentAuthContext(undefined, ResolvePermissionPipe);
