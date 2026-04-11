import {Controller, Get, Header, HttpCode, Post, UseGuards} from '@nestjs/common';
import {JwtAuthGuard} from '../auth/jwt-auth.guard';
import {ClaimsResolverService, ResolvedClaims} from '../auth/claims-resolver.service';
import {AuthUserService} from '../casl/authUser.service';
import {Token} from '../casl/contexts';
import {OAuthException} from '../exceptions/oauth-exception';
import {CurrentToken} from '../auth/auth.decorator';

/**
 * OIDC Core §5.3 UserInfo Endpoint.
 *
 * Returns claims about the authenticated user based on the granted scopes
 * in the access token. Protected by JwtAuthGuard — the caller must present
 * a valid Bearer token. The guard sets up the security context so the
 * controller reads token data via @CurrentToken().
 *
 * Only TenantToken (user-based auth) is accepted. TechnicalToken
 * (client_credentials) is rejected with an invalid_token error per
 * OIDC Core §5.3.3.
 *
 * All responses carry Cache-Control: no-store and Pragma: no-cache per
 * OIDC Core §5.3.
 */
@UseGuards(JwtAuthGuard)
@Controller('api/oauth')
export class UserInfoController {
    constructor(
        private readonly claimsResolverService: ClaimsResolverService,
        private readonly authUserService: AuthUserService,
    ) {}

    /**
     * GET /api/oauth/userinfo
     *
     * Bearer token in Authorization header. Returns identity claims
     * based on the token's granted scopes.
     */
    @Get('userinfo')
    @HttpCode(200)
    @Header('Cache-Control', 'no-store')
    @Header('Pragma', 'no-cache')
    async getUserInfoGet(@CurrentToken() token: Token): Promise<ResolvedClaims> {
        return this.handleUserInfo(token);
    }

    /**
     * POST /api/oauth/userinfo
     *
     * Bearer token in Authorization header. Body is ignored per
     * OIDC Core §5.3.1. Returns same response as GET.
     */
    @Post('userinfo')
    @HttpCode(200)
    @Header('Cache-Control', 'no-store')
    @Header('Pragma', 'no-cache')
    async getUserInfoPost(@CurrentToken() token: Token): Promise<ResolvedClaims> {
        return this.handleUserInfo(token);
    }

    private async handleUserInfo(token: Token): Promise<ResolvedClaims> {
        if (!token.isTenantToken()) {
            throw OAuthException.invalidToken(
                'UserInfo endpoint requires a user access token',
            );
        }

        const tenantToken = token.asTenantToken();
        const user = await this.authUserService.findUserById(tenantToken.sub);

        return this.claimsResolverService.resolveClaims(tenantToken.scopes, user);
    }
}
