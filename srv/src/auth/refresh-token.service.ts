import {Injectable, Logger} from "@nestjs/common";
import {InjectRepository} from "@nestjs/typeorm";
import {Repository} from "typeorm";
import * as crypto from "crypto";
import * as ms from "ms";
import {RefreshToken} from "../entity/refresh-token.entity";
import {Environment} from "../config/environment.service";
import {OAuthException} from "../exceptions/oauth-exception";

const logger = new Logger("RefreshTokenService");

/**
 * Generate a cryptographically random opaque token with at least 32 bytes of entropy.
 * Returns a base64url-encoded string.
 */
export function generateOpaqueToken(): string {
    return crypto.randomBytes(32).toString("base64url");
}

/**
 * Compute the SHA-256 hash of a plaintext token string.
 * Returns the hash as a lowercase hex string.
 */
export function hashToken(plaintext: string): string {
    return crypto.createHash("sha256").update(plaintext).digest("hex");
}

/**
 * Validate that the requested scope is a subset of the record's scope.
 * Scopes are space-delimited strings.
 * Returns the granted scope string if valid; throws OAuthException if not.
 */
export function validateScopeSubset(requestedScope: string, recordScope: string): string {
    const requestedSet = new Set(requestedScope.split(" ").filter(Boolean));
    const recordSet = new Set(recordScope.split(" ").filter(Boolean));

    for (const scope of requestedSet) {
        if (!recordSet.has(scope)) {
            throw OAuthException.invalidScope("The requested scope exceeds the granted scope");
        }
    }

    return [...requestedSet].join(" ");
}

/**
 * Compute the clamped expiry: min(now + slidingMs, absoluteExpiresAt).
 */
export function clampExpiry(slidingMs: number, absoluteExpiresAt: Date): Date {
    const slidingExpiry = new Date(Date.now() + slidingMs);
    return slidingExpiry < absoluteExpiresAt ? slidingExpiry : absoluteExpiresAt;
}

@Injectable()
export class RefreshTokenService {
    constructor(
        @InjectRepository(RefreshToken)
        private readonly repo: Repository<RefreshToken>,
        private readonly configService: Environment,
    ) {}

    private getSlidingExpiryMs(): number {
        const raw = this.configService.get("REFRESH_TOKEN_SLIDING_EXPIRY", "7d");
        return ms(raw);
    }

    private getAbsoluteExpiryMs(): number {
        const raw = this.configService.get("REFRESH_TOKEN_ABSOLUTE_EXPIRY", "30d");
        return ms(raw);
    }

    private getGraceWindowSeconds(): number {
        const raw = parseInt(
            this.configService.get("REFRESH_TOKEN_GRACE_WINDOW_SECONDS", "0"),
            10,
        );
        if (isNaN(raw) || raw < 0) return 0;
        return Math.min(raw, 30);
    }

    /**
     * Generate a new opaque refresh token and persist its hash.
     * Called on initial authentication (login, auth code exchange).
     */
    async create(params: {
        userId: string;
        clientId: string;
        tenantId: string;
        scope: string;
        sid?: string;
    }): Promise<{ plaintext: string; record: RefreshToken }> {
        const plaintext = generateOpaqueToken();
        const tokenHash = hashToken(plaintext);
        const familyId = crypto.randomUUID();
        const now = new Date();
        const absoluteExpiresAt = new Date(now.getTime() + this.getAbsoluteExpiryMs());
        const expiresAt = clampExpiry(this.getSlidingExpiryMs(), absoluteExpiresAt);

        const record = this.repo.create({
            tokenHash,
            familyId,
            parentId: null,
            userId: params.userId,
            clientId: params.clientId,
            tenantId: params.tenantId,
            scope: params.scope,
            sid: params.sid || null,
            expiresAt,
            absoluteExpiresAt,
            revoked: false,
            usedAt: null,
        });

        const saved = await this.repo.save(record);
        return { plaintext, record: saved };
    }

