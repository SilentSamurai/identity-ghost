import {
    ClassSerializerInterceptor,
    Controller,
    Get,
    Query,
    UseGuards,
    UseInterceptors,
} from "@nestjs/common";
import {InjectRepository} from "@nestjs/typeorm";
import {Repository} from "typeorm";
import {JwtAuthGuard} from "../auth/jwt-auth.guard";
import {SuperAdminGuard} from "../auth/super-admin.guard";
import {TenantKey} from "../entity/tenant-key.entity";
import {Environment} from "../config/environment.service";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Controller("api/admin/keys")
@UseInterceptors(ClassSerializerInterceptor)
@UseGuards(JwtAuthGuard, SuperAdminGuard)
export class AdminKeysController {

    constructor(
        @InjectRepository(TenantKey)
        private readonly tenantKeyRepository: Repository<TenantKey>,
    ) {}

    @Get("")
    async getAllKeys(
        @Query("status") status?: string,
        @Query("tenantId") tenantId?: string,
    ): Promise<{
        keys: any[];
        maxActiveKeys: number;
        tokenExpirationSeconds: number;
    }> {
        const qb = this.tenantKeyRepository
            .createQueryBuilder("key")
            .innerJoinAndSelect("key.tenant", "tenant")
            .select([
                "key.id",
                "key.keyVersion",
                "key.kid",
                "key.isCurrent",
                "key.createdAt",
                "key.supersededAt",
                "key.deactivatedAt",
                "tenant.id",
                "tenant.name",
                "tenant.domain",
            ]);

        // Apply status filter
        if (status === "current") {
            qb.andWhere("key.isCurrent = :isCurrent", {isCurrent: true});
        } else if (status === "active") {
            qb.andWhere("key.deactivatedAt IS NULL")
              .andWhere("key.isCurrent = :isCurrent", {isCurrent: false});
        } else if (status === "deactivated") {
            qb.andWhere("key.deactivatedAt IS NOT NULL");
        }
        // "all" or unknown values → no filter

        // Apply tenantId filter if provided and valid UUID
        if (tenantId && UUID_REGEX.test(tenantId)) {
            qb.andWhere("key.tenantId = :tenantId", {tenantId});
        }

        qb.orderBy("key.createdAt", "DESC");

        const keys = await qb.getMany();

        const maxActiveKeys = Number(Environment.get("JWKS_MAX_ACTIVE_KEYS_PER_TENANT", 3));
        const tokenExpirationSeconds = Number(Environment.get("TOKEN_EXPIRATION_TIME_IN_SECONDS", 3600));

        return {keys, maxActiveKeys, tokenExpirationSeconds};
    }
}
