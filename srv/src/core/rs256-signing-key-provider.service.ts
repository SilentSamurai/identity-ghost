import {Injectable, NotFoundException} from "@nestjs/common";
import {InjectRepository} from "@nestjs/typeorm";
import {IsNull, Repository} from "typeorm";
import {TenantKey} from "../entity/tenant-key.entity";
import {CryptUtil} from "../util/crypt.util";
import {SigningKeyProvider} from "./token-abstraction";

@Injectable()
export class RS256SigningKeyProvider implements SigningKeyProvider {
    constructor(
        @InjectRepository(TenantKey)
        private readonly tenantKeyRepository: Repository<TenantKey>
    ) {
    }

    generateKeyPair(): { privateKey: string; publicKey: string } {
        return CryptUtil.generateKeyPair();
    }

    async getPrivateKey(tenantId: string): Promise<string> {
        const tenantKey = await this.tenantKeyRepository.findOne({
            where: {tenantId, isCurrent: true},
            select: ['id', 'privateKey']
        });
        if (!tenantKey) {
            throw new NotFoundException(`No current key found for tenant ${tenantId}`);
        }
        return tenantKey.privateKey;
    }

    async getPublicKey(tenantId: string): Promise<string> {
        const tenantKey = await this.tenantKeyRepository.findOne({
            where: {tenantId, isCurrent: true},
            select: ['id', 'publicKey'],
            order: {keyVersion: 'DESC'},
        });
        if (!tenantKey) {
            throw new NotFoundException(`No current key found for tenant ${tenantId}`);
        }
        return tenantKey.publicKey;
    }

    async getSigningKeyWithKid(tenantId: string): Promise<{ privateKey: string; kid: string }> {
        const tenantKey = await this.tenantKeyRepository.findOne({
            where: {tenantId, isCurrent: true},
            select: ['id', 'privateKey', 'kid']
        });
        if (!tenantKey) {
            throw new NotFoundException(`No current key found for tenant ${tenantId}`);
        }
        return {privateKey: tenantKey.privateKey, kid: tenantKey.kid};
    }

    async getPublicKeyByKid(kid: string): Promise<string> {
        const tenantKey = await this.tenantKeyRepository.findOne({
            where: {kid, deactivatedAt: IsNull()},
            select: ['id', 'publicKey']
        });
        if (!tenantKey) {
            throw new NotFoundException(`No active key found for kid ${kid}`);
        }
        return tenantKey.publicKey;
    }
}
