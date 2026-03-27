import {BadRequestException, ForbiddenException, Injectable} from "@nestjs/common";
import {AuthService} from "./auth.service";
import {TenantService} from "../services/tenant.service";
import {SubscriptionService} from "../services/subscription.service";
import {SecurityService} from "../casl/security.service";
import {Environment} from "../config/environment.service";
import {AuthCodeService} from "./auth-code.service";
import {User} from "../entity/user.entity";
import {Tenant} from "../entity/tenant.entity";
import {AuthContext} from "../casl/contexts";

export interface TokenResponse {
    access_token: string;
    expires_in: any;
    token_type: string;
    refresh_token?: string;
    scope?: string;
}

export interface IssueTokenOptions {
    subscriberTenantHint?: string;
    authCode?: string;
}

@Injectable()
export class TokenIssuanceService {
    constructor(
        private readonly authService: AuthService,
        private readonly tenantService: TenantService,
        private readonly subscriptionService: SubscriptionService,
        private readonly securityService: SecurityService,
        private readonly configService: Environment,
        private readonly authCodeService: AuthCodeService,
    ) {}

    /**
     * Given a resolved user and tenant, handles the full pipeline:
     * membership check → subscription resolution → scope building → token creation → response formatting.
     */
    async issueToken(user: User, tenant: Tenant, options?: IssueTokenOptions): Promise<TokenResponse> {
        const adminContext = await this.securityService.getContextForTokenIssuance(tenant.id);

        const isMember = await this.tenantService.isMember(adminContext, tenant.id, user);
        const isSubscribed = await this.subscriptionService.isUserSubscribedToTenant(adminContext, user, tenant);

        if (!isMember && !isSubscribed) {
            throw new BadRequestException("User is not a member of the tenant and does not have a valid app subscription");
        }

        if (isSubscribed) {
            return this.issueSubscribedToken(adminContext, user, tenant, options);
        }

        const {accessToken, refreshToken, scopes} =
            await this.authService.createUserAccessToken(user, tenant, []);

        return this.formatResponse(accessToken, refreshToken, scopes);
    }

    /**
     * Checks membership/subscription and resolves subscription ambiguity during login.
     * Returns null if access is granted (no ambiguity or direct member).
     * Returns the list of ambiguous tenants if the user needs to pick one.
     */
    async resolveLoginAccess(user: User, tenant: Tenant, subscriberTenantHint?: string): Promise<{
        granted: boolean;
        ambiguousTenants?: any[];
        resolvedHint?: string;
    }> {
        const adminContext = await this.securityService.getContextForTokenIssuance(tenant.id);

        const isMember = await this.tenantService.isMember(adminContext, tenant.id, user);
        const isSubscribed = await this.subscriptionService.isUserSubscribedToTenant(adminContext, user, tenant);

        if (!isMember && !isSubscribed) {
            throw new ForbiddenException("User is not a member of the tenant and does not have a valid app subscription");
        }

        // Direct member — no ambiguity possible
        if (!isSubscribed) {
            return {granted: true};
        }

        // Subscribed user — check for ambiguity
        const ambiguityResult = await this.subscriptionService
            .resolveSubscriptionTenantAmbiguity(adminContext, user, tenant, subscriberTenantHint || null);

        if (ambiguityResult.ambiguousTenants) {
            return {
                granted: false,
                ambiguousTenants: ambiguityResult.ambiguousTenants.map(t => ({
                    id: t.id, domain: t.domain, name: t.name,
                })),
            };
        }

        // Resolved — return the hint to bake into the auth code
        return {
            granted: true,
            resolvedHint: ambiguityResult.resolvedTenant?.domain,
        };
    }

    private async issueSubscribedToken(
        adminContext: AuthContext,
        user: User,
        tenant: Tenant,
        options?: IssueTokenOptions,
    ): Promise<TokenResponse> {
        let hint = options?.subscriberTenantHint;

        // Check auth code for stored hint
        if (!hint && options?.authCode) {
            if (await this.authCodeService.hasAuthCodeWithHint(options.authCode)) {
                const authCodeObj = await this.authCodeService.findByCode(options.authCode);
                if (authCodeObj?.subscriberTenantHint) {
                    hint = authCodeObj.subscriberTenantHint;
                }
            }
        }

        const ambiguityResult = await this.subscriptionService
            .resolveSubscriptionTenantAmbiguity(adminContext, user, tenant, hint);

        if (ambiguityResult.ambiguousTenants) {
            throw new BadRequestException("Multiple subscription tenants found. Please specify a subscriber_tenant_hint.");
        }

        const subscribingTenant = ambiguityResult.resolvedTenant!;
        let additionalScopes = await this.tenantService.getMemberRoles(adminContext, subscribingTenant.id, user);

        const {accessToken, refreshToken, scopes} =
            await this.authService.createSubscribedUserAccessToken(
                user, tenant, subscribingTenant, additionalScopes.map(r => r.name),
            );

        return this.formatResponse(accessToken, refreshToken, scopes);
    }

    private formatResponse(accessToken: string, refreshToken: string, scopes: string[]): TokenResponse {
        return {
            access_token: accessToken,
            expires_in: this.configService.get("TOKEN_EXPIRATION_TIME_IN_SECONDS"),
            token_type: "Bearer",
            refresh_token: refreshToken,
            ...(scopes?.length ? {scope: scopes.join(" ")} : {}),
        };
    }
}