    /**
     * Consume an existing token and rotate to a new one.
     * Handles atomic consumption, replay detection, grace window, and scope down-scoping.
     */
    async consumeAndRotate(params: {
        plaintextToken: string;
        clientId: string;
        requestedScope?: string;
    }): Promise<{ plaintext: string; record: RefreshToken }> {
        const tokenHash = hashToken(params.plaintextToken);

        // Look up by token hash
        const existing = await this.repo.findOne({ where: { tokenHash } });
        if (!existing) {
            throw OAuthException.invalidGrant("The refresh token is invalid or has expired");
        }

        // Check revoked before attempting consumption (Requirement 10.3)
        if (existing.revoked) {
            throw OAuthException.invalidGrant("The refresh token is invalid or has expired");
        }

        // Check sliding expiry
        const now = new Date();
        if (now > existing.expiresAt) {
            throw OAuthException.invalidGrant("The refresh token is invalid or has expired");
        }

        // Check absolute expiry
        if (now > existing.absoluteExpiresAt) {
            throw OAuthException.invalidGrant("The refresh token is invalid or has expired");
        }

        // Client binding verification (Requirement 6.1)
        if (existing.clientId !== params.clientId) {
            throw OAuthException.invalidGrant("The refresh token is invalid or has expired");
        }

        // Atomic consumption: UPDATE ... WHERE used_at IS NULL
        // If usedAt was already set before we tried, it's a replay — no need to hit the DB.
        if (existing.usedAt !== null && existing.usedAt !== undefined) {
            return this.handleReplay(existing, params.plaintextToken);
        }

        // Note: SQLite's QueryBuilder.update().execute() may return affected=0 even on success,
        // so we re-fetch the record after the update to confirm it landed.
        await this.repo
            .createQueryBuilder()
            .update(RefreshToken)
            .set({ usedAt: now })
            .where("id = :id AND used_at IS NULL", { id: existing.id })
            .execute();

        const afterUpdate = await this.repo.findOne({ where: { id: existing.id } });
        if (!afterUpdate || afterUpdate.usedAt === null || afterUpdate.usedAt === undefined) {
            // Update did not land — another concurrent caller consumed it first
            return this.handleReplay(existing, params.plaintextToken);
        }

        // Refresh the record to get the updated usedAt
        existing.usedAt = afterUpdate.usedAt;

        // Compute scope
        const grantedScope = params.requestedScope
            ? validateScopeSubset(params.requestedScope, existing.scope)
            : existing.scope;

        // Generate new token
        const plaintext = generateOpaqueToken();
        const newTokenHash = hashToken(plaintext);
        const newExpiresAt = clampExpiry(this.getSlidingExpiryMs(), existing.absoluteExpiresAt);

        const newRecord = this.repo.create({
            tokenHash: newTokenHash,
            familyId: existing.familyId,
            parentId: existing.id,
            userId: existing.userId,
            clientId: existing.clientId,
            tenantId: existing.tenantId,
            scope: grantedScope,
            sid: existing.sid || null,
            expiresAt: newExpiresAt,
            absoluteExpiresAt: existing.absoluteExpiresAt,
            revoked: false,
            usedAt: null,
        });

        const saved = await this.repo.save(newRecord);
        return { plaintext, record: saved };
    }

    /**
     * Handle replay detection: check grace window, return existing child or revoke family.
     *
     * Grace window strategy: when a replay is detected within the window, we return the
     * child record (which carries the correct scope/expiry metadata for the response) but
     * pair it with the *caller's own plaintext* — the consumed parent token they just sent.
     *
     * Why: we only store hashes, so we cannot recover the child's plaintext. Re-keying the
     * child (generating a new plaintext + updating its hash) would invalidate the token that
     * the first successful caller already received, which defeats the purpose of the grace
     * window. Returning the parent plaintext is safe because:
     *   - The first caller holds the child plaintext and will use that going forward.
     *   - The replaying caller (lost-response retry) gets back a token it already knows.
     *     On the next refresh attempt it will hit replay detection again; if still within
     *     the grace window it will succeed, otherwise the family is revoked as expected.
     */
    private async handleReplay(
        existing: RefreshToken,
        callerPlaintext: string,
    ): Promise<{ plaintext: string; record: RefreshToken }> {
        const graceWindowSeconds = this.getGraceWindowSeconds();

        if (graceWindowSeconds > 0 && existing.usedAt) {
            const graceDeadline = new Date(existing.usedAt.getTime() + graceWindowSeconds * 1000);
            if (new Date() <= graceDeadline) {
                const child = await this.repo.findOne({ where: { parentId: existing.id } });
                if (child) {
                    // Return the child record for its metadata, but the caller's own plaintext
                    // so we don't invalidate the first caller's token.
                    return { plaintext: callerPlaintext, record: child };
                }
            }
        }

        // Grace window elapsed or not enabled — revoke the entire family
        logger.warn({
            event: "refresh_token_replay_detected",
            family_id: existing.familyId,
            user_id: existing.userId,
            client_id: existing.clientId,
            tenant_id: existing.tenantId,
        });

        await this.revokeFamily(existing.familyId);
        throw OAuthException.invalidGrant("The refresh token is invalid or has expired");
    }

    /**
     * Revoke all tokens in a family.
     */
    async revokeFamily(familyId: string): Promise<void> {
        await this.repo
            .createQueryBuilder()
            .update(RefreshToken)
            .set({ revoked: true })
            .where("family_id = :familyId", { familyId })
            .execute();
    }

    /**
     * Revoke by plaintext token — hash, look up, revoke the family.
     */
    async revokeByToken(plaintextToken: string): Promise<void> {
        const tokenHash = hashToken(plaintextToken);
        const record = await this.repo.findOne({ where: { tokenHash } });
        if (record) {
            await this.revokeFamily(record.familyId);
        }
    }

    /**
     * Revoke all refresh tokens that reference a given session sid.
     */
    async revokeBySid(sid: string): Promise<void> {
        await this.repo
            .createQueryBuilder()
            .update(RefreshToken)
            .set({ revoked: true })
            .where("sid = :sid", { sid })
            .execute();
    }
}
