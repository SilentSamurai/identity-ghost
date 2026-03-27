import {
    BadRequestException,
    Body,
    ClassSerializerInterceptor,
    Controller,
    ForbiddenException,
    Logger,
    Post,
    Req,
    UseInterceptors,
} from "@nestjs/common";
import {Request as ExpressRequest} from "express";

import {User} from "../entity/user.entity";
import {Environment} from "../config/environment.service";
import {AuthService} from "../auth/auth.service";
import {ValidationPipe} from "../validation/validation.pipe";
import {ValidationSchema} from "../validation/validation.schema";
import {Tenant} from "../entity/tenant.entity";
import {AuthCodeService} from "../auth/auth-code.service";
import {GRANT_TYPES} from "../casl/contexts";
import {AuthUserService} from "../casl/authUser.service";
import {TokenIssuanceService} from "../auth/token-issuance.service";

const logger = new Logger("OAuthTokenController");

@Controller("api/oauth")
@UseInterceptors(ClassSerializerInterceptor)
export class OAuthTokenController {
    constructor(
        private readonly configService: Environment,
        private readonly authService: AuthService,
        private readonly authCodeService: AuthCodeService,
        private readonly authUserService: AuthUserService,
        private readonly tokenIssuanceService: TokenIssuanceService,
    ) {
    }

    @Post("/login")
    async login(
        @Body(new ValidationPipe(ValidationSchema.LoginSchema))
            body: {
            client_id: string;
            password: string;
            email: string;
            code_challenge_method: string;
            code_challenge: string;
            subscriber_tenant_hint?: string;
        },
    ) {
        const user: User = await this.authService.validate(
            body.email,
            body.password,
        );

        let tenant: Tenant;
        if (await this.authUserService.tenantExistsByDomain(body.client_id)) {
            tenant = await this.authUserService.findTenantByDomain(
                body.client_id,
            );
        } else if (
            await this.authUserService.tenantExistsByClientId(body.client_id)
        ) {
            tenant = await this.authUserService.findTenantByClientId(
                body.client_id,
            );
        } else {
            throw new BadRequestException("domain || client_id is required");
        }

        const result = await this.tokenIssuanceService.resolveLoginAccess(
            user, tenant, body.subscriber_tenant_hint,
        );

        if (!result.granted) {
            return {
                requires_tenant_selection: true,
                tenants: result.ambiguousTenants,
            };
        }

        const auth_code = await this.authCodeService.createAuthToken(
            user,
            tenant,
            body.code_challenge,
            body.code_challenge_method,
            result.resolvedHint,
        );
        return {
            authentication_code: auth_code,
        };
    }

    @Post("/token")
    async oauthToken(
        @Req() req: ExpressRequest,
        @Body() body: any,
    ): Promise<any> {
        let clientId = body.client_id;
        let clientSecret = body.client_secret;
        if (req.headers.authorization && req.headers.authorization.startsWith("Basic ")) {
            try {
                const base64Credentials = req.headers.authorization.split(" ")[1];
                const credentials = Buffer.from(base64Credentials, "base64").toString("utf-8");
                const [id, secret] = credentials.split(":");
                if (id) clientId = id;
                if (secret) clientSecret = secret;
            } catch (e) {
                logger.error("Error decoding basic auth credentials", e);
            }
        }
        body.client_id = clientId;
        body.client_secret = clientSecret;

        switch (body.grant_type) {
            case GRANT_TYPES.CODE:
                return this.handleCodeGrant(body);
            case GRANT_TYPES.PASSWORD:
                return this.handlePasswordGrant(body);
            case GRANT_TYPES.CLIENT_CREDENTIALS:
                return this.handleClientCredentialsGrant(body);
            case GRANT_TYPES.REFRESH_TOKEN:
                return this.handleRefreshTokenGrant(body);
            default:
                throw new BadRequestException({
                    error: "unsupported_grant_type",
                    error_description: "grant type not recognised.",
                });
        }
    }

