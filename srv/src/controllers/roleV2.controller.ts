import {
    Body,
    ClassSerializerInterceptor,
    Controller,
    Get,
    Param,
    Patch,
    UseGuards,
    UseInterceptors,
} from "@nestjs/common";
import {Environment} from "../config/environment.service";
import {TenantService} from "../services/tenant.service";
import {JwtAuthGuard} from "../auth/jwt-auth.guard";
import {RoleService} from "../services/role.service";
import {Role} from "../entity/role.entity";
import {UsersService} from "../services/users.service";
import * as yup from "yup";
import {ValidationPipe} from "../validation/validation.pipe";
import {Action} from "../casl/actions.enum";
import {SubjectEnum} from "../entity/subjectEnum";
import {CurrentPermission, Permission} from "../auth/auth.decorator";

@Controller("api/role")
@UseInterceptors(ClassSerializerInterceptor)
export class RoleControllerV2 {

    static UpdateRoleSchema = yup.object().shape({
        name: yup.string().optional(),
        description: yup.string().optional(),
        appId: yup.string().optional(),
    });

    constructor(
        private readonly configService: Environment,
        private readonly tenantService: TenantService,
        private readonly userService: UsersService,
        private readonly roleService: RoleService,
    ) {
    }

    @Patch("/:roleId")
    @UseGuards(JwtAuthGuard)
    async updateRoleDescription(
        @CurrentPermission() permission: Permission,
        @Param("roleId") roleId: string,
        @Body(new ValidationPipe(RoleControllerV2.UpdateRoleSchema))
        body: { name: string; description: string; appId?: string },
    ): Promise<Role> {
        return this.roleService.updateRole(permission, roleId, body.name, body.description, body.appId);
    }

    @Get("/:roleId")
    @UseGuards(JwtAuthGuard)
    async getRole(
        @CurrentPermission() permission: Permission,
        @Param("roleId") roleId: string,
    ): Promise<any> {
        const role = await this.roleService.findById(permission, roleId);
        permission.isAuthorized(Action.Read, SubjectEnum.TENANT, role.tenant);
        const users = await this.userService.findByRole(permission, role);
        return {role, users};
    }
}
