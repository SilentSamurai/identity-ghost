import {Injectable} from "@nestjs/common";
import {InjectRepository} from "@nestjs/typeorm";
import {IsNull, Repository} from "typeorm";
import {createHash, createPublicKey} from "crypto";
import {TenantKey} from "../entity/tenant-key.entity";

interface JwkObject {
    kty: "RSA";
    alg: "RS256";
    use: "sig";
    kid: string;
    n: string;
    e: string;
}

@Injectable()
export class JwksService {

    constructor(
        @InjectRepository(TenantKey)
        private readonly tenantKeyRepository: Repository<TenantKey>,
    ) {}

    async getJwks(tenantId: string): Promise<{ body: string; etag: string }> {
        const activeKeys = await this.tenantKeyRepository.find({
            where: {tenantId, deactivatedAt: IsNull()},
            order: {keyVersion: "ASC"},
        });

        const jwks = activeKeys.map((key) => this.pemToJwk(key.publicKey, key.kid));
        const body = JSON.stringify({keys: jwks});

        const etag = `"${createHash("sha256").update(body).digest("hex")}"`;

        return {body, etag};
    }

    pemToJwk(pem: string, kid: string): JwkObject {
        const keyObject = createPublicKey(pem);
        const exported = keyObject.export({format: "jwk"});
        return {
            kty: "RSA",
            alg: "RS256",
            use: "sig",
            kid,
            n: exported.n as string,
            e: exported.e as string,
        };
    }
}
