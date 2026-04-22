import {Injectable} from "@nestjs/common";
import {InjectRepository} from "@nestjs/typeorm";
import {IsNull, Repository} from "typeorm";
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
    ) {
    }

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

    /**
     * Find the most recent valid (non-expired, non-invalidated) session
     * for a user+tenant pair. Returns null if none exists.
     * Used by prompt=none and max_age enforcement to check existing sessions.
     */
    async findValidSession(userId: string, tenantId: string): Promise<LoginSession | null> {
        const session = await this.repo.findOne({
            where: {
                userId,
                tenantId,
                invalidatedAt: IsNull(),
            },
            order: {
                authTime: "DESC",
            },
        });

        if (!session) {
            return null;
        }

        // Check expiration after fetching (simpler than complex query)
        if (session.expiresAt < new Date()) {
            return null;
        }

        return session;
    }

    /**
     * Invalidate all active sessions for a user+tenant pair.
     * Used when prompt=login forces re-authentication.
     */
    async invalidateAllSessions(userId: string, tenantId: string): Promise<void> {
        await this.repo.update(
            {userId, tenantId, invalidatedAt: IsNull()},
            {invalidatedAt: new Date()},
        );
    }
}
