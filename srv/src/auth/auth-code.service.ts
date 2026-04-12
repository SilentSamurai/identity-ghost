/**
 * AuthCodeService - Handles authorization code lifecycle for OAuth 2.0 authorization code flow.
 * 
 * This service manages:
 * - Creating authorization codes for user authentication
 * - Validating authorization codes and PKCE code verifiers
 * - Cleaning up expired authorization codes via cron job
 * 
 * The authorization code is a temporary code that the client exchanges for tokens.
 * It implements RFC 6749 OAuth 2.0 authorization code grant type.
 */
import {Injectable, Logger} from "@nestjs/common";
import {OAuthException} from "../exceptions/oauth-exception";
import {Environment} from "../config/environment.service";
import {InjectRepository} from "@nestjs/typeorm";
import {IsNull, Not, Repository, DataSource} from "typeorm";
import {AuthCode} from "../entity/auth_code.entity";
import {User} from "../entity/user.entity";
import {Tenant} from "../entity/tenant.entity";
import {CryptUtil} from "../util/crypt.util";
import {Cron} from "@nestjs/schedule";
import {AuthUserService} from "../casl/authUser.service";

@Injectable()
export class AuthCodeService {
    private readonly LOGGER = new Logger("AuthCodeService");

    constructor(
        private readonly configService: Environment,
        private readonly authUserService: AuthUserService,
        @InjectRepository(AuthCode)
        private authCodeRepository: Repository<AuthCode>,
        @InjectRepository(User) private usersRepository: Repository<User>,
        private dataSource: DataSource,
    ) {
    }

    private isSqlite(): boolean {
        return this.dataSource.options.type === 'sqlite' || this.dataSource.options.type === 'better-sqlite3';
    }

    async existByCode(code: string): Promise<boolean> {
        return this.authCodeRepository.exist({
            where: {code},
        });
    }

    async findByCode(code: string): Promise<AuthCode> {
        let session = await this.authCodeRepository.findOne({
            where: {code: code},
        });
        if (session === null) {
            throw OAuthException.invalidGrant('The authorization code is invalid, expired, or has already been used');
        }
        return session;
    }

    async hasAuthCodeWithHint(code: string): Promise<boolean> {
        return this.authCodeRepository.exists({
            where: {
                code: code,
                subscriberTenantHint: Not(IsNull())
            }
        });
    }

    /**
     * Create an authorization code bound to the requesting client's parameters.
     */
    async createAuthToken(
        user: User,
        tenant: Tenant,
        clientId: string,
        codeChallenge: string,
        method: string,
        subscriberTenantHint?: string,
        redirectUri?: string,
        scope?: string,
        nonce?: string,
        sid?: string,
    ): Promise<string> {
        let code = CryptUtil.generateOTP(6);

        if (await this.existByCode(code)) {
            code = CryptUtil.generateRandomString(16);
        }

        const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

        const authCode = this.authCodeRepository.create({
            code,
            codeChallenge,
            method,
            tenantId: tenant.id,
            userId: user.id,
            clientId,
            subscriberTenantHint: subscriberTenantHint || null,
            redirectUri: redirectUri || null,
            scope: scope || null,
            nonce: nonce || null,
            sid: sid || null,
            used: false,
            expiresAt,
        });

        await this.authCodeRepository.save(authCode);

        return code;
    }

    /**
     * Atomically redeem an authorization code.
     * Uses a single UPDATE ... WHERE ... RETURNING to prevent TOCTOU race conditions
     * and ensure single-use enforcement under concurrent access.
     * Supports both PostgreSQL (production) and SQLite (testing).
     */
    async redeemAuthCode(code: string): Promise<AuthCode> {
        if (this.isSqlite()) {
            return this.redeemAuthCodeSqlite(code);
        }
        return this.redeemAuthCodePostgres(code);
    }

    private async redeemAuthCodePostgres(code: string): Promise<AuthCode> {
        const result: any[] = await this.authCodeRepository.query(
            `UPDATE auth_code SET used = true, used_at = NOW() WHERE code = $1 AND used = false AND expires_at > NOW() RETURNING *`,
            [code],
        );

        if (!result || result.length === 0) {
            this.LOGGER.warn(`Auth code redemption failed for code: ${code.substring(0, 4)}****`);
            throw OAuthException.invalidGrant('The authorization code is invalid, expired, or has already been used');
        }

        const row = result[0];
        return this.mapRowToAuthCode(row);
    }

    private async redeemAuthCodeSqlite(code: string): Promise<AuthCode> {
        const now = new Date();

        // First check if the code exists and is not expired
        const authCode = await this.authCodeRepository.findOne({
            where: {code},
        });

        if (!authCode || new Date(authCode.expiresAt) <= now) {
            this.LOGGER.warn(`Auth code redemption failed for code: ${code.substring(0, 4)}****`);
            throw OAuthException.invalidGrant('The authorization code is invalid, expired, or has already been used');
        }

        // Atomic UPDATE ... WHERE used = false to prevent concurrent double-redemption.
        // SQLite serializes writes, so this is safe against race conditions.
        const updateResult = await this.authCodeRepository
            .createQueryBuilder()
            .update(AuthCode)
            .set({used: true, usedAt: now})
            .where('code = :code AND used = 0', {code})
            .execute();

        if (!updateResult.affected || updateResult.affected === 0) {
            this.LOGGER.warn(`Auth code redemption failed for code: ${code.substring(0, 4)}****`);
            throw OAuthException.invalidGrant('The authorization code is invalid, expired, or has already been used');
        }

        // Re-fetch to get the updated record
        return await this.authCodeRepository.findOne({where: {code}});
    }

    private mapRowToAuthCode(row: any): AuthCode {
        const authCode = new AuthCode();
        authCode.code = row.code;
        authCode.codeChallenge = row.code_challenge;
        authCode.method = row.method;
        authCode.userId = row.user_id;
        authCode.tenantId = row.tenant_id;
        authCode.clientId = row.client_id;
        authCode.subscriberTenantHint = row.subscriber_tenant_hint;
        authCode.redirectUri = row.redirect_uri;
        authCode.scope = row.scope;
        authCode.nonce = row.nonce;
        authCode.used = row.used;
        authCode.usedAt = row.used_at;
        authCode.expiresAt = row.expires_at;
        authCode.createdAt = row.created_at;
        authCode.sid = row.sid;
        return authCode;
    }

    async validateAuthCode(code: string, codeVerifier: string) {
        let session = await this.findByCode(code);
        let tenant = await this.authUserService.findTenantById(
            session.tenantId,
        );
        let user = await this.authUserService.findUserById(session.userId);
        let generateCodeChallenge = CryptUtil.generateCodeChallenge(
            codeVerifier,
            session.method,
        );
        if (generateCodeChallenge !== session.codeChallenge) {
            throw OAuthException.invalidGrant('The authorization code is invalid or the code verifier does not match');
        }
        return {tenant, user};
    }

    /**
     * Delete expired and used authorization codes.
     */
    @Cron("0 1 * * * *") // Every hour, at the start of the 1st minute.
    async deleteExpiredAuthCodes() {
        this.LOGGER.log("Delete expired and used auth codes");

        const now = this.isSqlite()
            ? `datetime('now')`
            : `NOW()`;

        const result = await this.authCodeRepository
            .createQueryBuilder()
            .delete()
            .where(`expires_at < ${now} OR used = true`)
            .execute();

        if (result.affected > 0) {
            this.LOGGER.log(`Deleted ${result.affected} expired/used auth codes`);
        }
    }
}
