import {Module} from "@nestjs/common";
import {TypeOrmModule} from "@nestjs/typeorm";
import {GroupService} from "./group.service";
import {Tenant} from "../entity/tenant.entity";
import {TenantMember} from "../entity/tenant.members.entity";
import {User} from "../entity/user.entity";
import {AuthCode} from "../entity/auth_code.entity";
import {Group} from "../entity/group.entity";
import {GroupRole} from "../entity/group.roles.entity";
import {GroupUser} from "../entity/group.users.entity";
import {CaslModule} from "../casl/casl.module";
import {App} from "../entity/app.entity";
import {Subscription} from "../entity/subscription.entity";
import {AppService} from "./app.service";
import {TenantBits} from "../entity/tenant-bits.entity";
import {TenantBitsService} from "./tenant-bits.service";
import {Client} from "../entity/client.entity";
import {ClientService} from "./client.service";
import {CoreModule} from "../core/core.module";
import {Role} from "../entity/role.entity";
import {UserRole} from "../entity/user.roles.entity";
import {TenantKey} from "../entity/tenant-key.entity";
import {JwksService} from "./jwks.service";

@Module(
    {
        imports: [
            TypeOrmModule.forFeature([Tenant, User, TenantMember, Role, UserRole, AuthCode, Group, GroupRole, GroupUser, App, Subscription, TenantBits, Client, TenantKey]),
            CaslModule,
            CoreModule,
        ],
        controllers: [],
        providers: [GroupService, AppService, TenantBitsService, ClientService, JwksService],
        exports: [GroupService, AppService, TenantBitsService, ClientService, CoreModule, JwksService],
    })
export class ServiceModule {
}
