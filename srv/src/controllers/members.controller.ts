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
    Request,
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
import {subject} from "@casl/ability";
import {SubjectEnum} from "../entity/subjectEnum";
import {InjectRepository} from "@nestjs/typeorm";
import {Repository} from "typeorm";
import {CurrentTenantId} from "../auth/current-tenant.decorator";
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
        @Request() request: any,
        @CurrentTenantId() tenantId: string,
    ): Promise<User[]> {
        return this._getTenantMembers(request, tenantId);
    }

    @Post("/my/members/add")
    @UseGuards(JwtAuthGuard)
    async addMyMember(
        @Request() request,
        @CurrentTenantId() tenantId: string,
        @Body(new ValidationPipe(MemberOperationSchema))
            body: { emails: string[] },
    ): Promise<Tenant> {
        return this._addMember(request, tenantId, body);
    }

    @Delete("/my/members/delete")
    @UseGuards(JwtAuthGuard)
    async removeMyMember(
        @Request() request,
        @CurrentTenantId() tenantId: string,
        @Body(new ValidationPipe(MemberOperationSchema))
            body: { emails: string[] },
    ): Promise<Tenant> {
        return this._removeMember(request, tenantId, body);
    }

    @Get("/my/member/:userId")
    @UseGuards(JwtAuthGuard)
    async getMyMember(
        @Request() request,
        @CurrentTenantId() tenantId: string,
        @Param("userId") userId: string,
    ): Promise<any> {
        return this._getMember(request, tenantId, userId);
    }

    @Put("/my/member/:userId/roles")
    @UseGuards(JwtAuthGuard)
    async setMyMemberRoles(
        @Request() request,
        @CurrentTenantId() tenantId: string,
        @Param("userId") userId: string,
        @Body(new ValidationPipe(ValidationSchema.OperatingRoleSchema))
            body: { roles: string[] },
    ): Promise<Role[]> {
        return this._setMemberRoles(request, tenantId, userId, body);
    }

    @Post("/my/member/:userId/roles/add")
    @UseGuards(JwtAuthGuard)
    async addRolesToMyMember(
        @Request() request,
        @CurrentTenantId() tenantId: string,
        @Param("userId") userId: string,
        @Body(new ValidationPipe(ValidationSchema.OperatingRoleSchema))
            body: { roles: string[] },
    ): Promise<Role[]> {
        return this._addRolesToMember(request, tenantId, userId, body);
    }

    @Delete("/my/member/:userId/roles/remove")
    @UseGuards(JwtAuthGuard)
    async removeRolesFromMyMember(
        @Request() request,
        @CurrentTenantId() tenantId: string,
        @Param("userId") userId: string,
        @Body(new ValidationPipe(ValidationSchema.OperatingRoleSchema))
            body: { roles: string[] },
    ): Promise<Role[]> {
        return this._removeRolesFromMember(request, tenantId, userId, body);
    }

    @Get("/my/member/:userId/roles")
    @UseGuards(JwtAuthGuard)
    async getMyMemberRoles(
        @Request() request,
        @CurrentTenantId() tenantId: string,
        @Param("userId") userId: string,
    ): Promise<any> {
        return this._getMemberRoles(request, tenantId, userId);
    }

    // ─── Shared implementation methods ───

    private async _getTenantMembers(request: any, tenantId: string): Promise<User[]> {
        let tenant = await this.tenantService.findById(request, tenantId);
        this.securityService.check(
            request,
            Action.Read,
            subject(SubjectEnum.TENANT, tenant),
        );
        this.securityService.isAuthorized(
            request,
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
                request,
                tenant,
                member,
            );
        }
        return members;
    }

    private async _addMember(request: any, tenantId: string, body: { emails: string[] }): Promise<Tenant> {
        let tenant = await this.tenantService.findById(request, tenantId);
        this.securityService.check(
            request,
            Action.Update,
            subject(SubjectEnum.TENANT, tenant),
        );
        const adminContext = await this.securityService.getContextForMemberManagement(tenantId);
        for (const email of body.emails) {
            const isPresent = await this.usersService.existByEmail(
                adminContext,
                email,
            );
            if (!isPresent) {
                await this.usersService.createShadowUser(adminContext, email, email);
            }
            const user = await this.usersService.findByEmail(adminContext, email);
            await this.tenantService.addMember(request, tenant.id, user);
        }
        tenant = await this.tenantService.findById(request, tenantId);
        return tenant;
    }

    private async _removeMember(request: any, tenantId: string, body: { emails: string[] }): Promise<Tenant> {
        let tenant = await this.tenantService.findById(request, tenantId);
        this.securityService.check(
            request,
            Action.Update,
            subject(SubjectEnum.TENANT, tenant),
        );
        for (const email of body.emails) {
            const user = await this.usersService.findByEmail(request, email);
            let securityContext = this.securityService.getToken(request);
            if (securityContext.email === email) {
                throw new ForbiddenException("cannot remove self");
            }
            return this.tenantService.removeMember(request, tenantId, user);
        }
    }

    private async _getMember(request: any, tenantId: string, userId: string): Promise<any> {
        const user = await this.usersService.findById(request, userId);
        const tenant = await this.tenantService.findById(request, tenantId);
        this.securityService.check(
            request,
            Action.Read,
            subject(SubjectEnum.TENANT, tenant),
        );
        let roles = await this.tenantService.getMemberRoles(
            request,
            tenantId,
            user,
        );
        return {
            tenantId: tenant.id,
            userId: user.id,
            roles: roles,
        };
    }

    private async _setMemberRoles(request: any, tenantId: string, userId: string, body: { roles: string[] }): Promise<Role[]> {
        const user = await this.usersService.findById(request, userId);
        let tenant = await this.tenantService.findById(request, tenantId);
        this.securityService.check(
            request,
            Action.Update,
            subject(SubjectEnum.TENANT, tenant),
        );
        return this.tenantService.updateRolesOfMember(
            request,
            body.roles,
            tenantId,
            user,
        );
    }

    private async _addRolesToMember(request: any, tenantId: string, userId: string, body: { roles: string[] }): Promise<Role[]> {
        const user = await this.usersService.findById(request, userId);
        const tenant = await this.tenantService.findById(request, tenantId);
        this.securityService.check(
            request,
            Action.Update,
            subject(SubjectEnum.TENANT, tenant),
        );
        await this.roleService.addRoles(request, user, tenant, body.roles);
        return this.roleService.getMemberRoles(request, tenant, user);
    }

    private async _removeRolesFromMember(request: any, tenantId: string, userId: string, body: { roles: string[] }): Promise<Role[]> {
        const user = await this.usersService.findById(request, userId);
        const tenant = await this.tenantService.findById(request, tenantId);
        this.securityService.check(
            request,
            Action.Update,
            subject(SubjectEnum.TENANT, tenant),
        );
        await this.roleService.removeRoles(request, user, tenant, body.roles);
        return this.roleService.getMemberRoles(request, tenant, user);
    }

    private async _getMemberRoles(request: any, tenantId: string, userId: string): Promise<any> {
        const user = await this.usersService.findById(request, userId);
        const tenant = await this.tenantService.findById(request, tenantId);
        this.securityService.check(
            request,
            Action.Read,
            subject(SubjectEnum.TENANT, tenant),
        );
        let roles = await this.tenantService.getMemberRoles(
            request,
            tenantId,
            user,
        );
        return {
            roles: roles,
        };
    }
}
