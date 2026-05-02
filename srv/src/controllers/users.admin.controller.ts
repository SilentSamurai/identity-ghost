import {
    BadRequestException,
    Body,
    ClassSerializerInterceptor,
    Controller,
    Delete,
    Get,
    Param,
    Post,
    Put,
    UseGuards,
    UseInterceptors,
} from "@nestjs/common";
import * as yup from 'yup';

import {User} from "../entity/user.entity";
import {UsersService} from "../services/users.service";
import {AuthService} from "../auth/auth.service";
import {MailService} from "../mail/mail.service";
import {JwtAuthGuard} from "../auth/jwt-auth.guard";
import {SuperAdminGuard} from "../auth/super-admin.guard";
import {ValidationPipe} from "../validation/validation.pipe";
import {PASSWORD_MESSAGE, PASSWORD_REGEXP, ValidationSchema} from "../validation/validation.schema";
import {TenantService} from "../services/tenant.service";
import {Tenant} from "../entity/tenant.entity";
import {CurrentPermission, Permission} from "../auth/auth.decorator";

// Local VerifyUserSchema for this controller
const VerifyUserSchema = yup.object().shape({
    email: yup.string().required("Name is required").max(128),
    verify: yup.boolean().required("boolean value is required"),
});

const UpdateUserPasswordSchema = yup.object().shape({
    password: yup
        .string()
        .required("Password is required")
        .matches(PASSWORD_REGEXP, PASSWORD_MESSAGE)
        .max(128),
    confirmPassword: yup.string().required("Confirm Password is required"),
});

@Controller("api/users")
@UseInterceptors(ClassSerializerInterceptor)
@UseGuards(JwtAuthGuard, SuperAdminGuard)
export class UsersAdminController {

    constructor(
        private readonly usersService: UsersService,
        private readonly authService: AuthService,
        private readonly tenantService: TenantService,
        private readonly mailService: MailService,
    ) {
    }

    @Post("/create")
    @UseGuards(JwtAuthGuard)
    async createUser(
        @CurrentPermission() permission: Permission,
        @Body(new ValidationPipe(ValidationSchema.CreateUserSchema))
        body: { name: string; email: string; password: string },
    ): Promise<User> {
        const user = await this.usersService.create(permission, body.password, body.email, body.name);
        await this.usersService.updateVerified(permission, user.id, true);
        return user;
    }

    @Put("/update")
    @UseGuards(JwtAuthGuard)
    async updateUser(
        @CurrentPermission() permission: Permission,
        @Body(new ValidationPipe(ValidationSchema.UpdateUserSchema))
        body: { id: string; name: string; email: string },
    ): Promise<User> {
        return this.usersService.update(permission, body.id, body.name, body.email);
    }

    @Get("/:userId")
    @UseGuards(JwtAuthGuard)
    async getUser(
        @CurrentPermission() permission: Permission,
        @Param("userId") userId: string,
    ): Promise<any> {
        const user = await this.usersService.findById(permission, userId);
        return {
            id: user.id,
            name: user.name,
            email: user.email,
            createdAt: user.createdAt,
            verified: user.verified,
            locked: user.locked,
        };
    }

    @Get("")
    @UseGuards(JwtAuthGuard)
    async getUsers(@CurrentPermission() permission: Permission): Promise<User[]> {
        return this.usersService.getAll(permission);
    }

    @Delete("/:id")
    @UseGuards(JwtAuthGuard)
    async deleteUser(
        @CurrentPermission() permission: Permission,
        @Param("id") id: string,
    ): Promise<User> {
        return this.usersService.delete(permission, id);
    }

    @Get("/:userId/tenants")
    @UseGuards(JwtAuthGuard)
    async getTenants(
        @CurrentPermission() permission: Permission,
        @Param("userId") userId: string,
    ): Promise<Tenant[]> {
        const user = await this.usersService.findById(permission, userId);
        return this.tenantService.findByMembership(permission, user);
    }

    @Put("/verify-user")
    @UseGuards(JwtAuthGuard)
    async updateVerification(
        @CurrentPermission() permission: Permission,
        @Body(new ValidationPipe(VerifyUserSchema))
        body: { email: string; verify: boolean },
    ): Promise<User> {
        const user = await this.usersService.findByEmail(permission, body.email);
        return this.usersService.updateVerified(permission, user.id, body.verify);
    }

    @Put(":userId/lock")
    @UseGuards(JwtAuthGuard)
    async lockUser(
        @CurrentPermission() permission: Permission,
        @Param("userId") userId: string,
    ): Promise<any> {
        const user = await this.usersService.lockUser(permission, userId);
        return {id: user.id, locked: user.locked};
    }

    @Put(":userId/unlock")
    @UseGuards(JwtAuthGuard)
    async unlockUser(
        @CurrentPermission() permission: Permission,
        @Param("userId") userId: string,
    ): Promise<any> {
        const user = await this.usersService.unlockUser(permission, userId);
        return {id: user.id, locked: user.locked};
    }

    @Put(":userId/password")
    @UseGuards(JwtAuthGuard)
    async updateUserPassword(
        @CurrentPermission() permission: Permission,
        @Param("userId") id: string,
        @Body(new ValidationPipe(UpdateUserPasswordSchema))
        body: { password: string; confirmPassword: string },
    ): Promise<User> {
        if (body.password !== body.confirmPassword) {
            throw new BadRequestException("Passwords do not match");
        }
        return this.usersService.updatePassword(permission, id, body.password);
    }
}
