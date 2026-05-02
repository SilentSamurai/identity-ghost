import {GroupRole} from "./group.roles.entity";
import {Role} from "./role.entity";
import {TenantMember} from "./tenant.members.entity";
import {Tenant} from "./tenant.entity";
import {User} from "./user.entity";
import {Group} from "./group.entity";
import {Policy} from "./authorization.entity";
import {App} from "./app.entity";
import {Client} from "./client.entity";

export class SubjectEnum {
    public static USER = User.name;
    public static TENANT = Tenant.name;
    public static MEMBER = TenantMember.name;
    public static ROLE = Role.name;
    public static GROUP = Group.name;
    public static GROUP_ROLE = GroupRole.name;
    public static POLICY = Policy.name;
    public static APPS = App.name;
    public static CLIENT = Client.name;

    public static entityMap = {
        Users: SubjectEnum.USER,
        Tenants: SubjectEnum.TENANT,
        TenantMembers: SubjectEnum.MEMBER,
        Roles: SubjectEnum.ROLE,
        Groups: SubjectEnum.GROUP,
        Apps: SubjectEnum.APPS,
        Clients: SubjectEnum.CLIENT
    };

    public static getSubject(entity: string): string {
        return SubjectEnum.entityMap[entity];
    }
}
