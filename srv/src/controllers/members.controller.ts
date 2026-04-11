import {
    Body,
    ClassSerializerInterceptor,
    Controller,
    Delete,
    ForbiddenException,
    Get,
    Param,
    Post,
    Put,
    UseGuards,
    UseInterceptors,
} from "@nestjs/common";
import {Environment} from "../config/environment.service";
import {UsersService} from "../services/users.service";
import {TenantService} from "../services/tenant.service";
import {ValidationPipe} from "../validation/validation.pipe";
import {ValidationSchema} from "../validation/validation.schema";
import {Tenant} from "../entity/tenant.entity";
import {JwtAuthGuard} from "../auth/jwt-auth.guard";
import {User} from "../entity/user.entity";
import {Role} from "../entity/role.entity";
import {SecurityService} from "../casl/security.service";
import {RoleService} from "../services/role.service";
import {Action} from "../casl/actions.enum";
import {SubjectEnum} from "../entity/subjectEnum";
import {InjectRepository} from "@nestjs/typeorm";
import {Repository} from "typeorm";
import {CurrentPermission, CurrentTenantId, Permission} from "../auth/auth.decorator";
import {TenantToken} from "../casl/contexts";
import * as yup from 'yup';

// Local MemberOperationSchema for this controller
const MemberOperationSchema = yup.object().shape({
    emails: yup.array().of(yup.string().max(128)),
});

@Controller("api/tenant")
@UseInterceptors(ClassSerializerInterceptor)
export class MemberController {
    constructor(
        private readonly configService: Environment,
        private readonly tenantService: TenantService,
        private readonly usersService: UsersService,
        private readonly roleService: RoleService,
        private readonly securityService: SecurityService,
        @InjectRepository(User) private usersRepository: Repository<User>,
    ) {
    }

    // ─── New token-derived routes (no :tenantId in URL) ───

    @Get("/my/members")
    @UseGuards(JwtAuthGuard)
    async getMyTenantMembers(
        @CurrentPermission() permission: Permission,
        @CurrentTenantId() tenantId: string,
    ): Promise<User[]> {
        return this._getTenantMembers(permission, tenantId);
    }

    @Post("/my/members/add")
    @UseGuards(JwtAuthGuard)
    async addMyMember(
        @CurrentPermission() permission: Permission,
        @CurrentTenantId() tenantId: string,
        @Body(new ValidationPipe(MemberOperationSchema))
        body: { emails: string[] },
    ): Promise<Tenant> {
        return this._addMember(permission, tenantId, body);
    }

    @Delete("/my/members/delete")
    @UseGuards(JwtAuthGuard)
    async removeMyMember(
        @CurrentPermission() permission: Permission,
        @CurrentTenantId() tenantId: string,
        @Body(new ValidationPipe(MemberOperationSchema))
        body: { emails: string[] },
    ): Promise<Tenant> {
        return this._removeMember(permission, tenantId, body);
    }

    @Get("/my/member/:userId")
    @UseGuards(JwtAuthGuard)
    async getMyMember(
        @CurrentPermission() permission: Permission,
        @CurrentTenantId() tenantId: string,
        @Param("userId") userId: string,
    ): Promise<any> {
        return this._getMember(permission, tenantId, userId);
    }

    @Put("/my/member/:userId/roles")
    @UseGuards(JwtAuthGuard)
    async setMyMemberRoles(
        @CurrentPermission() permission: Permission,
        @CurrentTenantId() tenantId: string,
        @Param("userId") userId: string,
        @Body(new ValidationPipe(ValidationSchema.OperatingRoleSchema))
        body: { roles: string[] },
    ): Promise<Role[]> {
        return this._setMemberRoles(permission, tenantId, userId, body);
    }

    @Post("/my/member/:userId/roles/add")
    @UseGuards(JwtAuthGuard)
    async addRolesToMyMember(
        @CurrentPermission() permission: Permission,
        @CurrentTenantId() tenantId: string,
        @Param("userId") userId: string,
        @Body(new ValidationPipe(ValidationSchema.OperatingRoleSchema))
        body: { roles: string[] },
    ): Promise<Role[]> {
        return this._addRolesToMember(permission, tenantId, userId, body);
    }

    @Delete("/my/member/:userId/roles/remove")
    @UseGuards(JwtAuthGuard)
    async removeRolesFromMyMember(
        @CurrentPermission() permission: Permission,
        @CurrentTenantId() tenantId: string,
        @Param("userId") userId: string,
        @Body(new ValidationPipe(ValidationSchema.OperatingRoleSchema))
        body: { roles: string[] },
    ): Promise<Role[]> {
        return this._removeRolesFromMember(permission, tenantId, userId, body);
    }

    @Get("/my/member/:userId/roles")
    @UseGuards(JwtAuthGuard)
    async getMyMemberRoles(
        @CurrentPermission() permission: Permission,
        @CurrentTenantId() tenantId: string,
        @Param("userId") userId: string,
    ): Promise<any> {
        return this._getMemberRoles(permission, tenantId, userId);
    }

