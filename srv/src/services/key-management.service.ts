import {Injectable, Logger, NotFoundException} from "@nestjs/common";
import {InjectRepository} from "@nestjs/typeorm";
import {IsNull, Repository} from "typeorm";
import {Cron} from "@nestjs/schedule";
import {TenantKey} from "../entity/tenant-key.entity";
import {KidUtil} from "../util/kid.util";
import {CryptUtil} from "../util/crypt.util";
import {Environment} from "../config/environment.service";

@Injectable()
export class KeyManagementService {
    private readonly logger = new Logger(KeyManagementService.name);

    constructor(
        @InjectRepository(TenantKey)
        private readonly tenantKeyRepository: Repository<TenantKey>,
    ) {}

    async createInitialKey(tenantId: string, publicKey: string, privateKey: string): Promise<TenantKey> {
        const key = this.tenantKeyRepository.create({
            tenantId,
            keyVersion: 1,
            kid: KidUtil.generate(tenantId, 1),
            publicKey,
            privateKey,
            isCurrent: true,
        });
        return this.tenantKeyRepository.save(key);
    }

    async getCurrentSigningKey(tenantId: string): Promise<{ privateKey: string; kid: string }> {
        const tenantKey = await this.tenantKeyRepository.findOne({
            where: {tenantId, isCurrent: true},
            select: ['id', 'privateKey', 'kid'],
        });
        if (!tenantKey) {
            throw new NotFoundException(`No current key found for tenant ${tenantId}`);
        }
        return {privateKey: tenantKey.privateKey, kid: tenantKey.kid};
    }

    async getPublicKeyByKid(kid: string): Promise<string> {
        const tenantKey = await this.tenantKeyRepository.findOne({
            where: {kid, deactivatedAt: IsNull()},
            select: ['id', 'publicKey'],
        });
        if (!tenantKey) {
            throw new NotFoundException(`No active key found for kid ${kid}`);
        }
        return tenantKey.publicKey;
    }

    /**
     * Rotate the signing key for a tenant.
     *
     * Uses atomic UPDATE … WHERE is_current = true as a compare-and-swap
     * instead of an explicit transaction. Each individual write is atomic
     * in both PostgreSQL and SQLite, avoiding the "cannot start a transaction
     * within a transaction" error that SQLite raises under concurrent access.
     */
    async rotateKey(tenantId: string): Promise<TenantKey> {
        const now = new Date();

        // Step 1: Atomically supersede the current key.
        // The WHERE is_current = true clause acts as a compare-and-swap —
        // only one concurrent caller can succeed.
        const superseded = await this.tenantKeyRepository
            .createQueryBuilder()
            .update(TenantKey)
            .set({isCurrent: false, supersededAt: now})
            .where('tenant_id = :tenantId AND is_current = :isCurrent', {
                tenantId,
                isCurrent: true,
            })
            .execute();

        if (!superseded.affected || superseded.affected === 0) {
            throw new NotFoundException(`No current key found for tenant ${tenantId}`);
        }

        // Step 2: Find the highest version for this tenant to compute the next one.
        const previousKey = await this.tenantKeyRepository.findOne({
            where: {tenantId},
            select: ['id', 'keyVersion'],
            order: {keyVersion: 'DESC'},
        });

        const previousVersion = previousKey?.keyVersion ?? 0;

        // Step 3: Generate and insert the new current key.
        const {publicKey, privateKey} = CryptUtil.generateKeyPair();
        const newVersion = previousVersion + 1;
        const newKid = KidUtil.generate(tenantId, newVersion);

        const newKey = this.tenantKeyRepository.create({
            tenantId,
            keyVersion: newVersion,
            kid: newKid,
            publicKey,
            privateKey,
            isCurrent: true,
        });

        const savedKey = await this.tenantKeyRepository.save(newKey);

        // Step 4: Enforce max active keys.
        await this.enforceMaxKeys(tenantId);

        return savedKey;
    }

    @Cron(process.env.JWKS_CLEANUP_CRON ?? '0 * * * * *')
    async deactivateExpiredKeys(): Promise<void> {
        const tokenExpirationSeconds = parseInt(
            Environment.get('TOKEN_EXPIRATION_TIME_IN_SECONDS', '3600'),
            10,
        );

        // Find keys that are superseded and past the overlap window
        const expiredKeys = await this.tenantKeyRepository
            .createQueryBuilder('tk')
            .where('tk.is_current = :isCurrent', {isCurrent: false})
            .andWhere('tk.superseded_at IS NOT NULL')
            .andWhere('tk.deactivated_at IS NULL')
            .getMany();

        const now = new Date();

        for (const key of expiredKeys) {
            const supersededAt = new Date(key.supersededAt);
            const expiryTime = new Date(supersededAt.getTime() + tokenExpirationSeconds * 1000);

            if (expiryTime < now) {
                await this.tenantKeyRepository.update(key.id, {
                    deactivatedAt: now,
                });
            }
        }
    }

    private async enforceMaxKeys(tenantId: string): Promise<void> {
        const maxKeys = parseInt(
            Environment.get('JWKS_MAX_ACTIVE_KEYS_PER_TENANT', '3'),
            10,
        );

        const activeKeys = await this.tenantKeyRepository.find({
            where: {tenantId, deactivatedAt: IsNull()},
            order: {keyVersion: 'ASC'},
        });

        if (activeKeys.length > maxKeys) {
            const keysToDeactivate = activeKeys.slice(0, activeKeys.length - maxKeys);
            for (const key of keysToDeactivate) {
                await this.tenantKeyRepository.update(key.id, {
                    deactivatedAt: new Date(),
                });
                this.logger.warn(
                    `Deactivated oldest active key for tenant ${tenantId}, key version ${key.keyVersion} (max active keys exceeded)`,
                );
            }
        }
    }
}
