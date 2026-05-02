import {
    Body,
    ClassSerializerInterceptor,
    Controller,
    Delete,
    Get,
    Param,
    Patch,
    Post,
    UseGuards,
    UseInterceptors,
} from "@nestjs/common";
import {Environment} from "../config/environment.service";
import {ValidationPipe} from "../validation/validation.pipe";
import {ValidationSchema} from "../validation/validation.schema";
import {TenantService} from "../services/tenant.service";
import {GroupService} from "../services/group.service";
import {JwtAuthGuard} from "../auth/jwt-auth.guard";
import {CurrentPermission, CurrentTenantId, Permission} from "../auth/auth.decorator";

@Controller("/api")
@UseInterceptors(ClassSerializerInterceptor)
export class GroupController {
    constructor(
        private readonly configService: Environment,
        private readonly groupService: GroupService,
        private readonly tenantService: TenantService,
    ) {
    }

    // ─── New token-derived route ───

    @Get("/tenant/my/groups")
    @UseGuards(JwtAuthGuard)
    async getMyTenantGroups(
        @CurrentPermission() permission: Permission,
        @CurrentTenantId() tenantId: string,
    ): Promise<any> {
        let tenant = await this.tenantService.findById(permission, tenantId);
        return await this.groupService.findByTenantId(permission, tenant.id);
    }

    // ─── Non-tenant routes (no migration needed) ───

    @Post("/group/create")
    @UseGuards(JwtAuthGuard)
    async createGroup(
        @CurrentPermission() permission: Permission,
        @Body(new ValidationPipe(ValidationSchema.CreateGroupSchema))
        body: { name: string; tenantId: string },
    ): Promise<any> {
        let tenant = await this.tenantService.findById(permission, body.tenantId);
        let group = await this.groupService.create(permission, body.name, tenant);
        return group;
    }

    @Get("/group/:groupId")
    @UseGuards(JwtAuthGuard)
    async getGroup(
        @CurrentPermission() permission: Permission,
        @Param("groupId") groupId: string,
    ): Promise<any> {
        let group = await this.groupService.findById(permission, groupId);
        let roles = await this.groupService.findGroupRoles(permission, group);
        let users = await this.groupService.findGroupUsers(permission, group);
        return {
            group: group,
            roles: roles,
            users: users,
        };
    }

    @Patch("/group/:groupId/update")
    @UseGuards(JwtAuthGuard)
    async updateGroup(
        @CurrentPermission() permission: Permission,
        @Param("groupId") groupId: string,
        @Body(new ValidationPipe(ValidationSchema.UpdateGroupSchema))
        body: { name: string },
    ): Promise<any> {
        let group = await this.groupService.findById(permission, groupId);
        await this.groupService.updateGroup(permission, group, body);
        return group;
    }

    @Delete("/group/:groupId/delete")
    @UseGuards(JwtAuthGuard)
    async deleteGroup(
        @CurrentPermission() permission: Permission,
        @Param("groupId") groupId: string,
    ): Promise<any> {
        let group = await this.groupService.findById(permission, groupId);
        await this.groupService.deleteById(permission, groupId);
        return group;
    }

    @Post("/group/:groupId/add-roles")
    @UseGuards(JwtAuthGuard)
    async addRole(
        @CurrentPermission() permission: Permission,
        @Param("groupId") groupId: string,
        @Body(new ValidationPipe(ValidationSchema.UpdateGroupRole))
        body: { roles: string[] },
    ): Promise<any> {
        let group = await this.groupService.findById(permission, groupId);
        await this.groupService.addRoles(permission, group, body.roles);
        let roles = await this.groupService.findGroupRoles(permission, group);
        return {
            group: group,
            roles: roles,
        };
    }

    @Post("/group/:groupId/remove-roles")
    @UseGuards(JwtAuthGuard)
    async removeRole(
        @CurrentPermission() permission: Permission,
        @Param("groupId") groupId: string,
        @Body(new ValidationPipe(ValidationSchema.UpdateGroupRole))
        body: { roles: string[] },
    ): Promise<any> {
        let group = await this.groupService.findById(permission, groupId);
        await this.groupService.removeRoles(permission, group, body.roles);
        let roles = await this.groupService.findGroupRoles(permission, group);
        return {
            group: group,
            roles: roles,
        };
    }

    @Post("/group/:groupId/add-users")
    @UseGuards(JwtAuthGuard)
    async addUsers(
        @CurrentPermission() permission: Permission,
        @Param("groupId") groupId: string,
        @Body(new ValidationPipe(ValidationSchema.UpdateGroupUser))
        body: { users: string[] },
    ): Promise<any> {
        let group = await this.groupService.findById(permission, groupId);
        await this.groupService.addUser(permission, group, body.users);
        let users = await this.groupService.findGroupUsers(permission, group);
        return {
            group: group,
            users: users,
        };
    }

    @Post("/group/:groupId/remove-users")
    @UseGuards(JwtAuthGuard)
    async removeUsers(
        @CurrentPermission() permission: Permission,
        @Param("groupId") groupId: string,
        @Body(new ValidationPipe(ValidationSchema.UpdateGroupUser))
        body: { users: string[] },
    ): Promise<any> {
        let group = await this.groupService.findById(permission, groupId);
        await this.groupService.removeUser(permission, group, body.users);
        let users = await this.groupService.findGroupUsers(permission, group);
        return {
            group: group,
            users: users,
        };
    }
}
