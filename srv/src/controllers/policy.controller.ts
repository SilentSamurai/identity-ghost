import {
    Body,
    ClassSerializerInterceptor,
    Controller,
    Delete,
    Get,
    NotFoundException,
    Param,
    Patch,
    Post,
    UseGuards,
    UseInterceptors,
} from "@nestjs/common";
import {Environment} from "../config/environment.service";
import {SecurityService} from "../casl/security.service";
import {JwtAuthGuard} from "../auth/jwt-auth.guard";
import {PolicyService} from "../casl/policy.service";
import {CaslAbilityFactory} from "../casl/casl-ability.factory";
import {RoleService} from "../services/role.service";
import {ValidationPipe} from "../validation/validation.pipe";
import * as yup from "yup";
import {Action, Effect} from "../casl/actions.enum";
import {Policy} from "../entity/authorization.entity";
import {TenantService} from "../services/tenant.service";
import {UsersService} from "../services/users.service";
import {CurrentPermission, Permission} from "../auth/auth.decorator";

@Controller("api/v1")
@UseInterceptors(ClassSerializerInterceptor)
export class PolicyController {
    static CreateSchema = yup.object().shape({
        role: yup.string().uuid().required("role is required"),
        effect: yup
            .mixed<Effect>()
            .required("effect is required")
            .oneOf(Object.values(Effect)),
        action: yup
            .mixed<Action>()
            .required("action is required")
            .oneOf(Object.values(Action)),
        subject: yup.string().required("subject is required"),
        conditions: yup.object(),
    });
    static UpdateSchema = yup.object().shape({
        effect: yup.mixed<Effect>().oneOf(Object.values(Effect)),
        action: yup.mixed<Action>().oneOf(Object.values(Action)),
        subject: yup.string(),
        conditions: yup.object(),
    });

    constructor(
        private readonly configService: Environment,
        private readonly securityService: SecurityService,
        private readonly policyService: PolicyService,
        private readonly roleService: RoleService,
        private readonly tenantService: TenantService,
        private readonly usersService: UsersService,
    ) {
    }

    @Get("/my/internal-permissions")
    @UseGuards(JwtAuthGuard)
    async getMyInternalPermissions(@CurrentPermission() permission: Permission): Promise<any> {
        return permission.authContext.SCOPE_ABILITIES.rules;
    }

    @Get("/my/permissions")
    @UseGuards(JwtAuthGuard)
    async getMyPermission(@CurrentPermission() permission: Permission): Promise<Policy[]> {
        const token = permission.authContext.SECURITY_CONTEXT;
        if (!token.isTenantToken()) return [];
        const tenantToken = token as any;
        const customRoleNames = tenantToken.roles.filter(
            (name) => !CaslAbilityFactory.isInternalRole(name),
        );

        if (customRoleNames.length === 0) return [];

        const tenant = await this.tenantService.findById(permission, tenantToken.tenant.id);

        const policies: Policy[] = [];
        for (const roleName of customRoleNames) {
            try {
                const role = await this.roleService.findByNameAndTenant(permission, roleName, tenant);
                const rolePolicies = await this.policyService.findByRole(permission, role, role.tenant);
                policies.push(...rolePolicies);
            } catch (e) {
                if (e instanceof NotFoundException) continue;
                throw e;
            }
        }
        return policies;
    }

    @Post("/tenant-user/permissions")
    @UseGuards(JwtAuthGuard)
    async getUserPermissions(
        @CurrentPermission() permission: Permission,
        @Body("email") email: string,
    ): Promise<any> {
        let token = this.securityService.getTechnicalToken(permission.authContext);
        let tenant = await this.tenantService.findById(
            permission,
            token.tenant.id,
        );

        let user = await this.tenantService.findMember(permission, tenant, email);
        let roles = await this.tenantService.getMemberRoles(
            permission,
            tenant.id,
            user,
        );

        let policies = [];
        for (let role of roles) {
            let policiesOfRole = await this.policyService.findByRole(
                permission,
                role,
                tenant,
            );
            policies.push(...policiesOfRole);
        }
        return policies;
    }

    @Post("/policy/create")
    @UseGuards(JwtAuthGuard)
    async createPermission(
        @CurrentPermission() permission: Permission,
        @Body(new ValidationPipe(PolicyController.CreateSchema))
        body: {
            role: string;
            effect: Effect;
            action: Action;
            subject: string;
            conditions: { [string: string]: string } | null;
        },
    ): Promise<Policy> {
        const role = await this.roleService.findById(permission, body.role);
        const policy = await this.policyService.createAuthorization(
            permission,
            role,
            body.effect,
            body.action,
            body.subject,
            body.conditions,
        );
        return policy;
    }

    @Get("/policy/:id")
    @UseGuards(JwtAuthGuard)
    async getAuthorization(
        @CurrentPermission() permission: Permission,
        @Param("id") id: string,
    ) {
        const auth = await this.policyService.findById(permission, id);
        return auth;
    }

    @Get("/policy/byRole/:role_id")
    @UseGuards(JwtAuthGuard)
    async getAuthByRole(
        @CurrentPermission() permission: Permission,
        @Param("role_id") role_id: string,
    ) {
        const role = await this.roleService.findById(permission, role_id);
        const auth = await this.policyService.findByRole(
            permission,
            role,
            role.tenant,
        );
        return auth;
    }

    @Patch("/policy/:id")
    @UseGuards(JwtAuthGuard)
    async updateAuthorization(
        @CurrentPermission() permission: Permission,
        @Param("id") id: string,
        @Body(new ValidationPipe(PolicyController.UpdateSchema))
        body: {
            effect?: Effect;
            action?: Action;
            subject?: string;
            conditions?: { [string: string]: string } | null;
        },
    ) {
        const auth = await this.policyService.updateAuthorization(
            permission,
            id,
            body,
        );
        return auth;
    }

    @Delete("/policy/:id")
    @UseGuards(JwtAuthGuard)
    async deleteAuthorization(
        @CurrentPermission() permission: Permission,
        @Param("id") id: string,
    ) {
        const auth = await this.policyService.removeAuthorization(
            permission,
            id,
        );
        return auth;
    }
}
