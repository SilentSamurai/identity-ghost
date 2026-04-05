/**
 * OAuthVerificationController - Handles OAuth authorization code verification.
 * 
 * This controller provides endpoints for:
 * - Verifying authorization codes before token issuance
 * - Validating that auth codes belong to the correct client
 * - Token verification for protected resources
 * 
 * It works with OAuthTokenController to complete the authorization code flow.
 */
import {
    Body,
    ClassSerializerInterceptor,
    Controller,
    Post,
    UseFilters,
    UseInterceptors,
} from "@nestjs/common";

import {AuthService} from "../auth/auth.service";
import {ValidationPipe} from "../validation/validation.pipe";
import {ValidationSchema} from "../validation/validation.schema";
import {AuthCodeService} from "../auth/auth-code.service";
import {Token} from "../casl/contexts";
import {AuthUserService} from "../casl/authUser.service";
import {OAuthException} from "../exceptions/oauth-exception";
import {OAuthExceptionFilter} from "../exceptions/filter/oauth-exception.filter";

@Controller("api/oauth")
@UseFilters(OAuthExceptionFilter)
@UseInterceptors(ClassSerializerInterceptor)
export class OAuthVerificationController {
    constructor(
        private readonly authService: AuthService,
        private readonly authCodeService: AuthCodeService,
        private readonly authUserService: AuthUserService,
    ) {
    }

    @Post("/verify-auth-code")
    async authCode(
        @Body(new ValidationPipe(ValidationSchema.VerifyAuthCodeSchema))
        body: { auth_code: string, client_id: string }
    ) {
        if (!body.client_id) {
            throw OAuthException.invalidRequest("client_id is required");
        }
        const authCodeObj = await this.authCodeService.findByCode(body.auth_code);
        let tenant = null;
        if (await this.authUserService.tenantExistsByDomain(body.client_id)) {
            tenant = await this.authUserService.findTenantByDomain(body.client_id);
        } else if (await this.authUserService.tenantExistsByClientId(body.client_id)) {
            tenant = await this.authUserService.findTenantByClientId(body.client_id);
        } else {
            throw OAuthException.invalidClient("Unknown client_id");
        }
        if (authCodeObj.tenantId !== tenant.id) {
            throw OAuthException.invalidGrant("auth_code does not belong to the provided client_id");
        }
        const user = await this.authUserService.findUserById(authCodeObj.userId);
        return {
            authentication_code: body.auth_code,
            status: true,
            email: user.email,
        };
    }

    @Post("/verify")
    async verifyAccessToken(
        @Body(new ValidationPipe(ValidationSchema.VerifyTokenSchema))
        body: {
            access_token: string;
            client_id: string;
            client_secret: string;
        },
    ): Promise<object> {
        const tenant = await this.authService.validateClientCredentials(
            body.client_id,
            body.client_secret,
        );
        let securityContext: Token = await this.authService.validateAccessToken(body.access_token);
        if (securityContext.isTenantToken() || securityContext.asTenantToken().tenant.id !== tenant.id) {
            return securityContext;
        }
        throw OAuthException.invalidToken("The access token is invalid or has expired");
    }
}
