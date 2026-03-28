import {
    ClassSerializerInterceptor,
    Controller,
    Delete,
    Get,
    Param,
    Post,
    Request,
    UseGuards,
    UseInterceptors,
} from "@nestjs/common";
import {Environment} from "../config/environment.service";
import {TenantService} from "../services/tenant.service";
import {JwtAuthGuard} from "../auth/jwt-auth.guard";
import {RoleService} from "../services/role.service";
import {Role} from "../entity/role.entity";
import {SecurityService} from "../casl/security.service";
import {Action} from "../casl/actions.enum";
import {subject} from "@casl/ability";
import {SubjectEnum} from "../entity/subjectEnum";
import {UsersService} from "../services/users.service";
import {CurrentTenantId} from "../auth/current-tenant.decorator";

@Controller("api/tenant")
@UseInterceptors(ClassSerializerInterceptor)
export class RoleController {
    constructor(
        private readonly configService: Environment,
        private readonly tenantService: TenantService,
        private readonly userService: UsersService,
        private readonly roleService: RoleService,
        private readonly securityService: SecurityService,
    ) {
    }

    // ─── New token-derived routes (no :tenantId in URL) ───

    @Post("/my/role/:name")
    @UseGuards(JwtAuthGuard)
    async createMyRole(
        @Request() request,
        @CurrentTenantId() tenantId: string,
        @Param("name") name: string,
    ): Promise<Role> {
        return this._createRole(request, tenantId, name);
    }

    @Delete("/my/role/:name")
    @UseGuards(JwtAuthGuard)
    async deleteMyRole(
        @Request() request,
        @CurrentTenantId() tenantId: string,
        @Param("name") name: string,
    ): Promise<Role> {
        return this._deleteRole(request, tenantId, name);
    }

    @Get("/my/roles")
    @UseGuards(JwtAuthGuard)
    async getMyTenantRoles(
        @Request() request,
        @CurrentTenantId() tenantId: string,
    ): Promise<Role[]> {
        return this._getTenantRoles(request, tenantId);
    }

    @Get("/my/role/:name")
    @UseGuards(JwtAuthGuard)
    async getMyRole(
        @Request() request,
        @CurrentTenantId() tenantId: string,
        @Param("name") name: string,
    ): Promise<any> {
        return this._getRole(request, tenantId, name);
    }

    // ─── Shared implementation methods ───

    private async _createRole(request: any, tenantId: string, name: string): Promise<Role> {
        let tenant = await this.tenantService.findById(request, tenantId);
        this.securityService.check(
            request,
            Action.Update,
            subject(SubjectEnum.TENANT, tenant),
        );
        return this.roleService.create(request, name, tenant);
    }

    private async _deleteRole(request: any, tenantId: string, name: string): Promise<Role> {
        let tenant = await this.tenantService.findById(request, tenantId);
        this.securityService.check(
            request,
            Action.Update,
            subject(SubjectEnum.TENANT, tenant),
        );
        let roles = await this.roleService.findByNameAndTenant(
            request,
            name,
            tenant,
        );
        return await this.roleService.deleteById(request, roles.id);
    }

    private async _getTenantRoles(request: any, tenantId: string): Promise<Role[]> {
        const tenant = await this.tenantService.findById(request, tenantId);
        return this.tenantService.getTenantRoles(request, tenant);
    }

    private async _getRole(request: any, tenantId: string, name: string): Promise<any> {
        const tenant = await this.tenantService.findById(request, tenantId);
        this.securityService.check(
            request,
            Action.Read,
            subject(SubjectEnum.TENANT, tenant),
        );
        let role = await this.roleService.findByNameAndTenant(
            request,
            name,
            tenant,
        );
        let users = await this.userService.findByRole(request, role);
        return {
            role: role,
            users: users,
        };
    }
}