    // ─── Shared implementation methods ───

    private async _getTenantMembers(permission: Permission, tenantId: string): Promise<User[]> {
        let tenant = await this.tenantService.findById(permission, tenantId);
        permission.isAuthorized(
            Action.Read,
            SubjectEnum.TENANT,
            {id: tenant.id},
        );
        permission.isAuthorized(
            Action.Read,
            SubjectEnum.MEMBER,
            {tenantId: tenantId},
        );
        const members: User[] = await this.usersRepository.find({
            where: {
                tenants: {id: tenant.id},
            },
        });

        for (const member of members) {
            member.roles = await this.roleService.getMemberRoles(
                permission,
                tenant,
                member,
            );
        }
        return members;
    }

    private async _addMember(permission: Permission, tenantId: string, body: { emails: string[] }): Promise<Tenant> {
        let tenant = await this.tenantService.findById(permission, tenantId);
        permission.isAuthorized(
            Action.Update,
            SubjectEnum.TENANT,
            {id: tenant.id},
        );
        const adminPermission = this.securityService.createPermissionForMemberManagement(tenantId);
        for (const email of body.emails) {
            const isPresent = await this.usersService.existByEmail(
                adminPermission,
                email,
            );
            if (!isPresent) {
                await this.usersService.createShadowUser(adminPermission, email, email);
            }
            const user = await this.usersService.findByEmail(adminPermission, email);
            await this.tenantService.addMember(permission, tenant.id, user);
        }
        tenant = await this.tenantService.findById(permission, tenantId);
        return tenant;
    }

    private async _removeMember(permission: Permission, tenantId: string, body: { emails: string[] }): Promise<Tenant> {
        let tenant = await this.tenantService.findById(permission, tenantId);
        permission.isAuthorized(
            Action.Update,
            SubjectEnum.TENANT,
            {id: tenant.id},
        );
        for (const email of body.emails) {
            const user = await this.usersService.findByEmail(permission, email);
            let securityContext = permission.authContext.SECURITY_CONTEXT as TenantToken;
            if (securityContext.email === email) {
                throw new ForbiddenException("cannot remove self");
            }
            return this.tenantService.removeMember(permission, tenantId, user);
        }
    }

    private async _getMember(permission: Permission, tenantId: string, userId: string): Promise<any> {
        const user = await this.usersService.findById(permission, userId);
        const tenant = await this.tenantService.findById(permission, tenantId);
        permission.isAuthorized(
            Action.Read,
            SubjectEnum.TENANT,
            {id: tenant.id},
        );
        let roles = await this.tenantService.getMemberRoles(
            permission,
            tenantId,
            user,
        );
        return {
            tenantId: tenant.id,
            userId: user.id,
            roles: roles,
        };
    }

    private async _setMemberRoles(permission: Permission, tenantId: string, userId: string, body: {
        roles: string[]
    }): Promise<Role[]> {
        const user = await this.usersService.findById(permission, userId);
        let tenant = await this.tenantService.findById(permission, tenantId);
        permission.isAuthorized(
            Action.Update,
            SubjectEnum.TENANT,
            {id: tenant.id},
        );
        return this.tenantService.updateRolesOfMember(
            permission,
            body.roles,
            tenantId,
            user,
        );
    }

    private async _addRolesToMember(permission: Permission, tenantId: string, userId: string, body: {
        roles: string[]
    }): Promise<Role[]> {
        const user = await this.usersService.findById(permission, userId);
        const tenant = await this.tenantService.findById(permission, tenantId);
        permission.isAuthorized(
            Action.Update,
            SubjectEnum.TENANT,
            {id: tenant.id},
        );
        await this.roleService.addRoles(permission, user, tenant, body.roles);
        return this.roleService.getMemberRoles(permission, tenant, user);
    }

    private async _removeRolesFromMember(permission: Permission, tenantId: string, userId: string, body: {
        roles: string[]
    }): Promise<Role[]> {
        const user = await this.usersService.findById(permission, userId);
        const tenant = await this.tenantService.findById(permission, tenantId);
        permission.isAuthorized(
            Action.Update,
            SubjectEnum.TENANT,
            {id: tenant.id},
        );
        await this.roleService.removeRoles(permission, user, tenant, body.roles);
        return this.roleService.getMemberRoles(permission, tenant, user);
    }

    private async _getMemberRoles(permission: Permission, tenantId: string, userId: string): Promise<any> {
        const user = await this.usersService.findById(permission, userId);
        const tenant = await this.tenantService.findById(permission, tenantId);
        permission.isAuthorized(
            Action.Read,
            SubjectEnum.TENANT,
            {id: tenant.id},
        );
        let roles = await this.tenantService.getMemberRoles(
            permission,
            tenantId,
            user,
        );
        return {
            roles: roles,
        };
    }
}
