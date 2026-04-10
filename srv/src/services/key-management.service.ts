import {Injectable, Logger, NotFoundException} from "@nestjs/common";
import {InjectRepository} from "@nestjs/typeorm";
import {DataSource, IsNull, Repository} from "typeorm";
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
        private readonly dataSource: DataSource,
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

    async rotateKey(tenantId: string): Promise<TenantKey> {
        return this.dataSource.transaction(async (manager) => {
            const isSqlite = this.dataSource.options.type === 'sqlite' || this.dataSource.options.type === 'better-sqlite3';

            let currentKey: TenantKey | null;

            if (isSqlite) {
                currentKey = await manager.findOne(TenantKey, {
                    where: {tenantId, isCurrent: true},
                });
            } else {
                const rows = await manager.query(
                    `SELECT * FROM tenant_keys WHERE tenant_id = $1 AND is_current = true FOR UPDATE`,
                    [tenantId],
                );
                currentKey = rows && rows.length > 0
                    ? manager.create(TenantKey, rows[0])
                    : null;
            }

            if (!currentKey) {
                throw new NotFoundException(`No current key found for tenant ${tenantId}`);
            }

            // Mark current key as superseded
            currentKey.isCurrent = false;
            currentKey.supersededAt = new Date();
            await manager.save(TenantKey, currentKey);

            // Generate new key pair
            const {publicKey, privateKey} = CryptUtil.generateKeyPair();
            const newVersion = currentKey.keyVersion + 1;
            const newKid = KidUtil.generate(tenantId, newVersion);

            const newKey = manager.create(TenantKey, {
                tenantId,
                keyVersion: newVersion,
                kid: newKid,
                publicKey,
                privateKey,
                isCurrent: true,
            });

            const savedKey = await manager.save(TenantKey, newKey);

            // Enforce max keys within the same transaction
            await this.enforceMaxKeysWithManager(tenantId, manager);

            return savedKey;
        });
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

    private async enforceMaxKeysWithManager(tenantId: string, manager: any): Promise<void> {
        const maxKeys = parseInt(
            Environment.get('JWKS_MAX_ACTIVE_KEYS_PER_TENANT', '3'),
            10,
        );

        const activeKeys = await manager.find(TenantKey, {
            where: {tenantId, deactivatedAt: IsNull()},
            order: {keyVersion: 'ASC'},
        });

        if (activeKeys.length > maxKeys) {
            const keysToDeactivate = activeKeys.slice(0, activeKeys.length - maxKeys);
            for (const key of keysToDeactivate) {
                key.deactivatedAt = new Date();
                await manager.save(TenantKey, key);
                this.logger.warn(
                    `Deactivated oldest active key for tenant ${tenantId}, key version ${key.keyVersion} (max active keys exceeded)`,
                );
            }
        }
    }
}
