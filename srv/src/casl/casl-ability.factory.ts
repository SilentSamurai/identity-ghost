import {AbilityBuilder, createMongoAbility} from "@casl/ability";
import {Action} from "./actions.enum";
import {Injectable} from "@nestjs/common";
import {AnyAbility} from "@casl/ability/dist/types/PureAbility";
import {SubjectEnum} from "../entity/subjectEnum";
import {RoleEnum} from "../entity/roleEnum";
import {Environment} from "../config/environment.service";
import {TechnicalToken, TenantToken, Token} from "./contexts";
import {User} from "../entity/user.entity";

@Injectable()
export class CaslAbilityFactory {
    constructor(
        private readonly configService: Environment,
    ) {
    }

    static isInternalRole(roleName: string): boolean {
        return Object.values(RoleEnum).includes(roleName as RoleEnum);
    }

    createForSecurityContext(
        token: Token,
    ): AnyAbility {
        const {can, cannot, build} = new AbilityBuilder(createMongoAbility);

        if (token.isTechnicalToken()) {
            const technicalToken = token as TechnicalToken;
            can(Action.Read, SubjectEnum.TENANT, {id: technicalToken.tenant.id});
            can(Action.Read, SubjectEnum.MEMBER, {
                tenantId: technicalToken.tenant.id,
            });
            can(Action.Read, SubjectEnum.ROLE, {
                tenantId: technicalToken.tenant.id,
            });
            can(Action.ReadCredentials, SubjectEnum.TENANT, {
                id: technicalToken.tenant.id,
            });
            can(Action.Read, SubjectEnum.POLICY, {
                tenantId: technicalToken.tenant.id,
            });
        } else if (token.isTenantToken()) {
            const tenantToken = token as TenantToken;
            const roles = tenantToken.roles;
            // User Permissions
            cannot(Action.Manage, SubjectEnum.USER);
            can(Action.Manage, SubjectEnum.USER, {
                email: tenantToken.email,
            });
            can(Action.Manage, SubjectEnum.USER, {
                id: tenantToken.userId,
            });

            if (roles.includes(RoleEnum.TENANT_VIEWER)) {
                can(Action.Read, SubjectEnum.TENANT, {
                    id: tenantToken.tenant.id,
                });
                can(Action.Read, SubjectEnum.MEMBER, {
                    tenantId: tenantToken.tenant.id,
                });
                can(Action.Read, SubjectEnum.ROLE, {
                    tenantId: tenantToken.tenant.id,
                });
                can(Action.Read, SubjectEnum.POLICY, {
                    tenantId: tenantToken.tenant.id,
                });

                cannot(Action.ReadCredentials, SubjectEnum.TENANT);
            }

            if (roles.includes(RoleEnum.TENANT_ADMIN)) {
                can(Action.ReadCredentials, SubjectEnum.TENANT, {
                    id: tenantToken.tenant.id,
                });
                can(Action.Update, SubjectEnum.TENANT, {
                    id: tenantToken.tenant.id,
                });
                can(Action.Read, SubjectEnum.TENANT, {
                    id: tenantToken.tenant.id,
                });
                can(Action.Manage, SubjectEnum.MEMBER, {
                    tenantId: tenantToken.tenant.id,
                });
                can(Action.Manage, SubjectEnum.ROLE, {
                    tenantId: tenantToken.tenant.id,
                });
                can(Action.Manage, SubjectEnum.POLICY, {
                    tenantId: tenantToken.tenant.id,
                });
                can(Action.Manage, SubjectEnum.CLIENT, {
                    tenantId: tenantToken.tenant.id,
                });
            }

            if (
                roles.includes(RoleEnum.SUPER_ADMIN) &&
                tenantToken.tenant.domain ===
                this.configService.get("SUPER_TENANT_DOMAIN")
            ) {
                can(Action.Manage, "all");
                can(Action.ReadCredentials, "all");
            }

        }

        return build();
    }

    createContextForUserAuth(user: User): AnyAbility {
        const {can, cannot, build} = new AbilityBuilder(createMongoAbility);

        cannot(Action.Manage, SubjectEnum.USER);
        can(Action.Manage, SubjectEnum.USER, {
            email: user.email,
        });
        can(Action.Manage, SubjectEnum.USER, {
            id: user.id,
        });

        return build()
    }
}
