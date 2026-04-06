import {Tenant} from "./tenant.entity";
import {User} from "./user.entity";
import {TenantMember} from "./tenant.members.entity";
import {Role} from "./role.entity";
import {UserRole} from "./user.roles.entity";
import {AuthCode} from "./auth_code.entity";
import {Group} from "./group.entity";
import {GroupRole} from "./group.roles.entity";
import {GroupUser} from "./group.users.entity";
import {Policy} from "./authorization.entity";
import {App} from "./app.entity";
import {Subscription} from "./subscription.entity";
import {TenantBits} from "./tenant-bits.entity";
import {Client} from "./client.entity";
import {RefreshToken} from "./refresh-token.entity";

export const entities = [
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
    App,
    Subscription,
    TenantBits,
    Client,
    RefreshToken
];
