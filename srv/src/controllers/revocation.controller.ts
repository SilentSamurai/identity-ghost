import {Body, Controller, Get, Header, HttpCode, Post, Req, Res, UseGuards} from '@nestjs/common';
import {Request, Response} from 'express';
import {TokenRevocationService} from '../auth/token-revocation.service';
import {JwtAuthGuard} from '../auth/jwt-auth.guard';
import {CurrentTenantId} from '../auth/auth.decorator';
import {OAuthException} from '../exceptions/oauth-exception';
import {Environment} from '../config/environment.service';
import {AuthService} from '../auth/auth.service';
import {ExtractJwt} from 'passport-jwt';

/**
 * RFC 7009 Token Revocation and Logout endpoints.
 */
@Controller('api/oauth')
export class RevocationController {
    constructor(
        private readonly revocationService: TokenRevocationService,
        private readonly authService: AuthService,
    ) {
    }

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
    @UseGuards(JwtAuthGuard)
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
     * Invalidates the server-side login session and revokes the refresh token family.
     *
     * Authentication rules:
     *   - Valid Bearer JWT present → use tenant from token, proceed with logout → 200
     *   - Invalid/missing JWT + sid present (body or cookie) → sid-only logout → 200
     *   - Neither JWT nor sid → 400 (bad request — nothing to identify the session)
     *
     * Does not return 401 — logout is idempotent and we don't gate it on session validity.
     * The sid cookie is always cleared in the response on 200.
     */
    @Post('logout')
    @HttpCode(200)
    @Header('Cache-Control', 'no-store')
    @Header('Pragma', 'no-cache')
    async logout(
        @Req() req: Request,
        @Res({passthrough: true}) res: Response,
        @Body() body: { refresh_token?: string; sid?: string },
    ): Promise<Record<string, never>> {
        // Accept sid from body (programmatic callers) or signed cookie (browser flows)
        const sid = body.sid ?? (req as any).signedCookies?.sid;

        // Try to resolve tenant from Bearer token
        let tenantId: string | null = null;
        let jwtValid = false;
        try {
            const rawToken = ExtractJwt.fromAuthHeaderAsBearerToken()(req as any);
            if (rawToken) {
                const token = await this.authService.validateAccessToken(rawToken);
                if (token.isTenantToken()) {
                    tenantId = (token as any).tenant?.id ?? null;
                }
                jwtValid = true;
            }
        } catch {
            // Bearer token absent or invalid — fall through to sid check
        }

        // Require at least one identifier — JWT or sid
        if (!jwtValid && !sid) {
            throw OAuthException.invalidRequest('A Bearer token or sid is required to logout');
        }

        await this.revocationService.logout(tenantId, body.refresh_token, sid);

        // Clear the sid cookie
        res.cookie('sid', '', {
            signed: true,
            httpOnly: true,
            secure: Environment.get('ENABLE_HTTPS') === 'true' || process.env.NODE_ENV === 'production',
            sameSite: 'lax' as const,
            path: '/api/oauth',
            maxAge: 0,
        });

        return {};
    }

    /**
     * GET /api/oauth/logout
     *
     * Returns 405 Method Not Allowed. Logout requires POST.
     * This prevents 404 noise from health-check probes (e.g. Portainer).
     */
    @Get('logout')
    @HttpCode(405)
    @Header('Allow', 'POST')
    getLogout(): { error: string; error_description: string } {
        return {
            error: 'method_not_allowed',
            error_description: 'Use POST to logout.',
        };
    }

    /**
     * GET /api/oauth/revoke
     *
     * Returns 405 Method Not Allowed. Revocation requires POST.
     */
    @Get('revoke')
    @HttpCode(405)
    @Header('Allow', 'POST')
    getRevoke(): { error: string; error_description: string } {
        return {
            error: 'method_not_allowed',
            error_description: 'Use POST to revoke tokens.',
        };
    }
}
