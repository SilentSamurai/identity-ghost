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
import {Injectable, Logger, NotFoundException, UnauthorizedException} from "@nestjs/common";
import {OAuthException} from "../exceptions/oauth-exception";
import {Environment} from "../config/environment.service";
import {InjectRepository} from "@nestjs/typeorm";
import {IsNull, Not, Repository} from "typeorm";
import {AuthCode} from "../entity/auth_code.entity";
import {User} from "../entity/user.entity";
import {Tenant} from "../entity/tenant.entity";
import {CryptUtil} from "../util/crypt.util";
import {Cron} from "@nestjs/schedule";
import * as ms from "ms";
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
    ) {
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
     * Create a verification token for the user.
     */
    async createAuthToken(
        user: User,
        tenant: Tenant,
        code_challenge: string,
        method: string,
        subscriberTenantHint?: string,
        redirectUri?: string,
    ): Promise<string> {
        let roles = await this.authUserService.getMemberRoles(tenant, user);

        let code = CryptUtil.generateOTP(6);

        if (await this.existByCode(code)) {
            code = CryptUtil.generateRandomString(16);
        }

        let session = this.authCodeRepository.create({
            codeChallenge: code_challenge,
            code: code,
            method: method,
            tenantId: tenant.id,
            userId: user.id,
            subscriberTenantHint: subscriberTenantHint || null,
            redirectUri: redirectUri || null,
        });

        session = await this.authCodeRepository.save(session);
        return session.code;
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
     * Delete the expired not verified users.
     */
    @Cron("0 1 * * * *") // Every hour, at the start of the 1st minute.
    async deleteExpiredNotVerifiedUsers() {
        this.LOGGER.log("Delete expired auth codes");

        const now: Date = new Date();
        const expirationTime: any = this.configService.get(
            "TOKEN_EXPIRATION_TIME",
        );

        const authCodes: AuthCode[] = await this.authCodeRepository.find();
        for (let i = 0; i < authCodes.length; i++) {
            const authCode: AuthCode = authCodes[i];
            const createDate: Date = new Date(authCode.createdAt);
            const expirationDate: Date = new Date(
                createDate.getTime() + ms(expirationTime),
            );

            if (now > expirationDate) {
                try {
                    await this.authCodeRepository.delete(authCode.code);
                    this.LOGGER.log("auth codes " + authCode.code + " deleted");
                } catch (exception) {
                }
            }
        }
    }
}
