/**
 * JwtAuthGuard - Authentication guard that validates JWT and Basic auth tokens.
 * 
 * This guard implements RFC 6750 Bearer Token usage for protected resources:
 * - Validates Bearer tokens (JWT) from Authorization header
 * - Validates Basic auth credentials for client authentication
 * - Sets up security context with CASL abilities for authorization
 * - Adds WWW-Authenticate headers for 401 responses per RFC 6750
 * 
 * The guard extracts tokens, validates them via AuthService, and builds
 * the CASL ability context for authorization decisions.
 */
import {CanActivate, ExecutionContext, Injectable, Logger, UnauthorizedException,} from "@nestjs/common";
import {ExtractJwt} from "passport-jwt";
import {AuthService} from "./auth.service";
import {CaslAbilityFactory} from "../casl/casl-ability.factory";
import {GRANT_TYPES, TechnicalToken, TenantToken, Token} from "../casl/contexts";
import {Response} from "express";

@Injectable()
export class JwtAuthGuard implements CanActivate {
    private static readonly LOGGER = new Logger("JwtAuthGuard");

    constructor(
        private readonly authService: AuthService,
        private readonly caslAbilityFactory: CaslAbilityFactory,
    ) {
    }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest();
        const response = context.switchToHttp().getResponse<Response>();

        try {
            // 💡 We're assigning the payload to the request object here
            // so that we can access it in our route handlers
            const payload = await this.setSecurityContextFromRequest(request, response);
        } catch (e) {
            JwtAuthGuard.LOGGER.error(
                "Error occurred in Security Context",
                e.message,
                e.stack,
            );
            // Re-throw if already an UnauthorizedException with WWW-Authenticate already set
            if (e instanceof UnauthorizedException) {
                throw e;
            }
            response.setHeader('WWW-Authenticate', 'Bearer realm="auth-server"');
            throw new UnauthorizedException(e);
        }
        return true;
    }

    async setSecurityContextFromRequest(request: any, response: Response) {
        const authHeader = request.headers.authorization;
        if (!authHeader) {
            response.setHeader('WWW-Authenticate', 'Bearer realm="auth-server"');
            throw new UnauthorizedException(
                "No authentication credentials provided",
            );
        }
        let payload: Token;
        if (authHeader.startsWith("Bearer ")) {
            const token = extractTokenFromHeader(request);
            if (!token) {
                response.setHeader('WWW-Authenticate', 'Bearer realm="auth-server", error="invalid_token", error_description="The access token is invalid or has expired"');
                throw new UnauthorizedException("Invalid Bearer token");
            }
            try {
                payload = await this.authService.validateAccessToken(token);
            } catch (error) {
                response.setHeader('WWW-Authenticate', 'Bearer realm="auth-server", error="invalid_token", error_description="The access token is invalid or has expired"');
                throw new UnauthorizedException("Invalid or expired JWT token");
            }
        } else if (authHeader.startsWith("Basic ")) {
            const credentials = extractBasicAuthCredentials(authHeader);
            if (!credentials) {
                response.setHeader('WWW-Authenticate', 'Bearer realm="auth-server"');
                throw new UnauthorizedException("Invalid Basic Authentication credentials",);
            }
            try {
                payload = await this.validateBasicAuth(
                    credentials.username,
                    credentials.password,
                );
                JwtAuthGuard.LOGGER.log("basic authentication credentials in");
            } catch (error) {
                response.setHeader('WWW-Authenticate', 'Bearer realm="auth-server"');
                throw new UnauthorizedException(
                    "Invalid Basic Authentication credentials",
                );
            }
        } else {
            response.setHeader('WWW-Authenticate', 'Bearer realm="auth-server"');
            throw new UnauthorizedException("Unsupported authentication type");
        }
        if (payload.grant_type === GRANT_TYPES.PASSWORD) {
            request["user"] = payload;
        }
        const ability = this.caslAbilityFactory.createForSecurityContext(payload);
        request["SECURITY_CONTEXT"] = payload;
        request["SCOPE_ABILITIES"] = ability;

        // Tenant resolution: derive tenant from token so controllers can use @CurrentTenantId()
        if (payload.isTenantToken()) {
            const tenantToken = payload as TenantToken;
            request["RESOLVED_TENANT_ID"] = tenantToken.tenant.id;
            request["RESOLVED_USER_TENANT_ID"] = tenantToken.userTenant.id;
        } else if (payload.isTechnicalToken()) {
            const technicalToken = payload as TechnicalToken;
            request["RESOLVED_TENANT_ID"] = technicalToken.tenant.id;
        }

        return payload;
    }

    private async validateBasicAuth(
        id: string,
        secret: string,
    ): Promise<TechnicalToken> {
        if (!id || !secret) {
            throw new UnauthorizedException("Invalid Basic Auth format");
        }
        if (id.includes("@")) {
            // Email-based authentication (Username/Password)
            throw new UnauthorizedException(
                "basic auth not supported for user login",
            );
        } else {
            // Client ID/Secret authentication
            const tenant = await this.authService.validateClientCredentials(id, secret);
            return this.authService.createTechnicalToken(tenant, []);
        }
    }
}

function extractTokenFromHeader(request: any) {
    let extractor = ExtractJwt.fromAuthHeaderAsBearerToken();
    return extractor(request);
}

function extractBasicAuthCredentials(
    authHeader: string,
): { username: string; password: string } | null {
    const base64Credentials = authHeader.split(" ")[1];
    const decoded = Buffer.from(base64Credentials, "base64").toString("utf-8");
    const [username, password] = decoded.split(":");
    if (!username || !password) {
        return null;
    }
    return {username, password};
}
