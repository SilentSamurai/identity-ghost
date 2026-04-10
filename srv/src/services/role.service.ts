import {BadRequestException, Injectable, NotFoundException} from "@nestjs/common";
import {Environment} from "../config/environment.service";
import {InjectRepository} from "@nestjs/typeorm";
import {Repository} from "typeorm";
import {Tenant} from "../entity/tenant.entity";
import {Role} from "../entity/role.entity";
import {User} from "../entity/user.entity";
import {UserRole} from "../entity/user.roles.entity";
import {AuthContext} from "../casl/contexts";
import {SecurityService} from "../casl/security.service";
import {Action} from "../casl/actions.enum";
import {SubjectEnum} from "../entity/subjectEnum";
import {App} from "../entity/app.entity";

@Injectable()
export class RoleService {
    constructor(
        private readonly configService: Environment,
        private readonly securityService: SecurityService,
        @InjectRepository(User) private usersRepository: Repository<User>,
        @InjectRepository(Role) private roleRepository: Repository<Role>,
        @InjectRepository(UserRole)
        private userRoleRepository: Repository<UserRole>,
        @InjectRepository(App)
        private appRepository: Repository<App>,
    ) {
    }

    async create(
        authContext: AuthContext,
        name: string,
        tenant: Tenant,
        removable: boolean = true,
    ): Promise<Role> {
        this.securityService.isAuthorized(
            authContext,
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
        authContext: AuthContext,
        roleId: string,
        name: string,
        newDescription: string,
        appId?: string,
    ): Promise<Role> {
        const role = await this.findById(authContext, roleId);

        this.securityService.isAuthorized(
            authContext,
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

    async findById(authContext: AuthContext, id: string) {
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
        this.securityService.isAuthorized(
            authContext,
            Action.Read,
            SubjectEnum.ROLE,
            {tenantId: role.tenant.id},
        );
        return role;
    }

    async deleteByTenant(
        authContext: AuthContext,
        tenant: Tenant,
    ): Promise<number> {
        this.securityService.isAuthorized(
            authContext,
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

    async countByRole(authContext: AuthContext, role: Role): Promise<number> {
        this.securityService.isAuthorized(
            authContext,
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

    async isUserAssignedToRole(authContext: AuthContext, role: Role) {
        let count = await this.countByRole(authContext, role);
        return count > 0;
    }

    async deleteById(authContext: AuthContext, id: string): Promise<Role> {
        let role: Role = await this.findById(authContext, id);
        const count = await this.countByRole(authContext, role);
        this.securityService.isAuthorized(
            authContext,
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
        authContext: AuthContext,
        name: string,
        tenant: Tenant,
    ): Promise<Role> {
        this.securityService.isAuthorized(
            authContext,
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
        authContext: AuthContext,
        tenant: Tenant,
    ): Promise<Role[]> {
        this.securityService.isAuthorized(
            authContext,
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
        authContext: AuthContext,
        tenant: Tenant,
        user: User,
    ): Promise<Role[]> {
        this.securityService.isAuthorized(
            authContext,
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
        authContext: AuthContext,
        roles: string[],
        tenant: Tenant,
        user: User,
    ): Promise<boolean> {
        this.securityService.isAuthorized(
            authContext,
            Action.Read,
            SubjectEnum.TENANT,
            {id: tenant.id},
        );

        for (let name of roles) {
            let role = await this.findByNameAndTenant(
                authContext,
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
        authContext: AuthContext,
        roles: string[],
        tenant: Tenant,
        user: User,
    ): Promise<boolean> {
        this.securityService.isAuthorized(
            authContext,
            Action.Read,
            SubjectEnum.TENANT,
            {id: tenant.id},
        );

        for (let name of roles) {
            let role = await this.findByNameAndTenant(
                authContext,
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
        authContext: AuthContext,
        roles: string[],
        tenant: Tenant,
        user: User,
    ): Promise<Role[]> {
        this.securityService.isAuthorized(
            authContext,
            Action.Update,
            SubjectEnum.TENANT,
            {id: tenant.id},
        );

        let memberRoles = await this.getMemberRoles(authContext, tenant, user);
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

        await this.addRoles(authContext, user, tenant, addRoles);
        await this.removeRoles(authContext, user, tenant, removeRoles);

        return this.getMemberRoles(authContext, tenant, user);
    }

    async removeRoles(
        authContext: AuthContext,
        user: User,
        tenant: Tenant,
        roles: string[] | Role[],
        from_group = false,
    ) {
        this.securityService.isAuthorized(
            authContext,
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
        authContext: AuthContext,
        user: User,
        tenant: Tenant,
        roles: string[] | Role[],
        from_group = false,
    ) {
        this.securityService.isAuthorized(
            authContext,
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
