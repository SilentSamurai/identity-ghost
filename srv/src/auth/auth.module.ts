import {forwardRef, Module} from "@nestjs/common";
import {PassportModule} from "@nestjs/passport";
import {JwtAuthGuard} from "./jwt-auth.guard";
import {TypeOrmModule} from "@nestjs/typeorm";
import {AuthCode} from "../entity/auth_code.entity";
import {ServiceModule} from "../services/service.module";
import {AuthService} from "./auth.service";
import {AuthCodeService} from "./auth-code.service";
import {CaslModule} from "../casl/casl.module";
import {User} from "../entity/user.entity";
import {JwtServiceHS256, JwtServiceRS256} from "./jwt.service";
import {TokenIssuanceService} from "./token-issuance.service";

@Module({
    imports: [
        CaslModule,
        forwardRef(() => ServiceModule),
        PassportModule,
        TypeOrmModule.forFeature([AuthCode, User]),
    ],
    controllers: [],
    providers: [JwtAuthGuard, AuthService, AuthCodeService, JwtServiceHS256, JwtServiceRS256, TokenIssuanceService],
    exports: [JwtAuthGuard, AuthService, AuthCodeService, JwtServiceHS256, JwtServiceRS256, TokenIssuanceService],
})
export class AuthModule {
}
