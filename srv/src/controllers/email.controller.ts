import {
    ClassSerializerInterceptor,
    Controller,
    Get,
    Param,
    Request,
    Response,
    UseInterceptors,
} from "@nestjs/common";

import {Environment} from "../config/environment.service";
import {AuthService} from "../auth/auth.service";

@Controller("api/oauth")
@UseInterceptors(ClassSerializerInterceptor)
export class EmailController {
    constructor(
        private readonly configService: Environment,
        private readonly authService: AuthService,
    ) {
    }

    @Get("/verify-email/:token")
    async verifyEmail(
        @Request() request,
        @Param("token") token: string,
        @Response() response,
    ): Promise<any> {
        const verified: boolean = await this.authService.verifyEmail(token);

        const baseUrl = this.configService.get("BASE_URL");
        if (!baseUrl) {
            response.send({status: verified});
        } else {
            const link = `${baseUrl}/login?verified=${verified}`;
            response.redirect(link);
        }
    }

    @Get("/change-email/:token")
    async changeEmail(
        @Param("token") token: string,
        @Response() response,
    ): Promise<any> {
        const confirmed: boolean =
            await this.authService.confirmEmailChange(token);

        const baseUrl = this.configService.get("BASE_URL");
        if (!baseUrl) {
            response.send({status: confirmed});
        } else {
            const link = `${baseUrl}/profile?emailChanged=${confirmed}`;
            response.redirect(link);
        }
    }
}
