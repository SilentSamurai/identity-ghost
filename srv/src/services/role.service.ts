import {BadRequestException, Injectable, NotFoundException} from "@nestjs/common";
import {Environment} from "../config/environment.service";
import {InjectRepository} from "@nestjs/typeorm";
import {Repository} from "typeorm";
import {Tenant} from "../entity/tenant.entity";
import {Role} from "../entity/role.entity";
import {User} from "../entity/user.entity";
import {UserRole} from "../entity/user.roles.entity";
import {Permission} from "../auth/auth.decorator";
import {Action} from "../casl/actions.enum";
import {SubjectEnum} from "../entity/subjectEnum";
import {App} from "../entity/app.entity";

@Injectable()
export class RoleService {
    constructor(
        private readonly configService: Environment,
        @InjectRepository(User) private usersRepository: Repository<User>,
        @InjectRepository(Role) private roleRepository: Repository<Role>,
        @InjectRepository(UserRole)
        private userRoleRepository: Repository<UserRole>,
        @InjectRepository(App)
        private appRepository: Repository<App>,
    ) {
    }

    async create(
        permission: Permission,
        name: string,
        tenant: Tenant,
        removable: boolean = true,
    ): Promise<Role> {
        permission.isAuthorized(
            Action.Create,
            SubjectEnum.ROLE,
        );

        const role = this.roleRepository.create({
            name,
            tenant,
            removable,
            description: null,
        });
        return this.roleRepository.save(role);
    }

    async updateRole(
        permission: Permission,
        roleId: string,
        name: string,
        newDescription: string,
        appId?: string,
    ): Promise<Role> {
        const role = await this.findById(permission, roleId);

        permission.isAuthorized(
            Action.Update,
            SubjectEnum.TENANT,
            {id: role.tenant.id},
        );

        if (newDescription) {
            role.description = newDescription;
        }
        if (name) {
            role.name = name;
        }
        if (typeof appId !== 'undefined') {
            if (appId) {
                role.app = await this.appRepository.findOne({where: {id: appId}});
                if (!role.app) {
                    throw new BadRequestException("app not found");
                }
            } else {
                role.app = null;
            }
        }
        return this.roleRepository.save(role);
    }

    async findById(permission: Permission, id: string) {
        let role: Role = await this.roleRepository.findOne({
            where: {id: id},
            relations: {
                tenant: true,
                app: true,
            },
        });
        if (role === null) {
            throw new NotFoundException("role not found");
        }
        permission.isAuthorized(
            Action.Read,
            SubjectEnum.ROLE,
            {tenantId: role.tenant.id},
        );
        return role;
    }

    async deleteByTenant(
        permission: Permission,
        tenant: Tenant,
    ): Promise<number> {
        permission.isAuthorized(
            Action.Delete,
            SubjectEnum.ROLE,
            {tenantId: tenant.id},
        );

        let deleteResult = await this.userRoleRepository.delete({
            tenantId: tenant.id,
        });

        let deleteResult1 = await this.roleRepository.delete({
            tenant: {
                id: tenant.id,
            },
        });
        return deleteResult1.affected;
    }

    async countByRole(permission: Permission, role: Role): Promise<number> {
        permission.isAuthorized(
            Action.Read,
            SubjectEnum.ROLE,
            {tenantId: role.tenant.id},
        );

        const count: number = await this.usersRepository.count({
            where: {
                roles: {id: role.id},
            },
            relations: {
                roles: true,
            },
        });
        return count;
    }

    async isUserAssignedToRole(permission: Permission, role: Role) {
        let count = await this.countByRole(permission, role);
        return count > 0;
    }

    async deleteById(permission: Permission, id: string): Promise<Role> {
        let role: Role = await this.findById(permission, id);
        const count = await this.countByRole(permission, role);
        permission.isAuthorized(
            Action.Delete,
            SubjectEnum.ROLE,
            {tenantId: role.tenant.id},
        );

        if (count > 0 || !role.removable) {
            throw new BadRequestException(
                "role is assigned to members | role is protected",
            );
        }
        return this.roleRepository.remove(role);
    }

    async findByNameAndTenant(
        permission: Permission,
        name: string,
        tenant: Tenant,
    ): Promise<Role> {
        permission.isAuthorized(
            Action.Read,
            SubjectEnum.TENANT,
            {id: tenant.id},
        );

        let role: Role = await this.roleRepository.findOne({
            where: {
                name,
                tenant: {id: tenant.id},
            },
            relations: {
                tenant: true,
            },
        });

        if (role === null) {
            throw new NotFoundException("role not found");
        }
        return role;
    }

    async getTenantRoles(
        permission: Permission,
        tenant: Tenant,
    ): Promise<Role[]> {
        permission.isAuthorized(
            Action.Read,
            SubjectEnum.ROLE,
            {tenantId: tenant.id},
        );

        return this.roleRepository.find({
            where: {
                tenant: {id: tenant.id},
            },
        });
    }

