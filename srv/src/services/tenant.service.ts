import {
    BadRequestException,
    ForbiddenException,
    Inject,
    Injectable,
    NotFoundException,
    OnModuleInit
} from "@nestjs/common";
import {Environment} from "../config/environment.service";
import {UsersService} from "./users.service";
import {InjectRepository} from "@nestjs/typeorm";
import {Repository} from "typeorm";
import {Tenant} from "../entity/tenant.entity";
import {User} from "../entity/user.entity";
import {Role} from "../entity/role.entity";
import {RoleService} from "./role.service";
import {RoleEnum} from "../entity/roleEnum";
import {CryptUtil} from "../util/crypt.util";
import {TenantMember} from "../entity/tenant.members.entity";
import {Permission} from "../auth/auth.decorator";
import {Action} from "../casl/actions.enum";
import {SubjectEnum} from "../entity/subjectEnum";
import {SIGNING_KEY_PROVIDER, SigningKeyProvider} from "../core/token-abstraction";
import {KeyManagementService} from "./key-management.service";

@Injectable()
export class TenantService implements OnModuleInit {
    constructor(
        private readonly configService: Environment,
        private readonly usersService: UsersService,
        private readonly roleService: RoleService,
        @Inject(SIGNING_KEY_PROVIDER)
        private readonly signingKeyProvider: SigningKeyProvider,
        private readonly keyManagementService: KeyManagementService,
        @InjectRepository(Tenant) private tenantRepository: Repository<Tenant>,
        @InjectRepository(TenantMember)
        private tenantMemberRepository: Repository<TenantMember>,
        @InjectRepository(User) private userRepository: Repository<User>,
    ) {
    }

    async onModuleInit() {
    }

    async create(
        permission: Permission,
        name: string,
        domain: string,
        owner: User,
    ): Promise<Tenant> {
        permission.isAuthorized(
            Action.Create,
            SubjectEnum.TENANT,
        );

        const domainTaken: Tenant = await this.tenantRepository.findOne({
            where: {domain},
        });
        if (domainTaken) {
            throw new BadRequestException("Domain already Taken");
        }

        const {clientId, clientSecret, salt} =
            CryptUtil.generateClientIdAndSecret();

        let tenant: Tenant = this.tenantRepository.create({
            name: name,
            domain: domain,
            clientId: clientId,
            clientSecret: clientSecret,
            secretSalt: salt,
            members: [],
            roles: [],
        });

        tenant = await this.tenantRepository.save(tenant);

        const {privateKey, publicKey} = this.signingKeyProvider.generateKeyPair();
        await this.keyManagementService.createInitialKey(tenant.id, publicKey, privateKey);

        await this.addMember(permission, tenant.id, owner);

        let adminRole = await this.roleService.create(
            permission,
            RoleEnum.TENANT_ADMIN,
            tenant,
            false,
        );
        let viewerRole = await this.roleService.create(
            permission,
            RoleEnum.TENANT_VIEWER,
            tenant,
            false,
        );

        await this.tenantRepository
            .createQueryBuilder()
            .relation(Tenant, "roles")
            .of(tenant.id)
            .add([adminRole.id, viewerRole.id]);

        await this.updateRolesOfMember(
            permission,
            [adminRole.name],
            tenant.id,
            owner,
        );

        return tenant;
    }

    async updateKeys(permission: Permission, id: string): Promise<Tenant> {
        permission.isAuthorized(
            Action.Update,
            SubjectEnum.TENANT,
            {id: id},
        );

        const tenant: Tenant = await this.findById(permission, id);
        if (!tenant) {
            throw new NotFoundException("tenant id not found");
        }

        await this.keyManagementService.rotateKey(tenant.id);

        return tenant;
    }

    async existByDomain(
        permission: Permission,
        domain: string,
    ): Promise<boolean> {
        permission.isAuthorized(
            Action.Read,
            SubjectEnum.TENANT,
        );

        return this.tenantRepository.exist({
            where: {domain},
        });
    }

