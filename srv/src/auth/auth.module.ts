import { Module } from "@nestjs/common";
import { PassportModule } from "@nestjs/passport";
import { JwtAuthGuard } from "./jwt-auth.guard";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AuthCode } from "../entity/auth_code.entity";
import { AuthService } from "./auth.service";
import { AuthCodeService } from "./auth-code.service";
import { CaslModule } from "../casl/casl.module";
import { User } from "../entity/user.entity";
import { TokenIssuanceService } from "./token-issuance.service";
import { TenantResolutionGuard } from "./tenant-resolution.guard";
import { SuperAdminGuard } from "./super-admin.guard";
import { CoreModule } from "../core/core.module";

@Module({
    imports: [
        CaslModule,
        CoreModule,
        PassportModule,
        TypeOrmModule.forFeature([AuthCode, User]),
    ],
    controllers: [],
    providers: [JwtAuthGuard, AuthService, AuthCodeService, TokenIssuanceService, TenantResolutionGuard, SuperAdminGuard],
    exports: [JwtAuthGuard, AuthService, AuthCodeService, TokenIssuanceService, TenantResolutionGuard, SuperAdminGuard],
})
export class AuthModule {
}
