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
import {Action} from "../casl/actions.enum";
import {SubjectEnum} from "../entity/subjectEnum";
import {Permission} from "../auth/auth.decorator";

@Injectable()
export class GroupService {
    constructor(
        private readonly configService: Environment,
        private readonly usersService: UsersService,
        private readonly roleService: RoleService,
        private readonly tenantService: TenantService,
        @InjectRepository(Group) private groupRepository: Repository<Group>,
        @InjectRepository(GroupUser)
        private groupUserRepository: Repository<GroupUser>,
        @InjectRepository(GroupRole)
        private groupRoleRepository: Repository<GroupRole>,
    ) {
    }

    async create(
        permission: Permission,
        name: string,
        tenant: Tenant,
    ): Promise<Group> {
        permission.isAuthorized(
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

    async findById(permission: Permission, id: string): Promise<Group> {
        permission.isAuthorized(
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
        permission: Permission,
        tenantId: string,
    ): Promise<Group[]> {
        permission.isAuthorized(
            Action.Read,
            SubjectEnum.GROUP,
            {tenantId: tenantId},
        );
        return await this.groupRepository.findBy({
            tenantId: tenantId,
        });
    }

    async findByNameAndTenantId(
        permission: Permission,
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
        permission.isAuthorized(
            Action.Read,
            SubjectEnum.GROUP,
            {id: group.id},
        );
        return group;
    }

    async existsByNameAndTenantId(
        permission: Permission,
        name: string,
        tenantId: string,
    ): Promise<boolean> {
        permission.isAuthorized(
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

    async deleteById(permission: Permission, id: string): Promise<Group> {
        let group: Group = await this.findById(permission, id);
        let roles = await this.findGroupRoles(permission, group);
        await this.removeRoles(
            permission,
            group,
            roles.map((r) => r.name),
        );
        let users = await this.findGroupUsers(permission, group);
        await this.removeUser(
            permission,
            group,
            users.map((u) => u.email),
        );

        permission.isAuthorized(
            Action.Delete,
            SubjectEnum.GROUP,
            {id: id},
        );
        await this.groupRepository.remove(group);

        return group;
    }

    async isRoleInGroup(
        permission: Permission,
        group: Group,
        role: Role,
    ): Promise<boolean> {
        permission.isAuthorized(
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
        permission: Permission,
        group: Group,
        role: Role,
    ): Promise<GroupRole> {
        permission.isAuthorized(
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
        permission: Permission,
        group: Group,
        user: User,
    ): Promise<boolean> {
        permission.isAuthorized(
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
        permission: Permission,
        group: Group,
        user: User,
    ): Promise<GroupUser> {
        permission.isAuthorized(
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
        permission: Permission,
        group: Group,
    ): Promise<User[]> {
        permission.isAuthorized(
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
                    await this.usersService.findById(permission, gu.userId),
            ),
        );
        return users;
    }

    public async findGroupRoles(
        permission: Permission,
        group: Group,
    ): Promise<Role[]> {
        permission.isAuthorized(
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
                    await this.roleService.findById(permission, gr.roleId),
            ),
        );
        return roles;
    }

    async addRoles(permission: Permission, group: Group, roles: string[]) {
        permission.isAuthorized(
            Action.Update,
            SubjectEnum.GROUP,
            {
                id: group.id,
            },
        );

        let oRole = [];
        let tenant = await this.tenantService.findById(
            permission,
            group.tenantId,
        );
        for (let role_name of roles) {
            let role = await this.roleService.findByNameAndTenant(
                permission,
                role_name,
                group.tenant,
            );
            if (!(await this.isRoleInGroup(permission, group, role))) {
                let groupRole = this.groupRoleRepository.create({
                    groupId: group.id,
                    tenantId: group.tenantId,
                    roleId: role.id,
                });
                await this.groupRoleRepository.save(groupRole);
                oRole.push(role);
            }
        }
        let users = await this.findGroupUsers(permission, group);
        for (const user of users) {
            await this.roleService.addRoles(
                permission,
                user,
                group.tenant,
                oRole,
                true,
            );
        }
    }

    async removeRoles(permission: Permission, group: Group, roles: string[]) {
        permission.isAuthorized(
            Action.Update,
            SubjectEnum.GROUP,
            {
                id: group.id,
            },
        );

        let oRole = [];
        for (let role_name of roles) {
            let role = await this.roleService.findByNameAndTenant(
                permission,
                role_name,
                group.tenant,
            );
            if (await this.isRoleInGroup(permission, group, role)) {
                let gr = await this.findGroupRole(permission, group, role);
                await this.groupRoleRepository.remove(gr);
                oRole.push(role);
            }
        }
        let users = await this.findGroupUsers(permission, group);
        for (const user of users) {
            await this.roleService.removeRoles(
                permission,
                user,
                group.tenant,
                oRole,
                true,
            );
        }
    }

    async addUser(permission: Permission, group: Group, users: string[]) {
        permission.isAuthorized(
            Action.Update,
            SubjectEnum.GROUP,
            {
                id: group.id,
            },
        );

        let oUser = [];
        for (let email of users) {
            let user = await this.usersService.findByEmail(permission, email);
            if (!(await this.isUserInGroup(permission, group, user))) {
                let gu = this.groupUserRepository.create({
                    groupId: group.id,
                    tenantId: group.tenantId,
                    userId: user.id,
                });
                gu = await this.groupUserRepository.save(gu);
                oUser.push(user);
            }
        }
        let roles = await this.findGroupRoles(permission, group);
        for (let user of oUser) {
            await this.roleService.addRoles(
                permission,
                user,
                group.tenant,
                roles,
                true,
            );
        }
    }

    async removeUser(permission: Permission, group: Group, users: string[]) {
        permission.isAuthorized(
            Action.Update,
            SubjectEnum.GROUP,
            {
                id: group.id,
            },
        );

        let oUser = [];
        for (let email of users) {
            let user = await this.usersService.findByEmail(permission, email);
            if (await this.isUserInGroup(permission, group, user)) {
                let gu = await this.findGroupUser(permission, group, user);
                await this.groupUserRepository.remove(gu);
                oUser.push(user);
            }
        }
        let roles = await this.findGroupRoles(permission, group);
        for (let user of oUser) {
            await this.roleService.removeRoles(
                permission,
                user,
                group.tenant,
                roles,
                true,
            );
        }
    }

    async updateGroup(
        permission: Permission,
        group: Group,
        body: { name: string },
    ) {
        permission.isAuthorized(
            Action.Update,
            SubjectEnum.GROUP,
            {
                id: group.id,
            },
        );

        if (
            !(await this.existsByNameAndTenantId(
                permission,
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