    async getMemberRoles(
        permission: Permission,
        tenant: Tenant,
        user: User,
    ): Promise<Role[]> {
        permission.isAuthorized(
            Action.Read,
            SubjectEnum.ROLE,
            {tenantId: tenant.id},
        );
        return this.roleRepository.find({
            where: {
                tenant: {id: tenant.id},
                users: {id: user.id},
            },
        });
    }

    async hasAllRoles(
        permission: Permission,
        roles: string[],
        tenant: Tenant,
        user: User,
    ): Promise<boolean> {
        permission.isAuthorized(
            Action.Read,
            SubjectEnum.TENANT,
            {id: tenant.id},
        );

        for (let name of roles) {
            let role = await this.findByNameAndTenant(
                permission,
                name,
                tenant,
            );
            const hasRole = await this.userRoleRepository.exist({
                where: {
                    tenantId: tenant.id,
                    userId: user.id,
                    roleId: role.id,
                },
            });
            if (!hasRole) return false;
        }
        return true;
    }

    async hasAnyOfRoles(
        permission: Permission,
        roles: string[],
        tenant: Tenant,
        user: User,
    ): Promise<boolean> {
        permission.isAuthorized(
            Action.Read,
            SubjectEnum.TENANT,
            {id: tenant.id},
        );

        for (let name of roles) {
            let role = await this.findByNameAndTenant(
                permission,
                name,
                tenant,
            );
            const hasRole = await this.userRoleRepository.exist({
                where: {
                    tenantId: tenant.id,
                    userId: user.id,
                    roleId: role.id,
                },
            });
            if (hasRole) return true;
        }
        return false;
    }

    async updateUserRoles(
        permission: Permission,
        roles: string[],
        tenant: Tenant,
        user: User,
    ): Promise<Role[]> {
        permission.isAuthorized(
            Action.Update,
            SubjectEnum.TENANT,
            {id: tenant.id},
        );

        let memberRoles = await this.getMemberRoles(permission, tenant, user);
        const previousRoleMap: Map<string, Role> = new Map<string, Role>();
        const currentRoleMap: Map<string, string> = new Map<string, string>();
        memberRoles.forEach((role) => previousRoleMap.set(role.name, role));
        roles.forEach((name) => currentRoleMap.set(name, name));

        const removeRoles = [];
        const addRoles = [];
        roles.forEach((name) => {
            if (!previousRoleMap.has(name)) {
                addRoles.push(name);
            }
        });

        previousRoleMap.forEach((value, key, map) => {
            if (!currentRoleMap.has(key)) {
                removeRoles.push(value.name);
            }
        });

        await this.addRoles(permission, user, tenant, addRoles);
        await this.removeRoles(permission, user, tenant, removeRoles);

        return this.getMemberRoles(permission, tenant, user);
    }

    async removeRoles(
        permission: Permission,
        user: User,
        tenant: Tenant,
        roles: string[] | Role[],
        from_group = false,
    ) {
        permission.isAuthorized(
            Action.Update,
            SubjectEnum.TENANT,
            {id: tenant.id},
        );

        const results: void[] = [];
        for (const roleInput of roles) {
            let role: string | Role = roleInput;
            if (typeof role == "string") {
                let name = role as string;
                role = await this.roleRepository.findOne({
                    where: {
                        name,
                        tenant: {id: tenant.id},
                    },
                    relations: {
                        users: true,
                    },
                });
            }
            if (role !== null) {
                let userRole = await this.userRoleRepository.findOne({
                    where: {
                        tenantId: tenant.id,
                        userId: user.id,
                        roleId: (role as Role).id,
                        from_group: from_group,
                    },
                });
                await this.userRoleRepository.remove(userRole);
            }
            results.push(undefined);
        }
        return results;
    }

    async addRoles(
        permission: Permission,
        user: User,
        tenant: Tenant,
        roles: string[] | Role[],
        from_group = false,
    ) {
        permission.isAuthorized(
            Action.Update,
            SubjectEnum.TENANT,
            {id: tenant.id},
        );

        return await Promise.all(
            roles.map(async (role: string | Role) => {
                if (typeof role == "string") {
                    let name = role as string;
                    role = await this.roleRepository.findOne({
                        where: {
                            name,
                            tenant: {id: tenant.id},
                        },
                        relations: {
                            users: true,
                        },
                    });
                }
                if (role !== null) {
                    let userRole = this.userRoleRepository.create({
                        userId: user.id,
                        tenantId: tenant.id,
                        roleId: role.id,
                        from_group: from_group,
                    });
                    await this.userRoleRepository.save(userRole);
                }
            }),
        );
    }
}
