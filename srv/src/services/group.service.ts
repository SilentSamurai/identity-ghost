import {BadRequestException, Injectable} from "@nestjs/common";
import {Environment} from "../config/environment.service";
import {UsersService} from "./users.service";
import {InjectRepository} from "@nestjs/typeorm";
import {Repository} from "typeorm";
import {Tenant} from "../entity/tenant.entity";
import {Group} from "../entity/group.entity";
import {GroupUser} from "../entity/group.users.entity";
import {GroupRole} from "../entity/group.roles.entity";
import {RoleService} from "./role.service";
import {User} from "../entity/user.entity";
import {Role} from "../entity/role.entity";
import {TenantService} from "./tenant.service";
import {AuthContext} from "../casl/contexts";
import {SecurityService} from "../casl/security.service";
import {Action} from "../casl/actions.enum";
import {SubjectEnum} from "../entity/subjectEnum";

@Injectable()
export class GroupService {
    constructor(
        private readonly configService: Environment,
        private readonly usersService: UsersService,
        private readonly roleService: RoleService,
        private readonly tenantService: TenantService,
        private readonly securityService: SecurityService,
        @InjectRepository(Group) private groupRepository: Repository<Group>,
        @InjectRepository(GroupUser)
        private groupUserRepository: Repository<GroupUser>,
        @InjectRepository(GroupRole)
        private groupRoleRepository: Repository<GroupRole>,
    ) {
    }

    async create(
        authContext: AuthContext,
        name: string,
        tenant: Tenant,
    ): Promise<Group> {
        this.securityService.isAuthorized(
            authContext,
            Action.Create,
            SubjectEnum.GROUP,
            {tenantId: tenant.id},
        );
        let group: Group = this.groupRepository.create({
            name: name,
            tenant: tenant,
        });
        return await this.groupRepository.save(group);
    }

    async findById(authContext: AuthContext, id: string): Promise<Group> {
        this.securityService.isAuthorized(
            authContext,
            Action.Read,
            SubjectEnum.GROUP,
            {id},
        );
        let group: Group = await this.groupRepository.findOne({
            where: {id: id},
            relations: ["tenant"],
        });
        if (group === null) {
            throw new BadRequestException("group not found");
        }
        return group;
    }

    async findByTenantId(
        authContext: AuthContext,
        tenantId: string,
    ): Promise<Group[]> {
        this.securityService.isAuthorized(
            authContext,
            Action.Read,
            SubjectEnum.GROUP,
            {tenantId: tenantId},
        );
        return await this.groupRepository.findBy({
            tenantId: tenantId,
        });
    }

    async findByNameAndTenantId(
        authContext: AuthContext,
        name: string,
        tenantId: string,
    ): Promise<Group> {
        let group: Group = await this.groupRepository.findOne({
            where: {
                name: name,
                tenantId: tenantId,
            },
            relations: ["tenant"],
        });
        if (group === null) {
            throw new BadRequestException("group not found");
        }
        this.securityService.isAuthorized(
            authContext,
            Action.Read,
            SubjectEnum.GROUP,
            {id: group.id},
        );
        return group;
    }

    async existsByNameAndTenantId(
        authContext: AuthContext,
        name: string,
        tenantId: string,
    ): Promise<boolean> {
        this.securityService.isAuthorized(
            authContext,
            Action.Read,
            SubjectEnum.GROUP,
        );
        return await this.groupRepository.exists({
            where: {
                name: name,
                tenantId: tenantId,
            },
            relations: ["tenant"],
        });
    }

    async deleteById(authContext: AuthContext, id: string): Promise<Group> {
        let group: Group = await this.findById(authContext, id);
        let roles = await this.findGroupRoles(authContext, group);
        await this.removeRoles(
            authContext,
            group,
            roles.map((r) => r.name),
        );
        let users = await this.findGroupUsers(authContext, group);
        await this.removeUser(
            authContext,
            group,
            users.map((u) => u.email),
        );

        this.securityService.isAuthorized(
            authContext,
            Action.Delete,
            SubjectEnum.GROUP,
            {id: id},
        );
        await this.groupRepository.remove(group);

        return group;
    }

    async isRoleInGroup(
        authContext: AuthContext,
        group: Group,
        role: Role,
    ): Promise<boolean> {
        this.securityService.isAuthorized(
            authContext,
            Action.Read,
            SubjectEnum.GROUP_ROLE,
            {
                groupId: group.id,
                roleId: role.id,
            },
        );

        return await this.groupRoleRepository.exists({
            where: {
                groupId: group.id,
                tenantId: group.tenantId,
                roleId: role.id,
            },
        });
    }

    async findGroupRole(
        authContext: AuthContext,
        group: Group,
        role: Role,
    ): Promise<GroupRole> {
        this.securityService.isAuthorized(
            authContext,
            Action.Read,
            SubjectEnum.GROUP,
            {
                id: group.id,
            },
        );

        return await this.groupRoleRepository.findOne({
            where: {
                groupId: group.id,
                tenantId: group.tenantId,
                roleId: role.id,
            },
        });
    }

    async isUserInGroup(
        authContext: AuthContext,
        group: Group,
        user: User,
    ): Promise<boolean> {
        this.securityService.isAuthorized(
            authContext,
            Action.Read,
            SubjectEnum.GROUP,
            {
                id: group.id,
            },
        );

        return await this.groupUserRepository.exists({
            where: {
                groupId: group.id,
                tenantId: group.tenantId,
                userId: user.id,
            },
        });
    }

