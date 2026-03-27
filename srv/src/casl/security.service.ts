import {ForbiddenException, forwardRef, Inject, Injectable, OnModuleInit, UnauthorizedException} from "@nestjs/common";

import {RoleEnum} from "../entity/roleEnum";
import {Environment} from "../config/environment.service";
import {CaslAbilityFactory} from "./casl-ability.factory";
import {AnyAbility} from "@casl/ability/dist/types/PureAbility";
import {AbilityBuilder, createMongoAbility} from "@casl/ability";
import {Action} from "./actions.enum";
import {subject} from "@casl/ability";
import {AuthUserService} from "./authUser.service";
import {AuthContext, GRANT_TYPES, InternalToken, TechnicalToken, TenantToken,} from "./contexts";
import {SubjectEnum} from "../entity/subjectEnum";

@Injectable()
export class SecurityService implements OnModuleInit {
    constructor(
        private readonly configService: Environment,
        private readonly authUserService: AuthUserService,
        @Inject(forwardRef(() => CaslAbilityFactory))
        private readonly caslAbilityFactory: CaslAbilityFactory,
    ) {
    }

    async onModuleInit() {
    }

    getAbility(authContext: AuthContext): AnyAbility {
        if (authContext.SCOPE_ABILITIES) {
            return authContext.SCOPE_ABILITIES;
        }
        throw new UnauthorizedException();
    }

    isAuthorized(
        authContext: AuthContext,
        action: Action,
        object: string,
        obj: any = null,
    ): boolean {
        if (obj == null) {
            return this.check(authContext, action, object);
        }
        return this.check(authContext, action, subject(object, obj));
    }

    check(authContext: AuthContext, ...args: any): boolean {
        let ability = this.getAbility(authContext);
        if (!ability.can(...args)) {
            throw new ForbiddenException();
        }
        return true;
    }

    getToken(authContext: AuthContext): TenantToken {
        let payload = authContext.SECURITY_CONTEXT;
        if (!payload.isTenantToken()) {
            throw new ForbiddenException("");
        }
        return payload as TenantToken;
    }

    isClientCredentials(request: any) {
        let context = this.getUserOrTechnicalSecurityContext(request);
        return (
            context.grant_type === GRANT_TYPES.CLIENT_CREDENTIALS
        );
    }

    getTechnicalToken(authContext: AuthContext): TechnicalToken {
        if (!this.isClientCredentials(authContext)) {
            throw new ForbiddenException("");
        }
        return this.getUserOrTechnicalSecurityContext(
            authContext,
        ) as TechnicalToken;
    }

    getUserOrTechnicalSecurityContext(request: any): TenantToken {
        return request["SECURITY_CONTEXT"] as TenantToken;
    }

    isAuthenticated(request: any) {
        return request.hasOwnProperty("SECURITY_CONTEXT");
    }

    isSuperAdmin(securityContext: TenantToken) {
        return (
            securityContext.scopes.some(
                (scope) => scope === RoleEnum.SUPER_ADMIN,
            ) &&
            securityContext.tenant.domain ===
            this.configService.get("SUPER_TENANT_DOMAIN")
        );
    }

    /**
     * For login/token issuance: can read membership, subscription status, and roles across tenants.
     * Needs broad Read on TENANT because findByMembership checks Read TENANT without conditions.
     * Needs broad Read on ROLE because getMemberRoles may operate on the subscribing tenant.
     */
    async getContextForTokenIssuance(tenantId: string): Promise<AuthContext> {
        const {can, build} = new AbilityBuilder(createMongoAbility);
        can(Action.Read, SubjectEnum.TENANT);
        can(Action.Read, SubjectEnum.MEMBER);
        can(Action.Read, SubjectEnum.ROLE);
        return {
            SECURITY_CONTEXT: InternalToken.create({purpose: "token-issuance", scopedTenantId: tenantId}),
            SCOPE_ABILITIES: build(),
        };
    }

