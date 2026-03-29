import {
    Body,
    ClassSerializerInterceptor,
    Controller,
    Delete,
    Get,
    Param,
    Patch,
    Post,
    Request,
    UseGuards,
    UseInterceptors,
} from "@nestjs/common";
import {Environment} from "../config/environment.service";
import {ValidationPipe} from "../validation/validation.pipe";
import {ValidationSchema} from "../validation/validation.schema";
import {TenantService} from "../services/tenant.service";
import {GroupService} from "../services/group.service";
import {JwtAuthGuard} from "../auth/jwt-auth.guard";
import {CurrentTenantId} from "../auth/current-tenant.decorator";

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
        @Request() request,
        @CurrentTenantId() tenantId: string,
    ): Promise<any> {
        let tenant = await this.tenantService.findById(request, tenantId);
        return await this.groupService.findByTenantId(request, tenant.id);
    }

    // ─── Non-tenant routes (no migration needed) ───

    @Post("/group/create")
    @UseGuards(JwtAuthGuard)
    async createGroup(
        @Request() request,
        @Body(new ValidationPipe(ValidationSchema.CreateGroupSchema))
        body: { name: string; tenantId: string },
    ): Promise<any> {
        let tenant = await this.tenantService.findById(request, body.tenantId);
        let group = await this.groupService.create(request, body.name, tenant);
        return group;
    }

    @Get("/group/:groupId")
    @UseGuards(JwtAuthGuard)
    async getGroup(
        @Request() request,
        @Param("groupId") groupId: string,
    ): Promise<any> {
        let group = await this.groupService.findById(request, groupId);
        let roles = await this.groupService.findGroupRoles(request, group);
        let users = await this.groupService.findGroupUsers(request, group);
        return {
            group: group,
            roles: roles,
            users: users,
        };
    }

    @Patch("/group/:groupId/update")
    @UseGuards(JwtAuthGuard)
    async updateGroup(
        @Request() request,
        @Param("groupId") groupId: string,
        @Body(new ValidationPipe(ValidationSchema.UpdateGroupSchema))
        body: { name: string },
    ): Promise<any> {
        let group = await this.groupService.findById(request, groupId);
        await this.groupService.updateGroup(request, group, body);
        return group;
    }

    @Delete("/group/:groupId/delete")
    @UseGuards(JwtAuthGuard)
    async deleteGroup(
        @Request() request,
        @Param("groupId") groupId: string,
    ): Promise<any> {
        let group = await this.groupService.findById(request, groupId);
        await this.groupService.deleteById(request, groupId);
        return group;
    }

    @Post("/group/:groupId/add-roles")
    @UseGuards(JwtAuthGuard)
    async addRole(
        @Request() request,
        @Param("groupId") groupId: string,
        @Body(new ValidationPipe(ValidationSchema.UpdateGroupRole))
        body: { roles: string[] },
    ): Promise<any> {
        let group = await this.groupService.findById(request, groupId);
        await this.groupService.addRoles(request, group, body.roles);
        let roles = await this.groupService.findGroupRoles(request, group);
        return {
            group: group,
            roles: roles,
        };
    }

    @Post("/group/:groupId/remove-roles")
    @UseGuards(JwtAuthGuard)
    async removeRole(
        @Request() request,
        @Param("groupId") groupId: string,
        @Body(new ValidationPipe(ValidationSchema.UpdateGroupRole))
        body: { roles: string[] },
    ): Promise<any> {
        let group = await this.groupService.findById(request, groupId);
        await this.groupService.removeRoles(request, group, body.roles);
        let roles = await this.groupService.findGroupRoles(request, group);
        return {
            group: group,
            roles: roles,
        };
    }

    @Post("/group/:groupId/add-users")
    @UseGuards(JwtAuthGuard)
    async addUsers(
        @Request() request,
        @Param("groupId") groupId: string,
        @Body(new ValidationPipe(ValidationSchema.UpdateGroupUser))
        body: { users: string[] },
    ): Promise<any> {
        let group = await this.groupService.findById(request, groupId);
        await this.groupService.addUser(request, group, body.users);
        let users = await this.groupService.findGroupUsers(request, group);
        return {
            group: group,
            users: users,
        };
    }

    @Post("/group/:groupId/remove-users")
    @UseGuards(JwtAuthGuard)
    async removeUsers(
        @Request() request,
        @Param("groupId") groupId: string,
        @Body(new ValidationPipe(ValidationSchema.UpdateGroupUser))
        body: { users: string[] },
    ): Promise<any> {
        let group = await this.groupService.findById(request, groupId);
        await this.groupService.removeUser(request, group, body.users);
        let users = await this.groupService.findGroupUsers(request, group);
        return {
            group: group,
            users: users,
        };
    }
}
