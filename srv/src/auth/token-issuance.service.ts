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
import {ScopeResolverService} from "../casl/scope-resolver.service";
import {ClientService} from "../services/client.service";
import {ScopeNormalizer} from "../casl/scope-normalizer";

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
    requestedScope?: string;
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
        private readonly scopeResolverService: ScopeResolverService,
        private readonly clientService: ClientService,
    ) {
    }

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

        // Resolve client allowedScopes for scope intersection
        const clientAllowedScopes = await this.getClientAllowedScopes(tenant);

        if (isSubscribed) {
            return this.issueSubscribedToken(adminContext, user, tenant, clientAllowedScopes, options);
        }

        const roles = await this.tenantService.getMemberRoles(adminContext, tenant.id, user);
        const roleNames = roles.map(r => r.name);
        const grantedScopes = this.scopeResolverService.resolveScopes(
            options?.requestedScope ?? null,
            clientAllowedScopes,
        );

        const {accessToken, refreshToken, scopes} =
            await this.authService.createUserAccessToken(user, tenant, grantedScopes, roleNames);

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
        clientAllowedScopes: string,
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
        let additionalRoles = await this.tenantService.getMemberRoles(adminContext, subscribingTenant.id, user);
        const allRoleNames = additionalRoles.map(r => r.name);

        const grantedScopes = this.scopeResolverService.resolveScopes(
            options?.requestedScope ?? null,
            clientAllowedScopes,
        );

        const {accessToken, refreshToken, scopes} =
            await this.authService.createSubscribedUserAccessToken(
                user, tenant, subscribingTenant, grantedScopes, allRoleNames,
            );

        return this.formatResponse(accessToken, refreshToken, scopes);
    }

    private formatResponse(accessToken: string, refreshToken: string, scopes: string[]): TokenResponse {
        return {
            access_token: accessToken,
            expires_in: this.configService.get("TOKEN_EXPIRATION_TIME_IN_SECONDS"),
            token_type: "Bearer",
            refresh_token: refreshToken,
            scope: ScopeNormalizer.format(scopes || []),
        };
    }

    private async getClientAllowedScopes(tenant: Tenant): Promise<string> {
        try {
            const clients = await this.clientService.findByTenantId(tenant.id);
            if (clients.length > 0 && clients[0].allowedScopes) {
                return clients[0].allowedScopes;
            }
        } catch {
            // Fall through to default
        }
        return 'openid profile email';
    }
}
