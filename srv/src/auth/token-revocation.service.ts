import {Injectable, Logger} from '@nestjs/common';
import {InjectRepository} from '@nestjs/typeorm';
import {Repository} from 'typeorm';
import {createHash} from 'crypto';
import {RefreshTokenService} from './refresh-token.service';
import {RefreshToken} from '../entity/refresh-token.entity';
import {OAuthException} from '../exceptions/oauth-exception';
import {LoginSessionService} from './login-session.service';

/**
 * Owns the business logic for RFC 7009 Token Revocation and the logout sequence.
 *
 * The controller (under JwtAuthGuard) has already authenticated the caller and
 * resolved the tenant ID from the security context. This service only deals
 * with token lookup, tenant isolation, and family revocation.
 *
 * Fail-secure pattern:
 *   - {@link OAuthException}s are re-thrown for the global exception filter.
 *   - Any other error is caught, logged internally, and swallowed — the caller
 *     always receives HTTP 200 with an empty body.
 *   - Token values are never logged; only `family_id` and `tenant_id` appear
 *     in revocation audit entries.
 */
@Injectable()
export class TokenRevocationService {
    private readonly logger = new Logger(TokenRevocationService.name);

    constructor(
        private readonly refreshTokenService: RefreshTokenService,
        @InjectRepository(RefreshToken)
        private readonly refreshTokenRepo: Repository<RefreshToken>,
        private readonly loginSessionService: LoginSessionService,
    ) {}

    /**
     * Revoke a refresh token and its entire family.
     *
     * Per RFC 7009 §2.1 the endpoint returns success (void) in all cases
     * where authentication succeeds — token not found, already revoked,
     * tenant mismatch, or expired tokens all result in a silent return.
     */
    async revoke(tenantId: string, token: string): Promise<void> {
        try {
            const tokenHash = createHash('sha256').update(token).digest('hex');
            const record = await this.refreshTokenRepo.findOne({where: {tokenHash}});

            if (!record) {
                return; // Unknown token — silent success per RFC 7009
            }

            if (record.tenantId !== tenantId) {
                return; // Cross-tenant — silent success, no information leakage
            }

            if (record.revoked) {
                return; // Already revoked — idempotent
            }

            await this.refreshTokenService.revokeFamily(record.familyId);

            this.logger.log(
                `Token family revoked: family_id=${record.familyId}, tenant_id=${tenantId}`,
            );
        } catch (e) {
            if (e instanceof OAuthException) {
                throw e;
            }
            this.logger.error('Unexpected error during token revocation', e.stack);
        }
    }

    /**
     * Logout sequence: revoke the refresh token family (if provided),
     * invalidate the login session (if sid provided),
     * then return so the controller can clear session cookies.
     */
    async logout(tenantId: string, refreshToken?: string, sid?: string): Promise<void> {
        if (sid) {
            await this.loginSessionService.invalidateSession(sid);
            await this.refreshTokenService.revokeBySid(sid);
        }
        if (refreshToken) {
            await this.revoke(tenantId, refreshToken);
        }
    }
}
