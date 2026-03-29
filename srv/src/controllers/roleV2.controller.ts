import {
    Body,
    ClassSerializerInterceptor,
    Controller,
    Get,
    Param,
    Patch,
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
import {UsersService} from "../services/users.service";
import * as yup from "yup";
import {ValidationPipe} from "../validation/validation.pipe";
import {Action} from "../casl/actions.enum";
import {subject} from "@casl/ability";
import {SubjectEnum} from "../entity/subjectEnum";

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
        private readonly securityService: SecurityService,
    ) {
    }

    @Patch("/:roleId")
    @UseGuards(JwtAuthGuard)
    async updateRoleDescription(
        @Request() request: any,
        @Param("roleId") roleId: string,
        @Body(new ValidationPipe(RoleControllerV2.UpdateRoleSchema))
        body: { name: string; description: string; appId?: string },
    ): Promise<Role> {
        return this.roleService.updateRole(
            request,
            roleId,
            body.name,
            body.description,
            body.appId,
        );
    }

    @Get("/:roleId")
    @UseGuards(JwtAuthGuard)
    async getRole(
        @Request() request,
        @Param("roleId") roleId: string,
    ): Promise<any> {
        const role = await this.roleService.findById(request, roleId);
        const tenant = role.tenant;
        this.securityService.check(
            request,
            Action.Read,
            subject(SubjectEnum.TENANT, tenant),
        );
        let users = await this.userService.findByRole(request, role);
        return {
            role: role,
            users: users,
        };
    }
}
