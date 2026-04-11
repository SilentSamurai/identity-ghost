import {
    Body,
    ClassSerializerInterceptor,
    Controller,
    Get,
    Headers,
    InternalServerErrorException,
    Patch,
    UseGuards,
    UseInterceptors,
} from "@nestjs/common";

import {User} from "../entity/user.entity";
import {UsersService} from "../services/users.service";
import {AuthService} from "../auth/auth.service";
import {MailService} from "../mail/mail.service";
import {JwtAuthGuard} from "../auth/jwt-auth.guard";
import {ValidationPipe} from "../validation/validation.pipe";
import {ValidationSchema} from "../validation/validation.schema";
import {TenantService} from "../services/tenant.service";
import {Tenant} from "../entity/tenant.entity";
import {Environment} from "../config/environment.service";
import {CurrentPermission, CurrentUser, Permission} from "../auth/auth.decorator";

@Controller("api/users")
@UseInterceptors(ClassSerializerInterceptor)
export class UsersController {
    constructor(
        private readonly usersService: UsersService,
        private readonly authService: AuthService,
        private readonly tenantService: TenantService,
        private readonly mailService: MailService,
        private readonly configService: Environment,
    ) {
    }

    @Get("/me")
    @UseGuards(JwtAuthGuard)
    async getMyUser(
        @CurrentPermission() permission: Permission,
        @CurrentUser() user: User,
    ): Promise<User> {
        return this.usersService.findById(permission, user.id);
    }

    @Patch("/me/email")
    @UseGuards(JwtAuthGuard)
    async updateMyEmail(
        @CurrentUser() user: User,
        @Body(new ValidationPipe(ValidationSchema.UpdateMyEmailSchema))
        body: any,
    ): Promise<{ status: boolean }> {
        const token = await this.authService.createChangeEmailToken(
            user,
            body.email,
        );
        const baseBackendUrl = this.configService.get('BASE_BACKEND_URL');
        const link = `${baseBackendUrl}/api/oauth/change-email/${token}`;

        const sent = await this.mailService.sendChangeEmailMail(
            body.email,
            link,
        );
        if (!sent) {
            throw new InternalServerErrorException();
        }

        return {status: sent};
    }

    @Patch("/me/password")
    @UseGuards(JwtAuthGuard)
    async updateMyPassword(
        @CurrentPermission() permission: Permission,
        @CurrentUser() user: User,
        @Body(new ValidationPipe(ValidationSchema.UpdateMyPasswordSchema))
        body: any,
    ): Promise<{ status: boolean }> {
        await this.usersService.updatePasswordSecure(
            permission,
            user.id,
            body.currentPassword,
            body.newPassword,
        );
        return {status: true};
    }

    @Patch("/me/name")
    @UseGuards(JwtAuthGuard)
    async updateMyName(
        @CurrentPermission() permission: Permission,
        @CurrentUser() user: User,
        @Body(new ValidationPipe(ValidationSchema.UpdateMyNameSchema))
        body: any,
    ): Promise<User> {
        return this.usersService.updateName(permission, user.id, body.name);
    }

    @Get("/me/tenants")
    @UseGuards(JwtAuthGuard)
    async getTenants(
        @CurrentPermission() permission: Permission,
        @CurrentUser() user: User,
    ): Promise<Tenant[]> {
        return this.tenantService.findByViewership(permission, user);
    }
}
