import {forwardRef, Module} from "@nestjs/common";
import {TypeOrmModule} from "@nestjs/typeorm";
import {Role} from "../entity/role.entity";
import {UserRole} from "../entity/user.roles.entity";
import {RoleService} from "./role.service";
import {UsersService} from "./users.service";
import {GroupService} from "./group.service";
import {TenantService} from "./tenant.service";
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
import {SubscriptionService} from "./subscription.service";
import {AppService} from "./app.service";
import {TenantBits} from "../entity/tenant-bits.entity";
import {TenantBitsService} from "./tenant-bits.service";
import {AuthModule} from "../auth/auth.module";
import {AppSubscriptionService} from "./app-subscription.service";
import {Client} from "../entity/client.entity";
import {ClientService} from "./client.service";

@Module(
    {
        imports: [
            TypeOrmModule.forFeature([Tenant, User, TenantMember, Role, UserRole, AuthCode, Group, GroupRole, GroupUser, App, Subscription, TenantBits, Client]),
            CaslModule,
            forwardRef(() => AuthModule),
        ],
        controllers: [],
        providers: [UsersService, GroupService, TenantService, RoleService, SubscriptionService, AppService, TenantBitsService, AppSubscriptionService, ClientService],
        exports: [UsersService, GroupService, TenantService, RoleService, SubscriptionService, AppService, TenantBitsService, AppSubscriptionService, ClientService]
    })
export class ServiceModule {
}
