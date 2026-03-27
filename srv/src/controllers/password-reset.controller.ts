import {
    Body,
    ClassSerializerInterceptor,
    Controller,
    Headers,
    Param,
    Post,
    ServiceUnavailableException,
    UseInterceptors,
} from "@nestjs/common";

import {User} from "../entity/user.entity";
import {Environment} from "../config/environment.service";
import {AuthService} from "../auth/auth.service";
import {MailService} from "../mail/mail.service";
import {ValidationPipe} from "../validation/validation.pipe";
import {ValidationSchema} from "../validation/validation.schema";
import {AuthUserService} from "../casl/authUser.service";

@Controller("api/oauth")
@UseInterceptors(ClassSerializerInterceptor)
export class PasswordResetController {
    constructor(
        private readonly configService: Environment,
        private readonly authService: AuthService,
        private readonly mailService: MailService,
        private readonly authUserService: AuthUserService,
    ) {
    }

    @Post("/forgot-password")
    async forgotPassword(
        @Headers() headers,
        @Body(new ValidationPipe(ValidationSchema.ForgotPasswordSchema))
            body: any,
    ): Promise<object> {
        const user: User = await this.authUserService.findUserByEmail(
            body.email,
        );
        const token: string = await this.authService.createResetPasswordToken(user);
        const baseUrl = this.configService.get("BASE_URL");
        const link = `${baseUrl}/reset-password/${token}`;

        const sent: boolean = await this.mailService.sendResetPasswordMail(
            user,
            link,
        );
        if (!sent) {
            throw new ServiceUnavailableException('Mail service error');
        }

        return {status: sent};
    }

    @Post("/reset-password/:token")
    async resetPassword(
        @Param("token") token: string,
        @Body(new ValidationPipe(ValidationSchema.ResetPasswordSchema))
            body: any,
    ): Promise<object> {
        const reset: boolean = await this.authService.resetPassword(
            token,
            body.password,
        );
        return {status: reset};
    }
}
