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
import {UsersService} from "../services/users.service";
import {TenantService} from "../services/tenant.service";
import {ValidationPipe} from "../validation/validation.pipe";
import {ValidationSchema} from "../validation/validation.schema";
import {Tenant} from "../entity/tenant.entity";
import {JwtAuthGuard} from "../auth/jwt-auth.guard";
import {SecurityService} from "../casl/security.service";
import {SubjectEnum} from "../entity/subjectEnum";
import {Action} from "../casl/actions.enum";
import {subject} from "@casl/ability";
import {CurrentTenantId} from "../auth/current-tenant.decorator";
import * as yup from "yup";

@Controller("api/tenant")
@UseInterceptors(ClassSerializerInterceptor)
export class TenantController {
    static UpdateTenantSchema = yup.object().shape({
        name: yup.string().max(128),
        allowSignUp: yup.boolean(),
    });

    constructor(
        private readonly configService: Environment,
        private readonly tenantService: TenantService,
        private readonly usersService: UsersService,
        private readonly securityService: SecurityService,
    ) {
    }

    @Post("/create")
    @UseGuards(JwtAuthGuard)
    async createTenant(
        @Request() request,
        @Body(new ValidationPipe(ValidationSchema.CreateTenantSchema))
            body: any,
    ): Promise<Tenant> {
        const user = await this.usersService.findByEmail(
            request,
            request.user.email,
        );
        const tenant: Tenant = await this.tenantService.create(
            request,
            body.name,
            body.domain,
            user,
        );
        return tenant;
    }

    // ─── New token-derived routes (no :tenantId in URL) ───

    @Patch("/my")
    @UseGuards(JwtAuthGuard)
    async updateMyTenant(
        @Request() request,
        @CurrentTenantId() tenantId: string,
        @Body(new ValidationPipe(TenantController.UpdateTenantSchema))
            body: { name?: string; allowSignUp?: boolean },
    ): Promise<Tenant> {
        return this._updateTenant(request, tenantId, body);
    }

    @Delete("/my")
    @UseGuards(JwtAuthGuard)
    async deleteMyTenant(
        @Request() request,
        @CurrentTenantId() tenantId: string,
    ): Promise<Tenant> {
        return this.tenantService.deleteTenant(request, tenantId);
    }

    @Get("/my/credentials")
    @UseGuards(JwtAuthGuard)
    async getMyCredentials(@Request() request): Promise<any> {
        let securityContext =
            this.securityService.getUserOrTechnicalSecurityContext(request);
        let tenant = await this.tenantService.findById(
            request,
            securityContext.tenant.id,
        );
        this.securityService.check(
            request,
            Action.ReadCredentials,
            subject(SubjectEnum.TENANT, tenant),
        );
        return {
            id: tenant.id,
            clientId: tenant.clientId,
            clientSecret: tenant.clientSecret,
            publicKey: tenant.publicKey,
        };
    }

    @Get("/my/info")
    @UseGuards(JwtAuthGuard)
    async getMyTenant(
        @Request() request,
        @CurrentTenantId() tenantId: string,
    ): Promise<Tenant> {
        return this._getTenant(request, tenantId);
    }

    // ─── Shared implementation methods ───

    private async _updateTenant(request: any, tenantId: string, body: { name?: string; allowSignUp?: boolean }): Promise<Tenant> {
        let tenant = await this.tenantService.findById(request, tenantId);
        this.securityService.check(
            request,
            Action.Update,
            subject(SubjectEnum.TENANT, tenant),
        );
        return this.tenantService.updateTenant(request, tenantId, body);
    }

    private async _getTenant(request: any, tenantId: string): Promise<Tenant> {
        let tenant = await this.tenantService.findById(request, tenantId);
        this.securityService.check(
            request,
            Action.Read,
            subject(SubjectEnum.TENANT, tenant),
        );
        return tenant;
    }
}
