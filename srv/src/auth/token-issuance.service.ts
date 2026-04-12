import {BadRequestException, ForbiddenException, Injectable, InternalServerErrorException} from "@nestjs/common";
import {AuthService} from "./auth.service";
import {TenantService} from "../services/tenant.service";
import {SubscriptionService} from "../services/subscription.service";
import {SecurityService} from "../casl/security.service";
import {Environment} from "../config/environment.service";
import {AuthCodeService} from "./auth-code.service";
import {User} from "../entity/user.entity";
import {Tenant} from "../entity/tenant.entity";
import {GRANT_TYPES} from "../casl/contexts";
import {Permission} from "../auth/auth.decorator";
import {ScopeResolverService} from "../casl/scope-resolver.service";
import {ClientService} from "../services/client.service";
import {ScopeNormalizer} from "../casl/scope-normalizer";
import {IdTokenService} from "./id-token.service";
import {RefreshTokenService} from "./refresh-token.service";
import {UsersService} from "../services/users.service";
import {OAuthException} from "../exceptions/oauth-exception";
import {randomUUID} from "crypto";
import {LoginSessionService} from "./login-session.service";

/**
 * TokenIssuanceService — Central orchestrator for OAuth 2.0 / OIDC token issuance.
 *
 * This service coordinates the full token issuance pipeline for all grant types:
 * - Authorization Code (via issueToken with authCode)
 * - Resource Owner Password Credentials (via issueToken)
 * - Refresh Token (via refreshToken)
 * - Client Credentials (via issueClientCredentialsToken)
 *
 * ## Core Responsibilities
 *
 * 1. **Scope Resolution**: Performs two-way intersection between requested scopes
 *    and client-allowed scopes via ScopeResolverService. Never includes roles in scopes.
 *
 * 2. **Role Fetching**: Retrieves user roles from the database for tenant members.
 *    Roles are kept separate from OAuth scopes per the token architecture.
 *
 * 3. **Membership & Subscription Validation**: Verifies the user is either a direct
 *    tenant member or has a valid app subscription before issuing tokens.
 *
 * 4. **Subscription Ambiguity Resolution**: When a user has subscriptions to multiple
 *    tenants, resolves which tenant context to use (may require user hint).
 *
 * 5. **Token Assembly**: Coordinates with:
 *    - AuthService — creates the signed JWT access token with scopes + roles
 *    - IdTokenService — generates the OIDC ID token for user identity
 *    - RefreshTokenService — creates, rotates, and validates refresh tokens
 *
 * ## Token Types Produced
 *
 * - **TenantToken** (user grants): Contains both `scopes` (OIDC values) and `roles`
 *   (role enums). Used for authorization_code, password, and refresh_token grants.
 *
 * - **TechnicalToken** (client_credentials): Contains only `scopes`, no `roles` field
 *   since there is no user identity. Per RFC 6749 §4.4.3, never includes refresh_token.
 *
 * ## Response Format
 *
 * All methods return a TokenResponse conforming to OAuth 2.0 (RFC 6749):
 * - access_token: The JWT for API access
 * - token_type: Always "Bearer"
 * - expires_in: Token lifetime in seconds
 * - scope: Space-delimited granted scopes (OIDC values only)
 * - refresh_token: Only for user grants (not client_credentials)
 * - id_token: Only for user grants with 'openid' scope
 *
 * @see ScopeResolverService — two-way scope intersection logic
 * @see AuthService — JWT signing and claims assembly
 * @see IdTokenService — OIDC ID token generation
 * @see RefreshTokenService — refresh token lifecycle management
 */
export interface TokenResponse {
    access_token: string;
    token_type: string;
    expires_in: number;
    refresh_token?: string;
    scope: string;
    id_token?: string;
}

