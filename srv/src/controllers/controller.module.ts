import {Module} from "@nestjs/common";
import {ConfigModule} from "../config/config.module";
import {AuthModule} from "../auth/auth.module";
import {MailModule} from "../mail/mail.module";
import {UsersController} from "./users.controller";
import {UsersAdminController} from "./users.admin.controller";
import {TenantController} from "./tenant.controller";
import {MemberController} from "./members.controller";
import {CaslModule} from "../casl/casl.module";
import {RoleController} from "./role.controller";
import {MainController} from "./main.controller";
import {GenericSearchController} from "./generic-search.controller";
import {TypeOrmModule} from "@nestjs/typeorm";
import {User} from "../entity/user.entity";
import {Tenant} from "../entity/tenant.entity";
import {Role} from "../entity/role.entity";
import {TenantMember} from "../entity/tenant.members.entity";
import {Group} from "../entity/group.entity";
import {ServiceModule} from "../services/service.module";
import {OAuthTokenController} from "./oauth-token.controller";
import {OAuthVerificationController} from "./oauth-verification.controller";
import {PasswordResetController} from "./password-reset.controller";
import {EmailController} from "./email.controller";
import {PolicyController} from "./policy.controller";
import {GroupController} from "./group.controller";
import {RoleControllerV2} from "./roleV2.controller";
import {RegisterController} from "./registration.controller";
import {AppController} from "./app.controller";
import {App} from "../entity/app.entity"
import {TenantBitsController} from "./tenant-bits.controller";
import {ClientController} from "./client.controller";
import {Client} from "../entity/client.entity";
import {AdminTenantController} from "./admin-tenant.controller";
import {TenantKey} from "../entity/tenant-key.entity";
import {IntrospectionController} from "./introspection.controller";
import {RevocationController} from "./revocation.controller";
import {JwksController} from "./jwks.controller";
import {AdminKeysController} from "./admin-keys.controller";
import {UserInfoController} from "./userinfo.controller";
import {UserConsent} from "../entity/user-consent.entity";
import {DiscoveryController} from "./discovery.controller";

@Module(
    {
        imports:
            [
                ConfigModule,
                AuthModule,
                MailModule,
                CaslModule,
                ServiceModule,
                TypeOrmModule.forFeature([User, Tenant, Role, TenantMember, Group, App, Client, TenantKey, UserConsent])
            ],
        controllers: [
            UsersController,
            UsersAdminController,
            TenantController,
            MemberController,
            RoleController,
            MainController,
            GenericSearchController,
            OAuthTokenController,
            OAuthVerificationController,
            PasswordResetController,
            EmailController,
            PolicyController,
            GroupController,
            RoleControllerV2,
            RegisterController,
            AppController,
            TenantBitsController,
            ClientController,
            AdminTenantController,
            IntrospectionController,
            RevocationController,
            JwksController,
            AdminKeysController,
            UserInfoController,
            DiscoveryController
        ],
        providers: [],
        exports: []
    })
export class ControllersModule {
}
