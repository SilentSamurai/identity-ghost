import {Injectable} from "@nestjs/common";
import {InjectRepository} from "@nestjs/typeorm";
import {Repository} from "typeorm";
import {randomUUID} from "crypto";
import {LoginSession} from "../entity/login-session.entity";
import {Environment} from "../config/environment.service";
import {OAuthException} from "../exceptions/oauth-exception";

@Injectable()
export class LoginSessionService {
    constructor(
        @InjectRepository(LoginSession)
        private readonly repo: Repository<LoginSession>,
        private readonly configService: Environment,
    ) {}

    /**
     * Create a new login session for a user authentication event.
     * Called from the login endpoint after credentials are validated.
     */
    async createSession(userId: string, tenantId: string): Promise<LoginSession> {
        const sid = randomUUID();
        const authTime = Math.floor(Date.now() / 1000);
        const durationSeconds = parseInt(
            this.configService.get("LOGIN_SESSION_DURATION_SECONDS", "86400"),
            10,
        );
        const expiresAt = new Date(Date.now() + durationSeconds * 1000);

        const session = this.repo.create({
            sid,
            userId,
            tenantId,
            authTime,
            expiresAt,
            invalidatedAt: null,
        });

        return this.repo.save(session);
    }

    /**
     * Validate that a session exists, is not expired, and is not invalidated.
     * Throws OAuthException.invalidGrant if the session is invalid.
     */
    async validateSession(sid: string): Promise<LoginSession> {
        const session = await this.repo.findOne({where: {sid}});

        if (!session || session.invalidatedAt !== null || session.expiresAt < new Date()) {
            throw OAuthException.invalidGrant("The session is invalid");
        }

        return session;
    }

    /**
     * Mark a session as invalidated (sets invalidated_at timestamp).
     * Silently succeeds if session not found (idempotent, per RFC 7009 semantics).
     */
    async invalidateSession(sid: string): Promise<void> {
        await this.repo.update({sid}, {invalidatedAt: new Date()});
    }
}
