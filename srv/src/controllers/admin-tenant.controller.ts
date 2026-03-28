import {
    Body,
    ClassSerializerInterceptor,
    Controller,
    Delete,
    ForbiddenException,
    Get,
    Param,
    ParseUUIDPipe,
    Patch,
    Post,
    Put,
    Request,
    UseGuards,
    UseInterceptors,
} from "@nestjs/common";
import {JwtAuthGuard} from "../auth/jwt-auth.guard";
import {SuperAdminGuard} from "../auth/super-admin.guard";
import {TenantService} from "../services/tenant.service";
import {UsersService} from "../services/users.service";
import {RoleService} from "../services/role.service";
import {SecurityService} from "../casl/security.service";
import {GroupService} from "../services/group.service";
import {ClientService} from "../services/client.service";
import {AppService} from "../services/app.service";
import {SubscriptionService} from "../services/subscription.service";
import {ValidationPipe} from "../validation/validation.pipe";
import {ValidationSchema} from "../validation/validation.schema";
import {Action} from "../casl/actions.enum";
import {subject} from "@casl/ability";
import {SubjectEnum} from "../entity/subjectEnum";
import {Tenant} from "../entity/tenant.entity";
import {User} from "../entity/user.entity";
import {Role} from "../entity/role.entity";
import {InjectRepository} from "@nestjs/typeorm";
import {Repository} from "typeorm";
import * as yup from "yup";

/**
 * Admin routes that explicitly accept :tenantId because super admins
 * need to operate on arbitrary tenants. The SuperAdminGuard ensures
 * only super admins can reach these routes.
 */
@Controller("api/admin/tenant")
@UseInterceptors(ClassSerializerInterceptor)
@UseGuards(JwtAuthGuard, SuperAdminGuard)
export class AdminTenantController {
    static UpdateTenantSchema = yup.object().shape({
        name: yup.string().max(128),
        allowSignUp: yup.boolean(),
    });

    static MemberOperationSchema = yup.object().shape({
        emails: yup.array().of(yup.string().max(128)),
    });

    constructor(
        private readonly tenantService: TenantService,
        private readonly usersService: UsersService,
        private readonly roleService: RoleService,
        private readonly securityService: SecurityService,
        private readonly groupService: GroupService,
        private readonly clientService: ClientService,
        private readonly appService: AppService,
        private readonly subscriptionService: SubscriptionService,
        @InjectRepository(User) private usersRepository: Repository<User>,
    ) {
    }

    // ─── Tenant operations ───

    @Get("")
    async getAllTenants(@Request() request): Promise<Tenant[]> {
        return this.tenantService.getAllTenants(request);
    }

    @Get("/:tenantId")
    async getTenant(
        @Request() request,
        @Param("tenantId", ParseUUIDPipe) tenantId: string,
    ): Promise<Tenant> {
        return this.tenantService.findById(request, tenantId);
    }

    @Patch("/:tenantId")
    async updateTenant(
        @Request() request,
        @Param("tenantId", ParseUUIDPipe) tenantId: string,
        @Body(new ValidationPipe(AdminTenantController.UpdateTenantSchema))
            body: { name?: string; allowSignUp?: boolean },
    ): Promise<Tenant> {
        return this.tenantService.updateTenant(request, tenantId, body);
    }

    @Delete("/:tenantId")
    async deleteTenant(
        @Request() request,
        @Param("tenantId", ParseUUIDPipe) tenantId: string,
    ): Promise<Tenant> {
        return this.tenantService.deleteTenant(request, tenantId);
    }

    @Get("/:tenantId/credentials")
    async getTenantCredentials(
        @Request() request,
        @Param("tenantId", ParseUUIDPipe) tenantId: string,
    ): Promise<any> {
        let tenant = await this.tenantService.findById(request, tenantId);
        return {
            id: tenant.id,
            clientId: tenant.clientId,
            clientSecret: tenant.clientSecret,
            publicKey: tenant.publicKey,
        };
    }

    // ─── Member operations ───

    @Get("/:tenantId/members")
    async getTenantMembers(
        @Request() request,
        @Param("tenantId", ParseUUIDPipe) tenantId: string,
    ): Promise<User[]> {
        let tenant = await this.tenantService.findById(request, tenantId);
        const members: User[] = await this.usersRepository.find({
            where: { tenants: { id: tenant.id } },
        });
        for (const member of members) {
            member.roles = await this.roleService.getMemberRoles(request, tenant, member);
        }
        return members;
    }

    @Get("/:tenantId/member/:userId")
    async getMember(
        @Request() request,
        @Param("tenantId", ParseUUIDPipe) tenantId: string,
        @Param("userId") userId: string,
    ): Promise<any> {
        const user = await this.usersService.findById(request, userId);
        const tenant = await this.tenantService.findById(request, tenantId);
        let roles = await this.tenantService.getMemberRoles(request, tenantId, user);
        return { tenantId: tenant.id, userId: user.id, roles };
    }

    @Get("/:tenantId/member/:userId/roles")
    async getMemberRoles(
        @Request() request,
        @Param("tenantId", ParseUUIDPipe) tenantId: string,
        @Param("userId") userId: string,
    ): Promise<any> {
        const user = await this.usersService.findById(request, userId);
        await this.tenantService.findById(request, tenantId);
        let roles = await this.tenantService.getMemberRoles(request, tenantId, user);
        return { roles };
    }