    /**
     * For adding members: can read/create users and read tenant membership.
     */
    async getContextForMemberManagement(tenantId: string): Promise<AuthContext> {
        const {can, build} = new AbilityBuilder(createMongoAbility);
        can(Action.Read, SubjectEnum.TENANT, {id: tenantId});
        can(Action.Read, SubjectEnum.MEMBER, {tenantId});
        can(Action.Read, SubjectEnum.USER);
        can(Action.Create, SubjectEnum.USER);
        return {
            SECURITY_CONTEXT: InternalToken.create({purpose: "member-management", scopedTenantId: tenantId}),
            SCOPE_ABILITIES: build(),
        };
    }

    /**
     * For registration: can check domain existence, create tenants/users, manage roles,
     * add members, and update user verification status.
     */
    async getContextForRegistration(): Promise<AuthContext> {
        const {can, build} = new AbilityBuilder(createMongoAbility);
        can(Action.Read, SubjectEnum.TENANT);
        can(Action.Create, SubjectEnum.TENANT);
        can(Action.Update, SubjectEnum.TENANT);
        can(Action.Read, SubjectEnum.USER);
        can(Action.Create, SubjectEnum.USER);
        can(Action.Update, SubjectEnum.USER);
        can(Action.Read, SubjectEnum.MEMBER);
        can(Action.Create, SubjectEnum.ROLE);
        can(Action.Read, SubjectEnum.ROLE);
        can(Action.Update, SubjectEnum.ROLE);
        return {
            SECURITY_CONTEXT: InternalToken.create({purpose: "registration"}),
            SCOPE_ABILITIES: build(),
        };
    }

    /**
     * For startup seed data: full access (this is the only legitimate use of broad permissions).
     */
    async getContextForStartup(): Promise<AuthContext> {
        const {can, build} = new AbilityBuilder(createMongoAbility);
        can(Action.Manage, "all");
        return {
            SECURITY_CONTEXT: InternalToken.create({purpose: "startup-seed"}),
            SCOPE_ABILITIES: build(),
        };
    }

    async getUserAuthContext(email: string): Promise<AuthContext> {
        const user = await this.authUserService.findUserByEmail(email);
        const authContext: AuthContext = {
            SECURITY_CONTEXT: TenantToken.create({
                email: user.email,
                sub: user.email,
                userId: user.id,
                name: user.name,
                scopes: [],
                grant_type: GRANT_TYPES.REFRESH_TOKEN,
                tenant: {
                    id: "",
                    name: "",
                    domain: this.configService.get("SUPER_TENANT_DOMAIN"),
                },
                userTenant: {
                    id: "",
                    name: "",
                    domain: this.configService.get("SUPER_TENANT_DOMAIN"),
                }
            }),
            SCOPE_ABILITIES: null,
        };
        authContext.SCOPE_ABILITIES = this.caslAbilityFactory.createContextForUserAuth(user);
        return authContext;
    }

    async getUserTenantAuthContext(
        email: string,
        domain: string,
    ): Promise<AuthContext> {
        const user = await this.authUserService.findUserByEmail(email);
        const tenant = await this.authUserService.findTenantByDomain(domain);
        const roles = await this.authUserService.findMemberRoles(tenant, user);
        const authContext: AuthContext = {
            SECURITY_CONTEXT: TenantToken.create({
                email: user.email,
                sub: user.email,
                userId: user.id,
                name: user.name,
                tenant: {
                    id: tenant.id,
                    name: tenant.name,
                    domain: tenant.domain,
                },
                scopes: roles.map((item) => item.name),
                grant_type: GRANT_TYPES.CODE,
                userTenant: {
                    id: tenant.id,
                    name: tenant.name,
                    domain: tenant.domain,
                }
            }),
            SCOPE_ABILITIES: null,
        };
        authContext.SCOPE_ABILITIES = await this.caslAbilityFactory.createForSecurityContext(
            authContext.SECURITY_CONTEXT,
        );
        return authContext;
    }

    async getAuthContextFromSecurityContext(
        securityContext: TenantToken,
    ): Promise<AuthContext> {
        const authContext: AuthContext = {
            SECURITY_CONTEXT: securityContext,
            SCOPE_ABILITIES: null,
        };
        authContext.SCOPE_ABILITIES = await this.caslAbilityFactory.createForSecurityContext(
            securityContext,
        );
        return authContext;
    }
}
