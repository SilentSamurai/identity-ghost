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
    Request,
    UseGuards,
    UseInterceptors,
} from "@nestjs/common";
import {Environment} from "../config/environment.service";
import {SecurityService} from "../casl/security.service";
import {AuthContext} from "../casl/contexts";
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
    async getMyInternalPermissions(@Request() request: Request): Promise<any> {
        const ability = this.securityService.getAbility(
            request as unknown as AuthContext,
        );
        return ability.rules;
    }

    @Get("/my/permissions")
    @UseGuards(JwtAuthGuard)
    async getMyPermission(@Request() request: Request): Promise<Policy[]> {
        const authContext = request as unknown as AuthContext;
        const token = this.securityService.getToken(authContext);
        const customRoleNames = token.roles.filter(
            (name) => !CaslAbilityFactory.isInternalRole(name),
        );

        if (customRoleNames.length === 0) return [];

        const tenant = await this.tenantService.findById(
            authContext,
            token.tenant.id,
        );

        const policies: Policy[] = [];
        for (const roleName of customRoleNames) {
            try {
                const role = await this.roleService.findByNameAndTenant(
                    authContext,
                    roleName,
                    tenant,
                );
                const rolePolicies = await this.policyService.findByRole(
                    authContext,
                    role,
                    role.tenant,
                );
                policies.push(...rolePolicies);
            } catch (e) {
                if (e instanceof NotFoundException) {
                    continue;
                }
                throw e;
            }
        }
        return policies;
    }

    @Post("/tenant-user/permissions")
    @UseGuards(JwtAuthGuard)
    async getUserPermissions(
        @Request() request: AuthContext,
        @Body("email") email: string,
    ): Promise<any> {
        let token = this.securityService.getTechnicalToken(request);
        let tenant = await this.tenantService.findById(
            request,
            token.tenant.id,
        );

        let user = await this.tenantService.findMember(request, tenant, email);
        let roles = await this.tenantService.getMemberRoles(
            request,
            tenant.id,
            user,
        );

        let policies = [];
        for (let role of roles) {
            let policiesOfRole = await this.policyService.findByRole(
                request,
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
        @Request() request: Request,
        @Body(new ValidationPipe(PolicyController.CreateSchema))
        body: {
            role: string;
            effect: Effect;
            action: Action;
            subject: string;
            conditions: { [string: string]: string } | null;
        },
    ): Promise<Policy> {
        const authContext = request as any as AuthContext;
        const role = await this.roleService.findById(authContext, body.role);
        const policy = await this.policyService.createAuthorization(
            authContext,
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
        @Request() request: Request,
        @Param("id") id: string,
    ) {
        const authContext = request as any as AuthContext;
        const auth = await this.policyService.findById(authContext, id);
        return auth;
    }

    @Get("/policy/byRole/:role_id")
    @UseGuards(JwtAuthGuard)
    async getAuthByRole(
        @Request() authContext: AuthContext,
        @Param("role_id") role_id: string,
    ) {
        const role = await this.roleService.findById(authContext, role_id);
        const auth = await this.policyService.findByRole(
            authContext,
            role,
            role.tenant,
        );
        return auth;
    }

    @Patch("/policy/:id")
    @UseGuards(JwtAuthGuard)
    async updateAuthorization(
        @Request() request: Request,
        @Param("id") id: string,
        @Body(new ValidationPipe(PolicyController.UpdateSchema))
        body: {
            effect?: Effect;
            action?: Action;
            subject?: string;
            conditions?: { [string: string]: string } | null;
        },
    ) {
        const authContext = request as any as AuthContext;
        const auth = await this.policyService.updateAuthorization(
            authContext,
            id,
            body,
        );
        return auth;
    }

    @Delete("/policy/:id")
    @UseGuards(JwtAuthGuard)
    async deleteAuthorization(
        @Request() request: Request,
        @Param("id") id: string,
    ) {
        const authContext = request as any as AuthContext;
        const auth = await this.policyService.removeAuthorization(
            authContext,
            id,
        );
        return auth;
    }
}
