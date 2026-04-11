import {
    ClassSerializerInterceptor,
    Controller,
    Delete,
    Get,
    Param,
    Post,
    UseGuards,
    UseInterceptors,
} from "@nestjs/common";
import {Environment} from "../config/environment.service";
import {TenantService} from "../services/tenant.service";
import {JwtAuthGuard} from "../auth/jwt-auth.guard";
import {RoleService} from "../services/role.service";
import {Role} from "../entity/role.entity";
import {Action} from "../casl/actions.enum";
import {SubjectEnum} from "../entity/subjectEnum";
import {UsersService} from "../services/users.service";
import {CurrentPermission, CurrentTenantId, Permission} from "../auth/auth.decorator";

@Controller("api/tenant")
@UseInterceptors(ClassSerializerInterceptor)
export class RoleController {
    constructor(
        private readonly configService: Environment,
        private readonly tenantService: TenantService,
        private readonly userService: UsersService,
        private readonly roleService: RoleService,
    ) {
    }

    // ─── New token-derived routes (no :tenantId in URL) ───

    @Post("/my/role/:name")
    @UseGuards(JwtAuthGuard)
    async createMyRole(
        @CurrentPermission() permission: Permission,
        @CurrentTenantId() tenantId: string,
        @Param("name") name: string,
    ): Promise<Role> {
        return this._createRole(permission, tenantId, name);
    }

    @Delete("/my/role/:name")
    @UseGuards(JwtAuthGuard)
    async deleteMyRole(
        @CurrentPermission() permission: Permission,
        @CurrentTenantId() tenantId: string,
        @Param("name") name: string,
    ): Promise<Role> {
        return this._deleteRole(permission, tenantId, name);
    }

    @Get("/my/roles")
    @UseGuards(JwtAuthGuard)
    async getMyTenantRoles(
        @CurrentPermission() permission: Permission,
        @CurrentTenantId() tenantId: string,
    ): Promise<Role[]> {
        return this._getTenantRoles(permission, tenantId);
    }

    @Get("/my/role/:name")
    @UseGuards(JwtAuthGuard)
    async getMyRole(
        @CurrentPermission() permission: Permission,
        @CurrentTenantId() tenantId: string,
        @Param("name") name: string,
    ): Promise<any> {
        return this._getRole(permission, tenantId, name);
    }

    // ─── Shared implementation methods ───

    private async _createRole(permission: Permission, tenantId: string, name: string): Promise<Role> {
        const tenant = await this.tenantService.findById(permission, tenantId);
        permission.isAuthorized(Action.Update, SubjectEnum.TENANT, tenant);
        return this.roleService.create(permission, name, tenant);
    }

    private async _deleteRole(permission: Permission, tenantId: string, name: string): Promise<Role> {
        const tenant = await this.tenantService.findById(permission, tenantId);
        permission.isAuthorized(Action.Update, SubjectEnum.TENANT, tenant);
        const role = await this.roleService.findByNameAndTenant(permission, name, tenant);
        return this.roleService.deleteById(permission, role.id);
    }

    private async _getTenantRoles(permission: Permission, tenantId: string): Promise<Role[]> {
        const tenant = await this.tenantService.findById(permission, tenantId);
        return this.tenantService.getTenantRoles(permission, tenant);
    }

    private async _getRole(permission: Permission, tenantId: string, name: string): Promise<any> {
        const tenant = await this.tenantService.findById(permission, tenantId);
        permission.isAuthorized(Action.Read, SubjectEnum.TENANT, tenant);
        const role = await this.roleService.findByNameAndTenant(permission, name, tenant);
        const users = await this.userService.findByRole(permission, role);
        return {role, users};
    }
}
