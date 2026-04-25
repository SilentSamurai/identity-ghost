import {ForbiddenException, Injectable, NotFoundException} from "@nestjs/common";
import {InjectRepository} from "@nestjs/typeorm";
import {User} from "../entity/user.entity";
import {Repository} from "typeorm";
import {Tenant} from "../entity/tenant.entity";
import {Role} from "../entity/role.entity";
import {TenantMember} from "../entity/tenant.members.entity";
import {Environment} from "../config/environment.service";

@Injectable()
export class AuthUserService {
    constructor(
        private readonly configService: Environment,
        @InjectRepository(User) private usersRepository: Repository<User>,
        @InjectRepository(Tenant) private tenantRepository: Repository<Tenant>,
        @InjectRepository(TenantMember)
        private tenantMemberRepository: Repository<TenantMember>,
        @InjectRepository(Role) private roleRepository: Repository<Role>,
    ) {
    }

    async findUserById(id: string): Promise<User> {
        const user: User = await this.usersRepository.findOne({
            where: {id: id},
        });
        if (user === null) {
            throw new NotFoundException('User not found');
        }

        return user;
    }

    async findUserByEmail(email: string): Promise<User> {
        const user: User = await this.usersRepository.findOne({
            where: {email: email},
        });
        if (user === null) {
            throw new NotFoundException('User not found');
        }

        return user;
    }

    async tenantExistsByDomain(domain: string): Promise<boolean> {
        return await this.tenantRepository.exists({
            where: {domain: domain},
            relations: {
                members: true,
                roles: true,
            },
        });
    }

    async findTenantByDomain(domain: string) {
        let tenant = await this.tenantRepository.findOne({
            where: {domain: domain},
            relations: {
                members: true,
                roles: true,
            },
        });
        if (tenant === null) {
            throw new NotFoundException("tenant not found");
        }
        return tenant;
    }

    async findMemberRoles(tenant: Tenant, user: User): Promise<Role[]> {
        let isMember = await this.isMember(tenant.id, user.id);
        if (!isMember) {
            throw new ForbiddenException("Not a Member.");
        }
        return this.getMemberRoles(tenant, user);
    }

    async isMember(tenantId: string, userId: string): Promise<boolean> {
        return this.tenantMemberRepository.exists({
            where: {
                tenantId: tenantId,
                userId: userId,
            },
        });
    }

    async getMemberRoles(tenant: Tenant, user: User): Promise<Role[]> {
        return this.roleRepository.find({
            where: {
                tenant: {id: tenant.id},
                users: {id: user.id},
            },
        });
    }


    async findTenantById(id: string) {
        let tenant = await this.tenantRepository.findOne({
            where: {id: id},
            relations: {
                members: true,
                roles: true,
            },
        });
        if (tenant === null) {
            throw new NotFoundException("tenant not found");
        }
        return tenant;
    }

    async findGlobalTenant(): Promise<Tenant> {
        return this.findTenantByDomain(
            this.configService.get("SUPER_TENANT_DOMAIN"),
        );
    }
}
