/**
 * JwtAuthGuard - Authentication guard that validates JWT and Basic auth tokens.
 *
 * Implements RFC 6750 Bearer Token usage and RFC 7617 Basic auth for protected resources.
 * Validates credentials, sets up CASL security context, and resolves tenant context.
 */
import {
    CanActivate,
    ExecutionContext,
    HttpException,
    Injectable,
    Logger,
    UnauthorizedException,
} from "@nestjs/common";
import { ExtractJwt } from "passport-jwt";
import { AuthService } from "./auth.service";
import { CaslAbilityFactory } from "../casl/casl-ability.factory";
import { TechnicalToken, TenantToken, Token } from "../casl/contexts";
import { Response } from "express";
import { parseBasicAuthHeader } from "../util/http.util";

@Injectable()
export class JwtAuthGuard implements CanActivate {
    private static readonly LOGGER = new Logger("JwtAuthGuard");

    constructor(
        private readonly authService: AuthService,
        private readonly caslAbilityFactory: CaslAbilityFactory,
    ) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest();
        const response = context.switchToHttp().getResponse<Response>();

        try {
            const payload = await this.extractToken(request, response);
            this.setSecurityContext(request, payload);
        } catch (e) {
            JwtAuthGuard.LOGGER.error("Error occurred in Security Context", e.message, e.stack);
            if (e instanceof UnauthorizedException) {
                throw e;
            }
            // Preserve non-401 HttpExceptions (e.g., 503 for DB failures)
            if (e instanceof HttpException && e.getStatus() !== 401) {
                throw e;
            }
            throw this.unauthorizedError(response, 'Bearer', "Authentication failed");
        }
        return true;
    }

    /**
     * Extract and validate token from the request.
     * Supports Bearer JWT, Basic auth, and client_secret_post (RFC 7009).
     */
    private async extractToken(request: any, response: Response): Promise<Token> {
        const authHeader = request.headers.authorization;

        if (!authHeader) {
            return this.tryClientSecretPost(request, response);
        }
        if (authHeader.startsWith("Bearer ")) {
            return this.extractBearerToken(request, response);
        }
        if (authHeader.startsWith("Basic ")) {
            return this.extractBasicToken(authHeader, response);
        }
        throw this.unauthorizedError(response, 'Bearer', "Unsupported authentication type");
    }

    private async tryClientSecretPost(request: any, response: Response): Promise<Token> {
        const { client_id, client_secret } = request.body || {};
        if (client_id && client_secret) {
            try {
                return await this.validateBasicAuth(client_id, client_secret);
            } catch {
                throw this.unauthorizedError(response, 'Bearer', "Invalid client credentials");
            }
        }
        throw this.unauthorizedError(response, 'Bearer', "No authentication credentials provided");
    }

    private async extractBearerToken(request: any, response: Response): Promise<Token> {
        const token = ExtractJwt.fromAuthHeaderAsBearerToken()(request);
        if (!token) {
            throw this.unauthorizedError(response, 'Bearer',
                "The access token is invalid or has expired", 'invalid_token');
        }
        try {
            return await this.authService.validateAccessToken(token);
        } catch {
            throw this.unauthorizedError(response, 'Bearer',
                "The access token is invalid or has expired", 'invalid_token');
        }
    }

    private async extractBasicToken(authHeader: string, response: Response): Promise<Token> {
        const credentials = parseBasicAuthHeader(authHeader);
        if (!credentials) {
            throw this.unauthorizedError(response, 'Basic', "Invalid Basic Authentication credentials");
        }
        try {
            return await this.validateBasicAuth(credentials.username, credentials.password);
        } catch {
            throw this.unauthorizedError(response, 'Basic', "Invalid Basic Authentication credentials");
        }
    }

    /**
     * Set security context, CASL abilities, and tenant resolution on the request.
     */
    private setSecurityContext(request: any, payload: Token): void {
        request["SECURITY_CONTEXT"] = payload;
        request["SCOPE_ABILITIES"] = this.caslAbilityFactory.createForSecurityContext(payload);

        if (payload.isTenantToken()) {
            const tenantToken = payload as TenantToken;
            request["user"] = payload;
            request["RESOLVED_TENANT_ID"] = tenantToken.tenant.id;
            request["RESOLVED_USER_TENANT_ID"] = tenantToken.userTenant?.id;
        } else if (payload.isTechnicalToken()) {
            request["RESOLVED_TENANT_ID"] = (payload as TechnicalToken).tenant.id;
        }
    }

    private async validateBasicAuth(id: string, secret: string): Promise<TechnicalToken> {
        if (!id || !secret) {
            throw new UnauthorizedException("Invalid Basic Auth format");
        }
        if (id.includes("@")) {
            throw new UnauthorizedException("Basic auth not supported for user login");
        }
        const tenant = await this.authService.validateClientCredentials(id, secret);
        return this.authService.createTechnicalToken(tenant, []);
    }

    /**
     * Set WWW-Authenticate header and return UnauthorizedException.
     * Uses the correct scheme (Bearer or Basic) per RFC 6750 / RFC 7617.
     */
    private unauthorizedError(
        response: Response, scheme: 'Bearer' | 'Basic',
        description: string, error?: string,
    ): UnauthorizedException {
        let header = `${scheme} realm="auth-server"`;
        if (error) {
            header += `, error="${error}", error_description="${description}"`;
        }
        response.setHeader('WWW-Authenticate', header);
        return new UnauthorizedException(description);
    }
}
