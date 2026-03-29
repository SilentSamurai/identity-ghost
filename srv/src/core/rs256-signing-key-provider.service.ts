import {Injectable, NotFoundException} from "@nestjs/common";
import {InjectRepository} from "@nestjs/typeorm";
import {Repository} from "typeorm";
import {Tenant} from "../entity/tenant.entity";
import {CryptUtil} from "../util/crypt.util";
import {SigningKeyProvider} from "./token-abstraction";

@Injectable()
export class RS256SigningKeyProvider implements SigningKeyProvider {
    constructor(
        @InjectRepository(Tenant)
        private readonly tenantRepository: Repository<Tenant>
    ) {
    }

    generateKeyPair(): { privateKey: string; publicKey: string } {
        return CryptUtil.generateKeyPair();
    }

    async getPrivateKey(tenantId: string): Promise<string> {
        const tenant = await this.tenantRepository.findOne({
            where: { id: tenantId },
            select: ['id', 'privateKey']
        });
        if (!tenant) {
            throw new NotFoundException(`Tenant with ID ${tenantId} not found`);
        }
        return tenant.privateKey;
    }

    async getPublicKey(tenantId: string): Promise<string> {
        const tenant = await this.tenantRepository.findOne({
            where: { id: tenantId },
            select: ['id', 'publicKey']
        });
        if (!tenant) {
            throw new NotFoundException(`Tenant with ID ${tenantId} not found`);
        }
        return tenant.publicKey;
    }
}