    async findById(permission: Permission, id: string) {
        permission.isAuthorized(
            Action.Read,
            SubjectEnum.TENANT,
            {id: id},
        );

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

    async findByDomain(
        permission: Permission,
        domain: string,
    ): Promise<Tenant> {
        permission.isAuthorized(
            Action.Read,
            SubjectEnum.TENANT,
            {domain: domain},
        );

        let tenant = await this.tenantRepository.findOne({
            where: {domain},
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

    async findByDomainPublic(domain: string): Promise<Tenant | null> {
        return this.tenantRepository.findOne({
            where: {domain},
        });
    }

    async findByClientId(
        permission: Permission,
        clientId: string,
    ): Promise<Tenant> {
        permission.isAuthorized(
            Action.Read,
            SubjectEnum.TENANT,
            {clientId: clientId},
        );

        let tenant = await this.tenantRepository.findOne({
            where: {clientId},
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

    async addMember(
        permission: Permission,
        tenantId: string,
        user: User,
    ): Promise<TenantMember> {
        permission.isAuthorized(
            Action.Update,
            SubjectEnum.TENANT,
            {id: tenantId},
        );

        let tenant: Tenant = await this.findById(permission, tenantId);
        let tenantMember = this.tenantMemberRepository.create({
            tenantId: tenant.id,
            userId: user.id,
        });
        // await this.roleService.updateUserScopes([ScopeEnum.TENANT_VIEWER], tenant, user);
        return this.tenantMemberRepository.save(tenantMember);
    }

    async getAllTenants(permission: Permission) {
        permission.isAuthorized(
            Action.Update,
            SubjectEnum.TENANT,
        );

        return this.tenantRepository.find();
    }

    async updateTenant(
        permission: Permission,
        id: string,
        data: { name?: string; allowSignUp?: boolean },
    ) {
        permission.isAuthorized(
            Action.Update,
            SubjectEnum.TENANT,
        );
        const tenant: Tenant = await this.findById(permission, id);

        if (data.name !== undefined) tenant.name = data.name;
        if (data.allowSignUp !== undefined)
            tenant.allowSignUp = data.allowSignUp;

        return this.tenantRepository.save(tenant);
    }

    async getMemberRoles(
        permission: Permission,
        tenantId: string,
        user: User,
    ): Promise<Role[]> {
        permission.isAuthorized(
            Action.Read,
            SubjectEnum.TENANT,
            {id: tenantId},
        );

        let tenant: Tenant = await this.findById(permission, tenantId);
        let isMember = await this.isMember(permission, tenant.id, user);
        if (!isMember) {
            throw new ForbiddenException("Not a Member.");
        }
        return this.roleService.getMemberRoles(permission, tenant, user);
    }

    async isViewer(
        permission: Permission,
        tenantId: string,
        user: User,
    ): Promise<boolean> {
        permission.isAuthorized(
            Action.Read,
            SubjectEnum.TENANT,
            {id: tenantId},
        );

        let tenant: Tenant = await this.findById(permission, tenantId);
        if (!(await this.isMember(permission, tenantId, user))) {
            return false;
        }
        return this.roleService.hasAnyOfRoles(
            permission,
            [RoleEnum.TENANT_ADMIN, RoleEnum.TENANT_VIEWER],
            tenant,
            user,
        );
    }

    async removeMember(
        permission: Permission,
        tenantId: string,
        user: User,
    ): Promise<Tenant> {
        permission.isAuthorized(
            Action.Update,
            SubjectEnum.TENANT,
            {id: tenantId},
        );

        let tenant: Tenant = await this.findById(permission, tenantId);
        let tenantMember = await this.findMembership(permission, tenant, user);
        await this.updateRolesOfMember(permission, [], tenantId, user);
        await this.tenantMemberRepository.remove(tenantMember);
        return tenant;
    }

    async isMember(
        permission: Permission,
        tenantId: string,
        user: User,
    ): Promise<boolean> {
        permission.isAuthorized(
            Action.Read,
            SubjectEnum.TENANT,
            {id: tenantId},
        );

        return this.tenantMemberRepository.exists({
            where: {
                tenantId: tenantId,
                userId: user.id,
            },
        });
    }

    async findMembership(
        permission: Permission,
        tenant: Tenant,
        user: User,
    ): Promise<TenantMember> {
        permission.isAuthorized(
            Action.Read,
            SubjectEnum.TENANT,
            {id: tenant.id},
        );

        let tenantMember = await this.tenantMemberRepository.findOne({
            where: {
                tenantId: tenant.id,
                userId: user.id,
            },
        });
        if (tenantMember === null) {
            throw new NotFoundException("user is not a member of this tenant");
        }
        return tenantMember;
    }

    async isAdmin(
        permission: Permission,
        tenantId: string,
        user: User,
    ): Promise<boolean> {
        permission.isAuthorized(
            Action.Read,
            SubjectEnum.TENANT,
            {id: tenantId},
        );

        let tenant: Tenant = await this.findById(permission, tenantId);
        if (!(await this.isMember(permission, tenantId, user))) {
            return false;
        }
        return this.roleService.hasAllRoles(
            permission,
            [RoleEnum.TENANT_ADMIN],
            tenant,
            user,
        );
    }

    async findGlobalTenant(permission: Permission): Promise<Tenant> {
        return this.findByDomain(
            permission,
            this.configService.get("SUPER_TENANT_DOMAIN"),
        );
    }

    async updateRolesOfMember(
        permission: Permission,
        roles: string[],
        tenantId: string,
        user: User,
    ): Promise<Role[]> {
        permission.isAuthorized(
            Action.Update,
            SubjectEnum.TENANT,
            {id: tenantId},
        );

        let tenant: Tenant = await this.findById(permission, tenantId);
        const isMember: boolean = await this.isMember(
            permission,
            tenantId,
            user,
        );
        if (!isMember) {
            throw new NotFoundException("user is not a member of this tenant");
        }
        return this.roleService.updateUserRoles(
            permission,
            roles,
            tenant,
            user,
        );
    }

    async findByMembership(
        permission: Permission,
        user: User,
    ): Promise<Tenant[]> {
        permission.isAuthorized(
            Action.Read,
            SubjectEnum.TENANT,
        );

        const tenants: Tenant[] = await this.tenantRepository.find({
            where: {
                members: {id: user.id},
            },
            relations: {
                roles: true
            },
        });
        return tenants;
    }

    async findByViewership(
        permission: Permission,
        user: User,
    ): Promise<Tenant[]> {
        permission.isAuthorized(
            Action.Read,
            SubjectEnum.TENANT,
        );

        const tenants: Tenant[] = await this.tenantRepository.find({
            where: {
                members: {id: user.id},
            },
            relations: {
                roles: true,
            },
        });
        return tenants.filter((tenant) =>
            this.isViewer(permission, tenant.id, user),
        );
    }

    async deleteTenant(permission: Permission, tenantId: string) {
        permission.isAuthorized(
            Action.Delete,
            SubjectEnum.TENANT,
            {id: tenantId},
        );

        let tenant: Tenant = await this.findById(permission, tenantId);
        if (tenant.domain === this.configService.get("SUPER_TENANT_DOMAIN")) {
            throw new ForbiddenException("Super tenant cannot be deleted");
        }
        await this.roleService.deleteByTenant(permission, tenant);
        return this.tenantRepository.remove(tenant);
    }

    async deleteTenantSecure(permission: Permission, tenantId: string) {
        permission.isAuthorized(
            Action.Delete,
            SubjectEnum.TENANT,
            {id: tenantId},
        );

        let tenant: Tenant = await this.findById(permission, tenantId);
        let count = await this.usersService.countByTenant(permission, tenant);
        if (count > 0) {
            throw new BadRequestException("tenant contains members");
        }
        return this.tenantRepository.remove(tenant);
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

        return this.roleService.getTenantRoles(permission, tenant);
    }

    async findByClientIdOrDomain(
        permission: Permission,
        clientIdOrDomain: string,
    ): Promise<Tenant> {
        permission.isAuthorized(
            Action.Read,
            SubjectEnum.TENANT,
            {clientId: clientIdOrDomain},
        );

        let tenant = await this.tenantRepository.findOne({
            where: [{clientId: clientIdOrDomain}, {domain: clientIdOrDomain}],
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

    async findMember(
        permission: Permission,
        tenant: Tenant,
        email: string,
    ): Promise<User> {
        permission.isAuthorized(
            Action.Read,
            SubjectEnum.TENANT,
            {id: tenant.id},
        );

        // Find the user by email
        const user = await this.userRepository.findOneBy({
            email,
        });
        if (!user) {
            throw new NotFoundException(`User with email ${email} not found`);
        }

        // Check if the user is a member of the given tenant
        const tenantMember = await this.tenantMemberRepository.findOne({
            where: {
                tenantId: tenant.id,
                userId: user.id,
            },
        });

        if (!tenantMember) {
            throw new NotFoundException(
                `User with email ${email} is not a member of tenant ${tenant.id}`,
            );
        }

        return user;
    }
}