export interface IssueTokenOptions {
    subscriberTenantHint?: string;
    authCode?: string;
    nonce?: string;
    requestedScope?: string;
    grant_type?: GRANT_TYPES;
    sid?: string;
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
        private readonly idTokenService: IdTokenService,
        private readonly refreshTokenService: RefreshTokenService,
        private readonly usersService: UsersService,
        private readonly loginSessionService: LoginSessionService,
    ) {
    }

    /**
     * Given a resolved user and tenant, handles the full pipeline:
     * membership check → subscription resolution → scope building → token creation → response formatting.
     */
    async issueToken(user: User, tenant: Tenant, options?: IssueTokenOptions): Promise<TokenResponse> {
        // this is needed because when you are creating a token you do not have a logged in user yet
        // TODO : but for some scenarios there is logged in user so we can update this 
        const permission = this.securityService.createPermissionForTokenIssuance(tenant.id);

        const isMember = await this.tenantService.isMember(permission, tenant.id, user);
        const isSubscribed = await this.subscriptionService.isUserSubscribedToTenant(permission, user, tenant);

        if (!isMember && !isSubscribed) {
            throw new BadRequestException("User is not a member of the tenant and does not have a valid app subscription");
        }

        // Resolve client allowedScopes for scope intersection
        const clientAllowedScopes = await this.getClientAllowedScopes(tenant);

        if (isSubscribed) {
            return this.issueSubscribedToken(permission, user, tenant, clientAllowedScopes, options);
        }

        const roles = await this.tenantService.getMemberRoles(permission, tenant.id, user);
        const roleNames = roles.map(r => r.name);
        const grantedScopes = this.scopeResolverService.resolveScopes(
            options?.requestedScope ?? null,
            clientAllowedScopes,
        );

        const {accessToken, scopes} =
            await this.authService.createUserAccessToken(user, tenant, grantedScopes, roleNames, options?.grant_type ?? GRANT_TYPES.PASSWORD);

        // Resolve session: validate existing sid or create new session for password grant
        let authTime: number;
        let sessionId: string;
        if (options?.sid) {
            const session = await this.loginSessionService.validateSession(options.sid);
            authTime = session.authTime;
            sessionId = session.sid;
        } else if (options?.grant_type === GRANT_TYPES.PASSWORD || !options?.grant_type) {
            const session = await this.loginSessionService.createSession(user.id, tenant.id);
            authTime = session.authTime;
            sessionId = session.sid;
        } else {
            authTime = Math.floor(Date.now() / 1000);
            sessionId = randomUUID();
        }

        const {plaintext: refreshToken} = await this.refreshTokenService.create({
            userId: user.id,
            clientId: tenant.clientId,
            tenantId: tenant.id,
            scope: ScopeNormalizer.format(scopes),
            sid: sessionId,
        });

        // Read nonce from options (passed by controller from the already-redeemed auth code)
        const nonce = options?.nonce;

        const idToken = await this.idTokenService.generateIdToken({
            user: {id: user.id, email: user.email, name: user.name, verified: user.verified},
            tenantId: tenant.id,
            clientId: tenant.clientId,
            grantedScopes: scopes,
            accessToken,
            nonce,
            authTime,
            sessionId,
            amr: ["pwd"],
        });

        return this.formatResponse(accessToken, refreshToken, scopes, idToken);
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
        const permission = this.securityService.createPermissionForTokenIssuance(tenant.id);

        const isMember = await this.tenantService.isMember(permission, tenant.id, user);
        const isSubscribed = await this.subscriptionService.isUserSubscribedToTenant(permission, user, tenant);

        if (!isMember && !isSubscribed) {
            throw new ForbiddenException("User is not a member of the tenant and does not have a valid app subscription");
        }

        // Direct member — no ambiguity possible
        if (!isSubscribed) {
            return {granted: true};
        }

        // Subscribed user — check for ambiguity
        const ambiguityResult = await this.subscriptionService
            .resolveSubscriptionTenantAmbiguity(permission, user, tenant, subscriberTenantHint || null);

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
        permission: Permission,
        user: User,
        tenant: Tenant,
        clientAllowedScopes: string,
        options?: IssueTokenOptions,
    ): Promise<TokenResponse> {
        let hint = options?.subscriberTenantHint;
        const nonce = options?.nonce;

        // Check auth code for stored hint
        if (options?.authCode) {
            if (await this.authCodeService.hasAuthCodeWithHint(options.authCode)) {
                const authCodeObj = await this.authCodeService.findByCode(options.authCode);
                if (authCodeObj?.subscriberTenantHint) {
                    hint = hint || authCodeObj.subscriberTenantHint;
                }
            }
        }

        const ambiguityResult = await this.subscriptionService
            .resolveSubscriptionTenantAmbiguity(permission, user, tenant, hint);

        if (ambiguityResult.ambiguousTenants) {
            throw new BadRequestException("Multiple subscription tenants found. Please specify a subscriber_tenant_hint.");
        }

        const subscribingTenant = ambiguityResult.resolvedTenant!;
        let additionalRoles = await this.tenantService.getMemberRoles(permission, subscribingTenant.id, user);
        const allRoleNames = additionalRoles.map(r => r.name);

        const grantedScopes = this.scopeResolverService.resolveScopes(
            options?.requestedScope ?? null,
            clientAllowedScopes,
        );

        const {accessToken, scopes} =
            await this.authService.createSubscribedUserAccessToken(
                user, tenant, subscribingTenant, grantedScopes, allRoleNames, options?.grant_type ?? GRANT_TYPES.PASSWORD,
            );

        // Resolve session: validate existing sid or create new session for password grant
        let authTime: number;
        let sessionId: string;
        if (options?.sid) {
            const session = await this.loginSessionService.validateSession(options.sid);
            authTime = session.authTime;
            sessionId = session.sid;
        } else if (options?.grant_type === GRANT_TYPES.PASSWORD || !options?.grant_type) {
            const session = await this.loginSessionService.createSession(user.id, tenant.id);
            authTime = session.authTime;
            sessionId = session.sid;
        } else {
            authTime = Math.floor(Date.now() / 1000);
            sessionId = randomUUID();
        }

        const {plaintext: refreshToken} = await this.refreshTokenService.create({
            userId: user.id,
            clientId: tenant.clientId,
            tenantId: tenant.id,
            scope: ScopeNormalizer.format(scopes),
            sid: sessionId,
        });

        const idToken = await this.idTokenService.generateIdToken({
            user: {id: user.id, email: user.email, name: user.name, verified: user.verified},
            tenantId: tenant.id,
            clientId: tenant.clientId,
            grantedScopes: scopes,
            accessToken,
            nonce,
            authTime,
            sessionId,
            amr: ["pwd"],
        });

        return this.formatResponse(accessToken, refreshToken, scopes, idToken);
    }

    /**
     * Orchestrates the refresh_token grant:
     * consume + rotate → resolve user/tenant → check locked → re-fetch roles → issue access token → format response.
     */
    async refreshToken(
        plaintextToken: string,
        clientId: string,
        requestedScope?: string,
    ): Promise<TokenResponse> {
        const {plaintext: newRefreshToken, record} = await this.refreshTokenService.consumeAndRotate({
            plaintextToken,
            clientId,
            requestedScope,
        });

        const permission = this.securityService.createPermissionForTokenIssuance(record.tenantId);

        const user = await this.usersService.findById(permission, record.userId);
        if (user.locked) {
            throw OAuthException.invalidGrant("The refresh token is invalid or has expired");
        }

        const tenant = await this.tenantService.findById(permission, record.tenantId);

        const roles = await this.tenantService.getMemberRoles(permission, tenant.id, user);
        const roleNames = roles.map(r => r.name);

        const grantedScopes = ScopeNormalizer.parse(record.scope);

        const {accessToken, scopes} =
            await this.authService.createUserAccessToken(user, tenant, grantedScopes, roleNames, GRANT_TYPES.REFRESH_TOKEN);

        // Resolve session from the refresh token's sid
        let authTime: number;
        let sessionId: string;
        if (record.sid) {
            const session = await this.loginSessionService.validateSession(record.sid);
            authTime = session.authTime;
            sessionId = session.sid;
        } else {
            authTime = Math.floor(Date.now() / 1000);
            sessionId = randomUUID();
        }

        const idToken = await this.idTokenService.generateIdToken({
            user: {id: user.id, email: user.email, name: user.name, verified: user.verified},
            tenantId: tenant.id,
            clientId: tenant.clientId,
            grantedScopes: scopes,
            accessToken,
            authTime,
            sessionId,
            amr: ["pwd"],
        });

        return this.formatResponse(accessToken, newRefreshToken, scopes, idToken);
    }

    /**
     * Issues a token for client_credentials grant (machine-to-machine).
     * No refresh_token or id_token — there is no user identity.
     * Per RFC 6749 §4.4.3, the response MUST NOT include a refresh_token.
     */
    async issueClientCredentialsToken(
        tenant: Tenant,
        requestedScope: string | null,
    ): Promise<TokenResponse> {
        const clientAllowedScopes = await this.getClientAllowedScopes(tenant);
        const grantedScopes = this.scopeResolverService.resolveScopes(
            requestedScope,
            clientAllowedScopes,
        );
        const accessToken = await this.authService.createTechnicalAccessToken(
            tenant,
            grantedScopes,
        );
        return this.formatResponse(accessToken, undefined, grantedScopes);
    }

    private formatResponse(
        accessToken: string,
        refreshToken: string | undefined,
        scopes: string[],
        idToken?: string,
    ): TokenResponse {
        const raw = this.configService.get("TOKEN_EXPIRATION_TIME_IN_SECONDS", "3600");
        const expiresIn = parseInt(raw, 10);

        if (!Number.isFinite(expiresIn) || !Number.isInteger(expiresIn) || expiresIn <= 0) {
            throw new InternalServerErrorException(
                "Invalid TOKEN_EXPIRATION_TIME_IN_SECONDS configuration: must be a finite positive integer",
            );
        }

        const response: TokenResponse = {
            access_token: accessToken,
            token_type: "Bearer",
            expires_in: expiresIn,
            scope: ScopeNormalizer.format(scopes || []),
        };

        if (refreshToken) {
            response.refresh_token = refreshToken;
        }

        if (idToken) {
            response.id_token = idToken;
        }

        return response;
    }

    /**
     * Resolve the allowed scopes for a specific tenant's client.
     * Uses the tenant's clientId to find the exact client rather than
     * arbitrarily picking the first client in the tenant.
     */
    private async getClientAllowedScopes(tenant: Tenant): Promise<string> {
        try {
            const client = await this.clientService.findByClientId(tenant.clientId);
            if (client?.allowedScopes) {
                return client.allowedScopes;
            }
        } catch {
            // Fall through to default
        }
        return 'openid profile email';
    }
}