    @Put("/:tenantId/member/:userId/roles")
    async setMemberRoles(
        @Request() request,
        @Param("tenantId", ParseUUIDPipe) tenantId: string,
        @Param("userId") userId: string,
        @Body(new ValidationPipe(ValidationSchema.OperatingRoleSchema))
            body: { roles: string[] },
    ): Promise<Role[]> {
        const user = await this.usersService.findById(request, userId);
        await this.tenantService.findById(request, tenantId);
        return this.tenantService.updateRolesOfMember(request, body.roles, tenantId, user);
    }

    @Post("/:tenantId/members/add")
    async addMembers(
        @Request() request,
        @Param("tenantId", ParseUUIDPipe) tenantId: string,
        @Body(new ValidationPipe(AdminTenantController.MemberOperationSchema))
            body: { emails: string[] },
    ): Promise<Tenant> {
        let tenant = await this.tenantService.findById(request, tenantId);
        const adminContext = await this.securityService.getContextForMemberManagement(tenantId);
        for (const email of body.emails) {
            const isPresent = await this.usersService.existByEmail(adminContext, email);
            if (!isPresent) {
                await this.usersService.createShadowUser(adminContext, email, email);
            }
            const user = await this.usersService.findByEmail(adminContext, email);
            await this.tenantService.addMember(request, tenant.id, user);
        }
        return this.tenantService.findById(request, tenantId);
    }

    @Delete("/:tenantId/members/delete")
    async removeMembers(
        @Request() request,
        @Param("tenantId", ParseUUIDPipe) tenantId: string,
        @Body(new ValidationPipe(AdminTenantController.MemberOperationSchema))
            body: { emails: string[] },
    ): Promise<Tenant> {
        await this.tenantService.findById(request, tenantId);
        for (const email of body.emails) {
            const user = await this.usersService.findByEmail(request, email);
            const securityContext = this.securityService.getToken(request);
            if (securityContext.email === email) {
                throw new ForbiddenException("cannot remove self");
            }
            await this.tenantService.removeMember(request, tenantId, user);
        }
        return this.tenantService.findById(request, tenantId);
    }

    // ─── Role operations ───

    @Get("/:tenantId/roles")
    async getTenantRoles(
        @Request() request,
        @Param("tenantId", ParseUUIDPipe) tenantId: string,
    ): Promise<Role[]> {
        const tenant = await this.tenantService.findById(request, tenantId);
        return this.tenantService.getTenantRoles(request, tenant);
    }

    @Post("/:tenantId/role/:name")
    async createRole(
        @Request() request,
        @Param("tenantId", ParseUUIDPipe) tenantId: string,
        @Param("name") name: string,
    ): Promise<Role> {
        let tenant = await this.tenantService.findById(request, tenantId);
        return this.roleService.create(request, name, tenant);
    }

    @Delete("/:tenantId/role/:name")
    async deleteRole(
        @Request() request,
        @Param("tenantId", ParseUUIDPipe) tenantId: string,
        @Param("name") name: string,
    ): Promise<Role> {
        let tenant = await this.tenantService.findById(request, tenantId);
        let role = await this.roleService.findByNameAndTenant(request, name, tenant);
        return this.roleService.deleteById(request, role.id);
    }

    // ─── Group operations ───

    @Get("/:tenantId/groups")
    async getTenantGroups(
        @Request() request,
        @Param("tenantId", ParseUUIDPipe) tenantId: string,
    ): Promise<any> {
        let tenant = await this.tenantService.findById(request, tenantId);
        return this.groupService.findByTenantId(request, tenant.id);
    }

    // ─── Client operations ───

    @Get("/:tenantId/clients")
    async getTenantClients(
        @Request() request,
        @Param("tenantId", ParseUUIDPipe) tenantId: string,
    ) {
        return this.clientService.findByTenantId(tenantId);
    }

    // ─── App operations ───

    @Get("/:tenantId/apps/created")
    async getAppsCreatedByTenant(
        @Request() request,
        @Param("tenantId", ParseUUIDPipe) tenantId: string,
    ) {
        return this.appService.findByTenantId(tenantId);
    }

    @Get("/:tenantId/apps/subscriptions")
    async getTenantSubscriptions(
        @Request() request,
        @Param("tenantId", ParseUUIDPipe) tenantId: string,
    ) {
        return this.subscriptionService.findByTenantId(tenantId);
    }

    @Post("/:tenantId/apps/:appId/subscribe")
    async subscribeToApp(
        @Request() request,
        @Param("tenantId", ParseUUIDPipe) tenantId: string,
        @Param("appId", ParseUUIDPipe) appId: string,
    ) {
        const tenant = await this.tenantService.findById(request, tenantId);
        const app = await this.appService.getAppById(appId);
        await this.subscriptionService.subscribeApp(tenant, app);
        return {status: "success"};
    }

    @Post("/:tenantId/apps/:appId/unsubscribe")
    async unsubscribeFromApp(
        @Request() request,
        @Param("tenantId", ParseUUIDPipe) tenantId: string,
        @Param("appId", ParseUUIDPipe) appId: string,
    ) {
        const tenant = await this.tenantService.findById(request, tenantId);
        const app = await this.appService.getAppById(appId);
        await this.subscriptionService.unsubscribe(tenant, app);
        return {status: "success"};
    }
}