    async findGroupUser(
        authContext: AuthContext,
        group: Group,
        user: User,
    ): Promise<GroupUser> {
        this.securityService.isAuthorized(
            authContext,
            Action.Read,
            SubjectEnum.GROUP,
            {
                id: group.id,
            },
        );

        return await this.groupUserRepository.findOne({
            where: {
                groupId: group.id,
                tenantId: group.tenantId,
                userId: user.id,
            },
        });
    }

    async findGroupUsers(
        authContext: AuthContext,
        group: Group,
    ): Promise<User[]> {
        this.securityService.isAuthorized(
            authContext,
            Action.Read,
            SubjectEnum.GROUP,
            {
                id: group.id,
            },
        );

        let groupUsers = await this.groupUserRepository.find({
            where: {groupId: group.id},
        });
        let users = await Promise.all(
            groupUsers.map(
                async (gu) =>
                    await this.usersService.findById(authContext, gu.userId),
            ),
        );
        return users;
    }

    public async findGroupRoles(
        authContext: AuthContext,
        group: Group,
    ): Promise<Role[]> {
        this.securityService.isAuthorized(
            authContext,
            Action.Read,
            SubjectEnum.GROUP,
            {
                id: group.id,
            },
        );

        let groupRoles = await this.groupRoleRepository.find({
            where: {groupId: group.id},
        });
        let roles = await Promise.all(
            groupRoles.map(
                async (gr) =>
                    await this.roleService.findById(authContext, gr.roleId),
            ),
        );
        return roles;
    }

    async addRoles(authContext: AuthContext, group: Group, roles: string[]) {
        this.securityService.isAuthorized(
            authContext,
            Action.Update,
            SubjectEnum.GROUP,
            {
                id: group.id,
            },
        );

        let oRole = [];
        let tenant = await this.tenantService.findById(
            authContext,
            group.tenantId,
        );
        for (let role_name of roles) {
            let role = await this.roleService.findByNameAndTenant(
                authContext,
                role_name,
                group.tenant,
            );
            if (!(await this.isRoleInGroup(authContext, group, role))) {
                let groupRole = this.groupRoleRepository.create({
                    groupId: group.id,
                    tenantId: group.tenantId,
                    roleId: role.id,
                });
                await this.groupRoleRepository.save(groupRole);
                oRole.push(role);
            }
        }
        let users = await this.findGroupUsers(authContext, group);
        for (const user of users) {
            await this.roleService.addRoles(
                authContext,
                user,
                group.tenant,
                oRole,
                true,
            );
        }
    }

    async removeRoles(authContext: AuthContext, group: Group, roles: string[]) {
        this.securityService.isAuthorized(
            authContext,
            Action.Update,
            SubjectEnum.GROUP,
            {
                id: group.id,
            },
        );

        let oRole = [];
        for (let role_name of roles) {
            let role = await this.roleService.findByNameAndTenant(
                authContext,
                role_name,
                group.tenant,
            );
            if (await this.isRoleInGroup(authContext, group, role)) {
                let gr = await this.findGroupRole(authContext, group, role);
                await this.groupRoleRepository.remove(gr);
                oRole.push(role);
            }
        }
        let users = await this.findGroupUsers(authContext, group);
        for (const user of users) {
            await this.roleService.removeRoles(
                authContext,
                user,
                group.tenant,
                oRole,
                true,
            );
        }
    }

    async addUser(authContext: AuthContext, group: Group, users: string[]) {
        this.securityService.isAuthorized(
            authContext,
            Action.Update,
            SubjectEnum.GROUP,
            {
                id: group.id,
            },
        );

        let oUser = [];
        for (let email of users) {
            let user = await this.usersService.findByEmail(authContext, email);
            if (!(await this.isUserInGroup(authContext, group, user))) {
                let gu = this.groupUserRepository.create({
                    groupId: group.id,
                    tenantId: group.tenantId,
                    userId: user.id,
                });
                gu = await this.groupUserRepository.save(gu);
                oUser.push(user);
            }
        }
        let roles = await this.findGroupRoles(authContext, group);
        for (let user of oUser) {
            await this.roleService.addRoles(
                authContext,
                user,
                group.tenant,
                roles,
                true,
            );
        }
    }

    async removeUser(authContext: AuthContext, group: Group, users: string[]) {
        this.securityService.isAuthorized(
            authContext,
            Action.Update,
            SubjectEnum.GROUP,
            {
                id: group.id,
            },
        );

        let oUser = [];
        for (let email of users) {
            let user = await this.usersService.findByEmail(authContext, email);
            if (await this.isUserInGroup(authContext, group, user)) {
                let gu = await this.findGroupUser(authContext, group, user);
                await this.groupUserRepository.remove(gu);
                oUser.push(user);
            }
        }
        let roles = await this.findGroupRoles(authContext, group);
        for (let user of oUser) {
            await this.roleService.removeRoles(
                authContext,
                user,
                group.tenant,
                roles,
                true,
            );
        }
    }

    async updateGroup(
        authContext: AuthContext,
        group: Group,
        body: { name: string },
    ) {
        this.securityService.isAuthorized(
            authContext,
            Action.Update,
            SubjectEnum.GROUP,
            {
                id: group.id,
            },
        );

        if (
            !(await this.existsByNameAndTenantId(
                authContext,
                body.name,
                group.tenantId,
            ))
        ) {
            group.name = body.name;
            await this.groupRepository.save(group);
        } else {
            throw new BadRequestException("group already exists!");
        }
    }
}
