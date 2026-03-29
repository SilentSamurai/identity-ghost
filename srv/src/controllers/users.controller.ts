import {
    Body,
    ClassSerializerInterceptor,
    Controller,
    Get,
    Headers,
    InternalServerErrorException,
    Patch,
    Request,
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
import {SecurityService} from "../casl/security.service";
import {InjectRepository} from "@nestjs/typeorm";
import {Repository} from "typeorm";
import {Environment} from "../config/environment.service";

@Controller("api/users")
@UseInterceptors(ClassSerializerInterceptor)
export class UsersController {
    constructor(
        private readonly usersService: UsersService,
        private readonly authService: AuthService,
        private readonly tenantService: TenantService,
        private readonly mailService: MailService,
        private readonly securityService: SecurityService,
        private readonly configService: Environment,
        @InjectRepository(User) private usersRepository: Repository<User>,
    ) {
    }

    @Get("/me")
    @UseGuards(JwtAuthGuard)
    async getMyUser(@Request() request): Promise<User> {
        const securityContext = this.securityService.getToken(request);
        const user = await this.usersService.findByEmail(
            request,
            securityContext.email,
        );
        return this.usersService.findById(request, user.id);
    }

    @Patch("/me/email")
    @UseGuards(JwtAuthGuard)
    async updateMyEmail(
        @Request() request,
        @Headers() headers,
        @Body(new ValidationPipe(ValidationSchema.UpdateMyEmailSchema))
        body: any,
    ): Promise<{ status: boolean }> {
        const securityContext = this.securityService.getToken(request);
        const user = await this.usersService.findByEmail(
            request,
            securityContext.email,
        );
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
        @Request() request,
        @Body(new ValidationPipe(ValidationSchema.UpdateMyPasswordSchema))
        body: any,
    ): Promise<{ status: boolean }> {
        const securityContext = this.securityService.getToken(request);
        const user = await this.usersService.findByEmail(
            request,
            securityContext.email,
        );
        await this.usersService.updatePasswordSecure(
            request,
            user.id,
            body.currentPassword,
            body.newPassword,
        );
        return {status: true};
    }

    @Patch("/me/name")
    @UseGuards(JwtAuthGuard)
    async updateMyName(
        @Request() request,
        @Body(new ValidationPipe(ValidationSchema.UpdateMyNameSchema))
        body: any,
    ): Promise<User> {
        const securityContext = this.securityService.getToken(request);
        const user = await this.usersService.findByEmail(
            request,
            securityContext.email,
        );
        return this.usersService.updateName(request, user.id, body.name);
    }

    @Get("/me/tenants")
    @UseGuards(JwtAuthGuard)
    async getTenants(@Request() request): Promise<Tenant[]> {
        const securityContext = this.securityService.getToken(request);
        const user = await this.usersService.findByEmail(
            request,
            securityContext.email,
        );
        return this.tenantService.findByViewership(request, user);
    }
}
