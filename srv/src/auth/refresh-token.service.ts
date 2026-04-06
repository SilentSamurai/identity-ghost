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
    }): Promise<{ plaintext: string; record: RefreshToken }> {
        const plaintext = generateOpaqueToken();
        const tokenHash = hashToken(plaintext);
        const familyId = crypto.randomUUID();
        const now = new Date();
        const expiresAt = new Date(now.getTime() + this.getSlidingExpiryMs());
        const absoluteExpiresAt = new Date(now.getTime() + this.getAbsoluteExpiryMs());

        const record = this.repo.create({
            tokenHash,
            familyId,
            parentId: null,
            userId: params.userId,
            clientId: params.clientId,
            tenantId: params.tenantId,
            scope: params.scope,
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
        const updateResult = await this.repo
            .createQueryBuilder()
            .update(RefreshToken)
            .set({ usedAt: now })
            .where("id = :id AND used_at IS NULL", { id: existing.id })
            .execute();

        if (updateResult.affected === 0) {
            // Token was already used — replay detection
            return this.handleReplay(existing);
        }

        // Refresh the record to get the updated usedAt
        existing.usedAt = now;

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
     */
    private async handleReplay(existing: RefreshToken): Promise<{ plaintext: string; record: RefreshToken }> {
        const graceWindowSeconds = this.getGraceWindowSeconds();

        if (graceWindowSeconds > 0 && existing.usedAt) {
            const graceDeadline = new Date(existing.usedAt.getTime() + graceWindowSeconds * 1000);
            if (new Date() <= graceDeadline) {
                // Within grace window — return the existing child token (idempotent)
                const child = await this.repo.findOne({ where: { parentId: existing.id } });
                if (child) {
                    // We cannot return the plaintext of the child since we only store the hash.
                    // The grace window returns the same child record; the client should already have the plaintext.
                    // Per the design, we return the existing child — but we need a new plaintext for it.
                    // Actually, the grace window means we return the same child token that was already issued.
                    // Since we can't recover the plaintext, we generate a new token for the child and update its hash.
                    // However, the design says "return the same child token" — meaning the same record.
                    // The correct approach: generate a fresh plaintext that maps to the child, update the child's hash.
                    // But that would break if the client already stored the previous plaintext.
                    // The simplest correct approach: return the child record as-is. The client should use the
                    // plaintext from the first response. But since this is a retry scenario (lost response),
                    // we need to give them a working token. So we re-key the child.
                    const newPlaintext = generateOpaqueToken();
                    const newHash = hashToken(newPlaintext);
                    await this.repo.update(child.id, { tokenHash: newHash });
                    child.tokenHash = newHash;
                    return { plaintext: newPlaintext, record: child };
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
}
