import {Module} from "@nestjs/common";
import {TypeOrmModule} from "@nestjs/typeorm";
import {ConfigModule} from "../config/config.module";
import {CaslModule} from "../casl/casl.module";
import {User} from "../entity/user.entity";
import {Tenant} from "../entity/tenant.entity";
import {TenantMember} from "../entity/tenant.members.entity";
import {Role} from "../entity/role.entity";
import {UserRole} from "../entity/user.roles.entity";
import {App} from "../entity/app.entity";
import {Subscription} from "../entity/subscription.entity";
import {UsersService} from "../services/users.service";
import {TenantService} from "../services/tenant.service";
import {RoleService} from "../services/role.service";
import {SubscriptionService} from "../services/subscription.service";
import {AppSubscriptionService} from "../services/app-subscription.service";
import {JwtServiceHS256, JwtServiceRS256} from "../auth/jwt.service";
import {TechnicalTokenService} from "./technical-token.service";

@Module({
    imports: [
        ConfigModule,
        CaslModule,
        TypeOrmModule.forFeature([User, Tenant, TenantMember, Role, UserRole, App, Subscription]),
    ],
    providers: [
        UsersService,
        TenantService,
        RoleService,
        SubscriptionService,
        AppSubscriptionService,
        JwtServiceHS256,
        JwtServiceRS256,
        TechnicalTokenService,
    ],
    exports: [
        UsersService,
        TenantService,
        RoleService,
        SubscriptionService,
        AppSubscriptionService,
        JwtServiceHS256,
        JwtServiceRS256,
        TechnicalTokenService,
        TypeOrmModule,
    ],
})
export class CoreModule {
}
