import {Injectable} from "@nestjs/common";
import {InjectRepository} from "@nestjs/typeorm";
import {IsNull, Repository} from "typeorm";
import {OnEvent} from "@nestjs/event-emitter";
import {createHash, createPublicKey} from "crypto";
import {TenantKey} from "../entity/tenant-key.entity";
import {Environment} from "../config/environment.service";

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
    private cache: Map<string, { body: string; etag: string; expiresAt: number }> = new Map();

    constructor(
        @InjectRepository(TenantKey)
        private readonly tenantKeyRepository: Repository<TenantKey>,
    ) {}

    async getJwks(tenantId: string): Promise<{ body: string; etag: string }> {
        const cached = this.cache.get(tenantId);
        if (cached && cached.expiresAt > Date.now()) {
            return {body: cached.body, etag: cached.etag};
        }

        const activeKeys = await this.tenantKeyRepository.find({
            where: {tenantId, deactivatedAt: IsNull()},
            order: {keyVersion: "ASC"},
        });

        const jwks = activeKeys.map((key) => this.pemToJwk(key.publicKey, key.kid));
        const body = JSON.stringify({keys: jwks});

        const etag = `"${createHash("sha256").update(body).digest("hex")}"`;

        const maxAgeSeconds = parseInt(
            Environment.get("JWKS_CACHE_MAX_AGE_SECONDS", "300"),
            10,
        );

        this.cache.set(tenantId, {
            body,
            etag,
            expiresAt: Date.now() + maxAgeSeconds * 1000,
        });

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

    invalidateCache(tenantId: string): void {
        this.cache.delete(tenantId);
    }

    @OnEvent("key.rotated")
    handleKeyRotated(payload: { tenantId: string }): void {
        this.invalidateCache(payload.tenantId);
    }
}
