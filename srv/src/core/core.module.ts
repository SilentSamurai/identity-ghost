import {Module} from "@nestjs/common";
import {TypeOrmModule} from "@nestjs/typeorm";
import {ConfigModule} from "../config/config.module";
import {CaslModule} from "../casl/casl.module";
import {User} from "../entity/user.entity";
import {Tenant} from "../entity/tenant.entity";
import {TenantKey} from "../entity/tenant-key.entity";
import {TenantMember} from "../entity/tenant.members.entity";
import {Role} from "../entity/role.entity";
import {UserRole} from "../entity/user.roles.entity";
import {App} from "../entity/app.entity";
import {Subscription} from "../entity/subscription.entity";
import {UsersService} from "../services/users.service";
import {TenantService} from "../services/tenant.service";
import {RoleService} from "../services/role.service";
import {SubscriptionService} from "../services/subscription.service";
import {AppSubscriptionService} from "../services/app-subscription.service";
import {KeyManagementService} from "../services/key-management.service";
import {TechnicalTokenService} from "./technical-token.service";
import {RS256TokenGenerator} from "./rs256-token-generator.service";
import {HS256TokenGenerator} from "./hs256-token-generator.service";
import {ES256TokenGenerator} from "./es256-token-generator.service";
import {PS256TokenGenerator} from "./ps256-token-generator.service";
import {RS256SigningKeyProvider} from "./rs256-signing-key-provider.service";
import {
    ES256_TOKEN_GENERATOR,
    HS256_TOKEN_GENERATOR,
    PS256_TOKEN_GENERATOR,
    RS256_TOKEN_GENERATOR,
    SIGNING_KEY_PROVIDER
} from "./token-abstraction";

@Module({
    imports: [
        ConfigModule,
        CaslModule,
        TypeOrmModule.forFeature([User, Tenant, TenantKey, TenantMember, Role, UserRole, App, Subscription]),
    ],
    providers: [
        UsersService,
        TenantService,
        RoleService,
        SubscriptionService,
        AppSubscriptionService,
        RS256TokenGenerator,
        HS256TokenGenerator,
        ES256TokenGenerator,
        PS256TokenGenerator,
        RS256SigningKeyProvider,
        KeyManagementService,
        {
            provide: RS256_TOKEN_GENERATOR,
            useClass: RS256TokenGenerator,
        },
        {
            provide: HS256_TOKEN_GENERATOR,
            useClass: HS256TokenGenerator,
        },
        {
            provide: ES256_TOKEN_GENERATOR,
            useClass: ES256TokenGenerator,
        },
        {
            provide: PS256_TOKEN_GENERATOR,
            useClass: PS256TokenGenerator,
        },
        {
            provide: SIGNING_KEY_PROVIDER,
            useClass: RS256SigningKeyProvider,
        },
        TechnicalTokenService,
    ],
    exports: [
        UsersService,
        TenantService,
        RoleService,
        SubscriptionService,
        AppSubscriptionService,
        RS256_TOKEN_GENERATOR,
        HS256_TOKEN_GENERATOR,
        ES256_TOKEN_GENERATOR,
        PS256_TOKEN_GENERATOR,
        SIGNING_KEY_PROVIDER,
        KeyManagementService,
        TechnicalTokenService,
        TypeOrmModule,
    ],
})
export class CoreModule {
}
