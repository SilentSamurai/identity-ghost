import {Module} from "@nestjs/common";
import {PassportModule} from "@nestjs/passport";
import {JwtAuthGuard} from "./jwt-auth.guard";
import {TypeOrmModule} from "@nestjs/typeorm";
import {AuthCode} from "../entity/auth_code.entity";
import {AuthService} from "./auth.service";
import {AuthCodeService} from "./auth-code.service";
import {CaslModule} from "../casl/casl.module";
import {User} from "../entity/user.entity";
import {TokenIssuanceService} from "./token-issuance.service";
import {TenantResolutionGuard} from "./tenant-resolution.guard";
import {SuperAdminGuard} from "./super-admin.guard";
import {CoreModule} from "../core/core.module";
import {ServiceModule} from "../services/service.module";
import {IdTokenService} from "./id-token.service";
import {TokenIntrospectionService} from "./token-introspection.service";
import {RefreshTokenService} from "./refresh-token.service";
import {TokenRevocationService} from "./token-revocation.service";
import {RefreshToken} from "../entity/refresh-token.entity";

@Module({
    imports: [
        CaslModule,
        CoreModule,
        ServiceModule,
        PassportModule,
        TypeOrmModule.forFeature([AuthCode, User, RefreshToken]),
    ],
    controllers: [],
    providers: [JwtAuthGuard, AuthService, AuthCodeService, TokenIssuanceService, TenantResolutionGuard, SuperAdminGuard, IdTokenService, TokenIntrospectionService, RefreshTokenService, TokenRevocationService],
    exports: [JwtAuthGuard, AuthService, AuthCodeService, TokenIssuanceService, TenantResolutionGuard, SuperAdminGuard, IdTokenService, TokenIntrospectionService, RefreshTokenService, TokenRevocationService],
})
export class AuthModule {
}
