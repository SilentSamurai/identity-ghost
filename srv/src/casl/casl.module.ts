import {Module} from "@nestjs/common";
import {TypeOrmModule} from "@nestjs/typeorm";
import {Role} from "../entity/role.entity";
import {UserRole} from "../entity/user.roles.entity";
import {CaslAbilityFactory} from "./casl-ability.factory";
import {ConfigModule} from "../config/config.module";
import {SecurityService} from "./security.service";
import {AuthUserService} from "./authUser.service";
import {Tenant} from "../entity/tenant.entity";
import {User} from "../entity/user.entity";
import {TenantMember} from "../entity/tenant.members.entity";
import {AuthCode} from "../entity/auth_code.entity";
import {Group} from "../entity/group.entity";
import {GroupRole} from "../entity/group.roles.entity";
import {GroupUser} from "../entity/group.users.entity";
import {Policy} from "../entity/authorization.entity";
import {PolicyService} from "./policy.service";
import {CacheService} from "./cache.service";
import {ScopeResolverService} from "./scope-resolver.service";

@Module({
    imports: [
        ConfigModule,
        TypeOrmModule.forFeature([
            Tenant,
            User,
            TenantMember,
            Role,
            UserRole,
            AuthCode,
            Group,
            GroupRole,
            GroupUser,
            Policy,
        ]),
    ],
    controllers: [],
    providers: [
        SecurityService,
        CaslAbilityFactory,
        AuthUserService,
        PolicyService,
        CacheService,
        ScopeResolverService,
    ],
    exports: [
        SecurityService,
        CaslAbilityFactory,
        AuthUserService,
        PolicyService,
        CacheService,
        ScopeResolverService,
    ],
})
export class CaslModule {
}
