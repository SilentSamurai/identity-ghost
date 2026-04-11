import {Body, Controller, Header, HttpCode, Post, Res, UseGuards} from '@nestjs/common';
import {Response} from 'express';
import {TokenRevocationService} from '../auth/token-revocation.service';
import {JwtAuthGuard} from '../auth/jwt-auth.guard';
import {CurrentTenantId} from '../auth/auth.decorator';
import {OAuthException} from '../exceptions/oauth-exception';

/**
 * RFC 7009 Token Revocation and Logout endpoints.
 *
 * Both endpoints are protected by {@link JwtAuthGuard} — the caller must
 * present a valid Bearer token (or Basic client credentials). The guard
 * sets up the security context and resolves the tenant, so the controller
 * never touches the Authorization header directly.
 */
@UseGuards(JwtAuthGuard)
@Controller('api/oauth')
export class RevocationController {
    constructor(
        private readonly revocationService: TokenRevocationService,
    ) {}

    /**
     * POST /api/oauth/revoke
     *
     * Revokes a refresh token and its entire family.
     * Tenant is derived from the authenticated security context.
     *
     * Body:
     *   - `token`           (required) — the token string to revoke
     *   - `token_type_hint` (optional) — hint about the token type
     *
     * Returns HTTP 200 with `{}` for all requests where auth succeeds.
     */
    @Post('revoke')
    @HttpCode(200)
    @Header('Cache-Control', 'no-store')
    @Header('Pragma', 'no-cache')
    async revoke(
        @CurrentTenantId() tenantId: string,
        @Body() body: { token?: string; token_type_hint?: string },
    ): Promise<Record<string, never>> {
        if (!body.token || body.token.trim() === '') {
            throw OAuthException.invalidRequest('The "token" parameter is required');
        }

        await this.revocationService.revoke(tenantId, body.token);
        return {};
    }

    /**
     * POST /api/oauth/logout
     *
     * Revokes the refresh token family (if provided) and clears session
     * cookies. Tenant is derived from the authenticated security context.
     *
     * Body:
     *   - `refresh_token` (optional) — the refresh token to revoke
     *
     * Returns HTTP 200 with `{}` and `Set-Cookie` headers that clear
     * session cookies (`Max-Age=0`).
     */
    @Post('logout')
    @HttpCode(200)
    @Header('Cache-Control', 'no-store')
    @Header('Pragma', 'no-cache')
    async logout(
        @CurrentTenantId() tenantId: string,
        @Res({passthrough: true}) res: Response,
        @Body() body: { refresh_token?: string },
    ): Promise<Record<string, never>> {
        await this.revocationService.logout(tenantId, body.refresh_token);

        // Clear session cookies by setting Max-Age=0
        res.setHeader('Set-Cookie', [
            'session=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict',
            'session.sig=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict',
        ]);

        return {};
    }
}
