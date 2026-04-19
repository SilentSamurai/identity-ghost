import {Injectable, Logger} from "@nestjs/common";
import {InjectRepository} from "@nestjs/typeorm";
import {Repository} from "typeorm";
import {Client} from "../entity/client.entity";
import {Environment} from "../config/environment.service";

@Injectable()
export class CorsOriginService {
    private readonly logger = new Logger(CorsOriginService.name);
    private cachedOrigins: Set<string> | null = null;
    private cacheExpiresAt: number = 0;
    private readonly cacheTtlMs: number;

    constructor(
        @InjectRepository(Client)
        private readonly clientRepository: Repository<Client>,
        private readonly environment: Environment,
    ) {
        this.cacheTtlMs = parseInt(
            this.environment.get("CORS_CACHE_TTL_SECONDS", "60"),
            10,
        ) * 1000;
    }

    /**
     * Extract origin (scheme + host + port if non-default) from a URI.
     * Returns null for malformed URIs.
     */
    static extractOrigin(uri: string): string | null {
        try {
            const url = new URL(uri);
            return url.origin;
        } catch (error) {
            // Any error during URL parsing means the URI is malformed
            return null;
        }
    }

    /**
     * Check if an origin is allowed for sensitive endpoints.
     */
    async isAllowedOrigin(origin: string): Promise<boolean> {
        const now = Date.now();
        if (!this.cachedOrigins || now >= this.cacheExpiresAt) {
            this.cachedOrigins = await this.refreshCache();
            this.cacheExpiresAt = now + this.cacheTtlMs;
        }
        return this.cachedOrigins.has(origin);
    }

    /**
     * Rebuild the cached origin set from all Client redirect_uris.
     */
    private async refreshCache(): Promise<Set<string>> {
        const clients = await this.clientRepository.find({
            select: ["redirectUris"],
        });

        const origins = new Set<string>();

        for (const client of clients) {
            if (!client.redirectUris || client.redirectUris.length === 0) {
                continue;
            }

            for (const uri of client.redirectUris) {
                const origin = CorsOriginService.extractOrigin(uri);
                if (origin === null) {
                    this.logger.warn(
                        `Malformed redirect URI encountered: ${uri}. Skipping.`,
                    );
                    continue;
                }
                origins.add(origin);
            }
        }

        this.logger.log(`CORS origin cache refreshed with ${origins.size} origins`);
        return origins;
    }
}
