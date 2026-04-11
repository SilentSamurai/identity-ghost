import {
    Body,
    ClassSerializerInterceptor,
    Controller,
    Delete,
    Get,
    Inject,
    Patch,
    Post,
    UseGuards,
    UseInterceptors,
} from "@nestjs/common";
import {Environment} from "../config/environment.service";
import {TenantService} from "../services/tenant.service";
import {ValidationPipe} from "../validation/validation.pipe";
import {ValidationSchema} from "../validation/validation.schema";
import {Tenant} from "../entity/tenant.entity";
import {JwtAuthGuard} from "../auth/jwt-auth.guard";
import {SubjectEnum} from "../entity/subjectEnum";
import {Action} from "../casl/actions.enum";
import {subject} from "@casl/ability";
import {CurrentPermission, CurrentTenantId, CurrentUser, Permission} from "../auth/auth.decorator";
import {SIGNING_KEY_PROVIDER, SigningKeyProvider} from "../core/token-abstraction";
import {User} from "../entity/user.entity";
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
        @Inject(SIGNING_KEY_PROVIDER)
        private readonly signingKeyProvider: SigningKeyProvider,
    ) {
    }

    @Post("/create")
    @UseGuards(JwtAuthGuard)
    async createTenant(
        @CurrentPermission() permission: Permission,
        @CurrentUser() user: User,
        @Body(new ValidationPipe(ValidationSchema.CreateTenantSchema))
        body: any,
    ): Promise<Tenant> {
        return this.tenantService.create(permission, body.name, body.domain, user);
    }

    // ─── New token-derived routes (no :tenantId in URL) ───

    @Patch("/my")
    @UseGuards(JwtAuthGuard)
    async updateMyTenant(
        @CurrentPermission() permission: Permission,
        @CurrentTenantId() tenantId: string,
        @Body(new ValidationPipe(TenantController.UpdateTenantSchema))
        body: { name?: string; allowSignUp?: boolean },
    ): Promise<Tenant> {
        return this._updateTenant(permission, tenantId, body);
    }

    @Delete("/my")
    @UseGuards(JwtAuthGuard)
    async deleteMyTenant(
        @CurrentPermission() permission: Permission,
        @CurrentTenantId() tenantId: string,
    ): Promise<Tenant> {
        return this.tenantService.deleteTenant(permission, tenantId);
    }

    @Get("/my/credentials")
    @UseGuards(JwtAuthGuard)
    async getMyCredentials(
        @CurrentPermission() permission: Permission,
        @CurrentTenantId() tenantId: string,
    ): Promise<any> {
        const tenant = await this.tenantService.findById(permission, tenantId);
        permission.isAuthorized(Action.ReadCredentials, SubjectEnum.TENANT, tenant);
        const publicKey = await this.signingKeyProvider.getPublicKey(tenant.id);
        return {
            id: tenant.id,
            clientId: tenant.clientId,
            clientSecret: tenant.clientSecret,
            publicKey,
        };
    }

    @Get("/my/info")
    @UseGuards(JwtAuthGuard)
    async getMyTenant(
        @CurrentPermission() permission: Permission,
        @CurrentTenantId() tenantId: string,
    ): Promise<Tenant> {
        return this._getTenant(permission, tenantId);
    }

    // ─── Shared implementation methods ───

    private async _updateTenant(permission: Permission, tenantId: string, body: {
        name?: string;
        allowSignUp?: boolean
    }): Promise<Tenant> {
        const tenant = await this.tenantService.findById(permission, tenantId);
        permission.isAuthorized(Action.Update, SubjectEnum.TENANT, tenant);
        return this.tenantService.updateTenant(permission, tenantId, body);
    }

    private async _getTenant(permission: Permission, tenantId: string): Promise<Tenant> {
        const tenant = await this.tenantService.findById(permission, tenantId);
        permission.isAuthorized(Action.Read, SubjectEnum.TENANT, tenant);
        return tenant;
    }
}
