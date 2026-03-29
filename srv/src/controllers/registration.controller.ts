import {
    BadRequestException,
    Body,
    ClassSerializerInterceptor,
    ConflictException,
    Controller,
    Headers,
    Post,
    Request,
    ServiceUnavailableException,
    UseGuards,
    UseInterceptors,
} from "@nestjs/common";

import {User} from "../entity/user.entity";
import {UsersService} from "../services/users.service";
import {AuthService} from "../auth/auth.service";
import {MailService} from "../mail/mail.service";
import {JwtAuthGuard} from "../auth/jwt-auth.guard";
import {ValidationPipe} from "../validation/validation.pipe";
import {
    PASSWORD_MESSAGE,
    PASSWORD_REGEXP,
    USERNAME_MESSAGE,
    USERNAME_REGEXP,
    ValidationSchema,
} from "../validation/validation.schema";
import {TenantService} from "../services/tenant.service";
import {SecurityService} from "../casl/security.service";
import * as argon2 from "argon2";
import {InjectRepository} from "@nestjs/typeorm";
import {Repository} from "typeorm";
import * as yup from "yup";
import {Environment} from "../config/environment.service";

@Controller("api")
@UseInterceptors(ClassSerializerInterceptor)
export class RegisterController {
    static RegisterDomainSchema = yup.object().shape({
        name: yup
            .string()
            .required("name is required")
            .max(128)
            .matches(USERNAME_REGEXP, USERNAME_MESSAGE),
        password: yup
            .string()
            .required("Password is required")
            .max(128)
            .matches(PASSWORD_REGEXP, PASSWORD_MESSAGE),
        email: yup.string().email().required("Email is required").max(128),
        orgName: yup.string().required("Org name is required").max(128),
        domain: yup.string().required("Domain is required").max(128),
    });
    static SignUpSchema = yup.object().shape({
        name: yup
            .string()
            .required("name is required")
            .max(128)
            .matches(USERNAME_REGEXP, USERNAME_MESSAGE),
        password: yup
            .string()
            .required("Password is required")
            .max(128)
            .matches(PASSWORD_REGEXP, PASSWORD_MESSAGE),
        email: yup.string().email().required("Email is required").max(128),
        client_id: yup.string().required("Client Id is required").max(128),
    });

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

    @Post("/register-domain")
    async registerDomain(
        @Headers() headers,
        @Request() request,
        @Body(new ValidationPipe(RegisterController.RegisterDomainSchema))
        body: {
            name: string;
            password: string;
            email: string;
            orgName: string;
            domain: string;
        },
    ): Promise<{ success: boolean }> {
        const existingUser = await this.usersRepository.findOne({
            where: {email: body.email},
        });
        if (existingUser) {
            throw new ConflictException('Email is already being used');
        }

        let adminContext =
            await this.securityService.getContextForRegistration();

        const isPresent = await this.tenantService.existByDomain(
            adminContext,
            body.domain,
        );
        if (isPresent) {
            throw new BadRequestException("Domain already exists");
        }

        const hashedPassword = await argon2.hash(body.password);
        let user = this.usersRepository.create({
            ...body,
            password: hashedPassword,
        });
        user = await this.usersRepository.save(user);

        const token = await this.authService.createVerificationToken(user);
        const baseBackendUrl = this.configService.get('BASE_BACKEND_URL');
        const link = `${baseBackendUrl}/api/oauth/verify-email/${token}`;

        const sent = await this.mailService.sendVerificationMail(user, link);
        if (!sent) {
            await this.usersRepository.remove(user);
            throw new ServiceUnavailableException('Mail service error');
        }

        const tenant = await this.tenantService.create(
            adminContext,
            body.orgName,
            body.domain,
            user,
        );

        return {success: true};
    }

    @Post("/signup")
    async signup(
        @Headers() headers,
        @Request() request,
        @Body(new ValidationPipe(RegisterController.SignUpSchema))
        body: {
            name: string;
            password: string;
            email: string;
            client_id: string;
        },
    ): Promise<{ success: boolean }> {
        let adminContext =
            await this.securityService.getContextForRegistration();
        const tenant = await this.tenantService.findByClientIdOrDomain(
            adminContext,
            body.client_id,
        );
        if (!tenant.allowSignUp) {
            throw new BadRequestException("Sign up not allowed by admin");
        }

        const existingUser = await this.usersRepository.existsBy({
            email: body.email,
        });
        let user: User;
        if (!existingUser) {
            const hashedPassword = await argon2.hash(body.password);
            user = this.usersRepository.create({
                ...body,
                password: hashedPassword,
            });
            user = await this.usersRepository.save(user);

            const token = await this.authService.createVerificationToken(user);
            const baseBackendUrl = this.configService.get('BASE_BACKEND_URL');
            const link = `${baseBackendUrl}/api/oauth/verify-email/${token}`;

            const sent = await this.mailService.sendVerificationMail(
                user,
                link,
            );
            if (!sent) {
                await this.usersRepository.remove(user);
                throw new ServiceUnavailableException('Mail service error');
            }
        } else {
            user = await this.usersService.findByEmailSecure(
                adminContext,
                body.email,
                body.password,
            );
        }

        if (
            !(await this.tenantService.isMember(adminContext, tenant.id, user))
        ) {
            await this.tenantService.addMember(adminContext, tenant.id, user);
        }

        return {success: true};
    }

    @Post("/signdown")
    @UseGuards(JwtAuthGuard)
    async signdown(
        @Request() request,
        @Body(new ValidationPipe(ValidationSchema.SignDownSchema))
        body: { password: string },
    ): Promise<{ status: boolean }> {
        const securityContext = this.securityService.getToken(request);
        const user = await this.usersService.findByEmail(
            request,
            securityContext.email,
        );
        await this.usersService.deleteSecure(request, user.id, body.password);

        return {status: true};
    }
}