    @Post("/exchange")
    async exchangeAccessToken(
        @Body(new ValidationPipe(ValidationSchema.ExchangeTokenSchema))
            body: {
            access_token: string;
            client_id: string;
            client_secret: string;
        },
    ): Promise<object> {
        let tenantToken = await this.authService.validateAccessToken(body.access_token);
        if (tenantToken.grant_type !== GRANT_TYPES.PASSWORD) {
            throw new ForbiddenException("grant_type not allowed");
        }
        await this.authService.validateClientCredentials(
            body.client_id,
            body.client_secret,
        );
        const user = await this.authUserService.findUserByEmail(
            tenantToken.asTenantToken().email,
        );
        const tenant = await this.authUserService.findTenantByClientId(
            body.client_id,
        );
        const {accessToken, refreshToken, scopes} =
            await this.authService.createUserAccessToken(user, tenant);
        return {
            access_token: accessToken,
            expires_in: this.configService.get("TOKEN_EXPIRATION_TIME"),
            token_type: "Bearer",
            refresh_token: refreshToken,
            ...(scopes && scopes.length ? {scope: scopes.join(" ")} : {}),
        };
    }

    private async handleCodeGrant(body: any): Promise<any> {
        let validationPipe = new ValidationPipe(
            ValidationSchema.CodeGrantSchema,
        );
        await validationPipe.transform(body, null);
        const {user, tenant} = await this.authCodeService.validateAuthCode(
            body.code,
            body.code_verifier,
        );

        if (body.client_id) {
            if (tenant.clientId !== body.client_id && tenant.domain !== body.client_id) {
                logger.warn(`Auth code grant mismatch: code's app client_id '${tenant.clientId}'/'${tenant.domain}' does not match request client_id '${body.client_id}'`);
                throw new BadRequestException({
                    error: "invalid_grant",
                    error_description: "The authorization code was not issued to this client or the client_id is invalid.",
                });
            }
        }

        return this.tokenIssuanceService.issueToken(user, tenant, {
            subscriberTenantHint: body.subscriber_tenant_hint,
            authCode: body.code,
        });
    }

    private async handlePasswordGrant(body: any): Promise<any> {
        let validationPipe = new ValidationPipe(
            ValidationSchema.PasswordGrantSchema,
        );
        await validationPipe.transform(body, null);
        const user: User = await this.authService.validate(
            body.username,
            body.password
        );
        let tenant: Tenant;
        if (await this.authUserService.tenantExistsByDomain(body.client_id)) {
            tenant = await this.authUserService.findTenantByDomain(body.client_id);
        } else if (await this.authUserService.tenantExistsByClientId(body.client_id)) {
            tenant = await this.authUserService.findTenantByClientId(body.client_id);
        } else {
            throw new BadRequestException("client_id is required");
        }

        return this.tokenIssuanceService.issueToken(user, tenant, {
            subscriberTenantHint: body.subscriber_tenant_hint,
        });
    }

    private async handleClientCredentialsGrant(body: any): Promise<any> {
        let validationPipe = new ValidationPipe(
            ValidationSchema.ClientCredentialGrantSchema,
        );
        await validationPipe.transform(body, null);
        const tenant: Tenant =
            await this.authService.validateClientCredentials(
                body.client_id,
                body.client_secret,
            );
        const token: string =
            await this.authService.createTechnicalAccessToken(
                tenant,
                body.scopes,
            );
        const decoded: any = this.authService.decodeToken(token);
        return {
            access_token: token,
            expires_in: this.configService.get(
                "TOKEN_EXPIRATION_TIME_IN_SECONDS",
            ),
            token_type: "Bearer",
            ...(decoded && decoded.scopes ? {scope: decoded.scopes.join(" ")} : {}),
        };
    }

    private async handleRefreshTokenGrant(body: any): Promise<any> {
        let validationPipe = new ValidationPipe(
            ValidationSchema.RefreshTokenGrantSchema,
        );
        await validationPipe.transform(body, null);
        const {tenant, user} =
            await this.authService.validateRefreshToken(
                body.refresh_token,
            );

        return this.tokenIssuanceService.issueToken(user, tenant, {
            subscriberTenantHint: body.subscriber_tenant_hint,
        });
    }
}
