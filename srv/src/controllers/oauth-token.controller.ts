/**
 * OAuthTokenController - Handles OAuth 2.0 token endpoint operations.
 *
 * This controller implements the token endpoint per RFC 6749:
 * - Authorization Code grant (exchange code for tokens)
 * - Refresh Token grant (refresh access tokens)
 * - Password grant (direct credentials)
 * - Client Credentials grant (technical tokens)
 *
 * All responses follow OAuth 2.0 token response format and use
 * OAuthExceptionFilter for proper OAuth error formatting.
 */
import {
    Body,
    ClassSerializerInterceptor,
    Controller,
    Get,
    HttpCode,
    Logger,
    Post,
    Query,
    Req,
    Res,
    UseFilters,
    UseInterceptors,
} from "@nestjs/common";
import {Request as ExpressRequest, Response} from "express";

import {User} from "../entity/user.entity";
import {AuthService} from "../auth/auth.service";
import {ValidationPipe} from "../validation/validation.pipe";
import {ValidationSchema} from "../validation/validation.schema";
import {AuthCodeService} from "../auth/auth-code.service";
import {GRANT_TYPES} from "../casl/contexts";
import {AuthUserService} from "../casl/authUser.service";
import {TokenIssuanceService} from "../auth/token-issuance.service";
import {OAuthException} from "../exceptions/oauth-exception";
import {AuthorizeRedirectException} from "../exceptions/authorize-redirect.exception";
import {OAuthExceptionFilter} from "../exceptions/filter/oauth-exception.filter";
import {AuthorizeQueryParams, AuthorizeService} from "../auth/authorize.service";
import {CryptUtil} from "../util/crypt.util";
import {parseBasicAuthHeader} from "../util/http.util";
import {InjectRepository} from "@nestjs/typeorm";
import {Client} from "../entity/client.entity";
import {Repository} from "typeorm";
import {LoginSessionService} from "../auth/login-session.service";
import {ConsentService} from "../auth/consent.service";
import {ScopeResolverService} from "../casl/scope-resolver.service";
import {ClientService} from "../services/client.service";
import {PromptAction, PromptService} from "../auth/prompt.service";
import {ResourceIndicatorValidator} from "../auth/resource-indicator.validator";
import {Environment} from "../config/environment.service";

const logger = new Logger("OAuthTokenController");

@Controller("api/oauth")
@UseFilters(OAuthExceptionFilter)
@UseInterceptors(ClassSerializerInterceptor)
export class OAuthTokenController {
    constructor(
        private readonly authService: AuthService,
        private readonly authCodeService: AuthCodeService,
        private readonly authUserService: AuthUserService,
        private readonly tokenIssuanceService: TokenIssuanceService,
        private readonly authorizeService: AuthorizeService,
        private readonly loginSessionService: LoginSessionService,
        private readonly consentService: ConsentService,
        private readonly scopeResolverService: ScopeResolverService,
        @InjectRepository(Client)
        private readonly clientRepository: Repository<Client>,
        private readonly clientService: ClientService,
        private readonly promptService: PromptService,
    ) {
    }

    @Get("/authorize")
    async authorize(@Query() query: AuthorizeQueryParams, @Res() res: Response): Promise<void> {
        try {
            const validated = await this.authorizeService.validateAuthorizeRequest(query);

            const params = new URLSearchParams();
            params.set('client_id', query.client_id!); // it needs to be query.client_id as client id can also be a domain or client id
            params.set('redirect_uri', validated.redirectUri);
            params.set('scope', validated.scope);
            params.set('state', validated.state);
            params.set('response_type', validated.responseType);
            if (validated.codeChallenge) {
                params.set('code_challenge', validated.codeChallenge);
                params.set('code_challenge_method', validated.codeChallengeMethod);
            }
            if (validated.nonce) {
                params.set('nonce', validated.nonce);
            }
            // Forward new OIDC parameters
            if (validated.prompt) {
                params.set('prompt', validated.prompt);
            }
            if (validated.maxAge !== undefined) {
                params.set('max_age', String(validated.maxAge));
            }
            if (validated.resource) {
                params.set('resource', validated.resource);
            }

            res.redirect(302, `${Environment.get('BASE_URL', '')}/authorize?${params.toString()}`);
        } catch (error) {
            if (error instanceof AuthorizeRedirectException) {
                const params = new URLSearchParams();
                params.set('error', error.errorCode);
                params.set('error_description', error.errorDescription);
                if (error.state) {
                    params.set('state', error.state);
                }
                res.redirect(302, `${error.redirectUri}?${params.toString()}`);
                return;
            }
            throw error;
        }
    }

    @Post("/login")
    async login(
        @Req() req: ExpressRequest,
        @Body(new ValidationPipe(ValidationSchema.LoginSchema))
        body: {
            client_id: string;
            password: string;
            email: string;
            code_challenge_method: string;
            code_challenge: string;
            subscriber_tenant_hint?: string;
            redirect_uri?: string;
            scope?: string;
            nonce?: string;
            prompt?: string;
            max_age?: number;
            resource?: string;
        },
    ) {
        const user: User = await this.authService.validate(
            body.email,
            body.password,
        );

        // Resolve Client entity by clientId or alias (Requirements 3.1, 3.2, 3.3)
        let client: Client;
        try {
            client = await this.clientService.findByClientIdOrAlias(body.client_id);
        } catch {
            throw OAuthException.invalidClient('Unknown client_id');
        }
        const tenant = client.tenant;

        // Determine first-party status: when the caller used the alias (domain) as client_id,
        // it is a first-party login and consent should be skipped (Requirements 8.1, 8.2)
        const isFirstParty = client.alias === body.client_id;

        // PKCE enforcement based on client configuration
        // When code_challenge is not provided AND client requires PKCE, reject the request
        if (!body.code_challenge && client.requirePkce) {
            throw OAuthException.invalidRequest('code_challenge is required for this client');
        }

        // When code_challenge IS provided, enforce S256 and downgrade prevention
        if (body.code_challenge) {
            if (client.requirePkce && body.code_challenge_method === 'plain') {
                throw OAuthException.invalidRequest('S256 code_challenge_method is required for this client');
            }
            if (client.pkceMethodUsed === 'S256' && body.code_challenge_method === 'plain') {
                throw OAuthException.invalidRequest('PKCE downgrade not allowed: this client has previously used S256');
            }
        }

        // Validate redirect_uri against registered URIs before proceeding
        await this.authorizeService.validateRedirectUriForClient(body.client_id, body.redirect_uri);

        const result = await this.tokenIssuanceService.resolveLoginAccess(
            user, tenant, body.subscriber_tenant_hint,
        );

        if (!result.granted) {
            return {
                requires_tenant_selection: true,
                tenants: result.ambiguousTenants,
            };
        }

        // Parse prompt parameter and evaluate prompt/max_age requirements
        const promptValues = this.promptService.parsePrompt(body.prompt);
        this.promptService.validatePrompt(promptValues);

        // Find existing session for prompt/max_age evaluation
        const existingSession = await this.loginSessionService.findValidSession(user.id, tenant.id);

        // Resolve scopes for consent check
        const clientAllowedScopes = client.allowedScopes || 'openid profile email';
        const resolvedScopes = this.scopeResolverService.resolveScopes(
            body.scope,
            clientAllowedScopes,
        );

        // Check consent state for prompt evaluation
        let consentGranted = true;
        if (!isFirstParty) {
            const consentCheck = await this.consentService.checkConsent(
                user.id,
                client.clientId,
                resolvedScopes,
            );
            consentGranted = !consentCheck.consentRequired;
        }

        // Evaluate prompt/max_age to determine action
        const evaluation = this.promptService.evaluate({
            promptValues,
            maxAge: body.max_age,
            session: existingSession,
            consentGranted,
        });

        // Handle FORCE_LOGIN: invalidate all existing sessions before creating a new one
        if (evaluation.action === PromptAction.FORCE_LOGIN) {
            await this.loginSessionService.invalidateAllSessions(user.id, tenant.id);
        }

        // Handle FORCE_CONSENT: always return requires_consent regardless of existing consent
        if (evaluation.action === PromptAction.FORCE_CONSENT) {
            return {
                requires_consent: true,
                requested_scopes: resolvedScopes,
                client_name: client.name || client.clientId,
            };
        }

        // Consent check: only for third-party clients (non-first-party)
        // First-party (alias-resolved) logins skip consent (Requirements 8.1, 8.2)
        if (!isFirstParty && consentGranted === false) {
            const consentCheck = await this.consentService.checkConsent(
                user.id,
                client.clientId,
                resolvedScopes,
            );

            return {
                requires_consent: true,
                requested_scopes: consentCheck.requestedScopes,
                client_name: client.name || client.clientId,
            };
        }

        // Create session (new session if FORCE_LOGIN, otherwise may reuse existing)
        const session = evaluation.action === PromptAction.FORCE_LOGIN
            ? await this.loginSessionService.createSession(user.id, tenant.id)
            : existingSession || await this.loginSessionService.createSession(user.id, tenant.id);

        const auth_code = await this.authCodeService.createAuthToken(
            user,
            tenant,
            body.client_id,
            body.code_challenge || null,
            body.code_challenge ? (body.code_challenge_method || 'plain') : null,
            result.resolvedHint,
            body.redirect_uri,
            body.scope,
            body.nonce,
            session.sid,
            evaluation.requireAuthTime,
            body.resource,
        );

        // Update pkceMethodUsed if client used S256 for the first time
        if (body.code_challenge && body.code_challenge_method === 'S256' && client.pkceMethodUsed !== 'S256') {
            client.pkceMethodUsed = 'S256';
            await this.clientRepository.save(client);
        }

        return {
            authentication_code: auth_code,
        };
    }

    @Post("/consent")
    async consent(
        @Body(new ValidationPipe(ValidationSchema.ConsentSchema))
        body: {
            email: string;
            password: string;
            client_id: string;
            code_challenge: string;
            code_challenge_method: string;
            approved_scopes: string[];
            consent_action: 'approve' | 'deny';
            redirect_uri?: string;
            scope?: string;
            nonce?: string;
            subscriber_tenant_hint?: string;
            prompt?: string;
            resource?: string;
        },
    ): Promise<any> {
        // Re-authenticate the user
        const user: User = await this.authService.validate(
            body.email,
            body.password,
        );

        // Handle deny action
        if (body.consent_action === 'deny') {
            return {
                error: 'access_denied',
                error_description: 'The resource owner denied the request',
            };
        }

        // Handle approve action
        if (body.consent_action === 'approve') {
            // Resolve Client entity by clientId or alias (Requirements 10.1, 10.2)
            let client: Client;
            try {
                client = await this.clientService.findByClientIdOrAlias(body.client_id);
            } catch {
                throw OAuthException.invalidClient('Unknown client_id');
            }

            // Validate approved_scopes against client.allowedScopes
            const clientAllowedScopes = client.allowedScopes || 'openid profile email';
            const resolvedScopes = this.scopeResolverService.resolveScopes(
                body.approved_scopes.join(' '),
                clientAllowedScopes,
            );

            // Grant consent using client.clientId (UUID), not body.client_id (Requirements 10.1, 10.2)
            await this.consentService.grantConsent(
                user.id,
                client.clientId,
                resolvedScopes,
            );

            // Resolve tenant from the client entity
            const tenant = client.tenant;

            // Determine requireAuthTime: true when prompt contains 'login' (Requirement 7.2)
            const promptValues = this.promptService.parsePrompt(body.prompt);
            const requireAuthTime = promptValues.includes('login');

            // Create session
            const session = await this.loginSessionService.createSession(user.id, tenant.id);

            // Create auth code
            const auth_code = await this.authCodeService.createAuthToken(
                user,
                tenant,
                body.client_id,
                body.code_challenge || null,
                body.code_challenge ? (body.code_challenge_method || 'plain') : null,
                body.subscriber_tenant_hint,
                body.redirect_uri,
                body.scope,
                body.nonce,
                session.sid,
                requireAuthTime,
                body.resource,
            );

            return {
                authentication_code: auth_code,
            };
        }

        throw OAuthException.invalidRequest('Invalid consent_action');
    }

    @Post("/silent-auth")
    async silentAuth(
        @Body(new ValidationPipe(ValidationSchema.SilentAuthSchema))
        body: {
            client_id: string;
            user_id: string;
            tenant_id: string;
            code_challenge: string;
            code_challenge_method: string;
            redirect_uri?: string;
            scope?: string;
            nonce?: string;
            max_age?: number;
            resource?: string;
        },
    ): Promise<{ authentication_code: string } | { error: string; error_description: string }> {
        // Resolve Client entity by clientId or alias
        let client: Client;
        try {
            client = await this.clientService.findByClientIdOrAlias(body.client_id);
        } catch {
            return {
                error: 'invalid_client',
                error_description: 'Unknown client_id',
            };
        }
        const tenant = client.tenant;

        // Find valid session for the user+tenant
        const session = await this.loginSessionService.findValidSession(body.user_id, tenant.id);

        // Resolve scopes for consent check
        const clientAllowedScopes = client.allowedScopes || 'openid profile email';
        const resolvedScopes = this.scopeResolverService.resolveScopes(
            body.scope,
            clientAllowedScopes,
        );

        // Check consent state
        const consentCheck = await this.consentService.checkConsent(
            body.user_id,
            client.clientId,
            resolvedScopes,
        );
        const consentGranted = !consentCheck.consentRequired;

        // Evaluate prompt=none with gathered context
        const evaluation = this.promptService.evaluate({
            promptValues: ['none'],
            maxAge: body.max_age,
            session,
            consentGranted,
        });

        // If evaluation returns an error, return it as JSON
        if (evaluation.error) {
            return {
                error: evaluation.error,
                error_description: evaluation.errorDescription || '',
            };
        }

        // If evaluation returns ISSUE_CODE, create auth code using existing session's sid
        if (evaluation.action === PromptAction.ISSUE_CODE && session) {
            // Get user entity for auth code creation
            const user = await this.authUserService.findUserById(body.user_id);

            const auth_code = await this.authCodeService.createAuthToken(
                user,
                tenant,
                body.client_id,
                body.code_challenge || null,
                body.code_challenge ? (body.code_challenge_method || 'plain') : null,
                undefined, // subscriberTenantHint
                body.redirect_uri,
                body.scope,
                body.nonce,
                session.sid,
                evaluation.requireAuthTime,
                body.resource,
            );

            return {
                authentication_code: auth_code,
            };
        }

        // This should not happen with prompt=none, but handle gracefully
        return {
            error: 'interaction_required',
            error_description: 'An unexpected error occurred during silent authentication',
        };
    }

    @HttpCode(200)
    @Post("/token")
    async oauthToken(
        @Req() req: ExpressRequest,
        @Body() body: any,
    ): Promise<any> {
        let clientId = body.client_id;
        let clientSecret = body.client_secret;
        const basicCredentials = parseBasicAuthHeader(req.headers.authorization);
        if (basicCredentials) {
            clientId = basicCredentials.username;
            clientSecret = basicCredentials.password;
        }
        body.client_id = clientId;
        body.client_secret = clientSecret;

        switch (body.grant_type) {
            case GRANT_TYPES.CODE:
                return this.handleCodeGrant(body);
            case GRANT_TYPES.PASSWORD:
                return this.handlePasswordGrant(body);
            case GRANT_TYPES.CLIENT_CREDENTIALS:
                return this.handleClientCredentialsGrant(body);
            case GRANT_TYPES.REFRESH_TOKEN:
                return this.handleRefreshTokenGrant(body);
            default:
                throw OAuthException.unsupportedGrantType("grant type not recognised.");
        }
    }

    @Post("/exchange")
    async exchangeAccessToken(
        @Body(new ValidationPipe(ValidationSchema.ExchangeTokenSchema))
        body: {
            access_token: string;
            client_id: string;
            client_secret: string;
        },
    ): Promise<object> {
        let tenantToken = await this.authService.validateAccessToken(body.access_token);
        if (tenantToken.grant_type !== GRANT_TYPES.PASSWORD) {
            throw OAuthException.invalidGrant("The grant type of the source token is not permitted for exchange");
        }

        // Validate client credentials and get the Client entity
        // Requirements: 2.1, 2.4
        const client = await this.authService.validateClientCredentials(
            body.client_id,
            body.client_secret,
        );

        const user = await this.authUserService.findUserByEmail(
            tenantToken.asTenantToken().email,
        );

        // Use the tenant from the Client entity
        const tenant = client.tenant;

        return this.tokenIssuanceService.issueToken(user, tenant);
    }

    private async handleCodeGrant(body: any): Promise<any> {
        let validationPipe = new ValidationPipe(
            ValidationSchema.CodeGrantSchema,
        );
        await validationPipe.transform(body, null);

        // Atomically redeem the auth code (single-use + expiration check)
        const authCode = await this.authCodeService.redeemAuthCode(body.code);

        // Verify client_id binding
        if (body.client_id !== authCode.clientId) {
            logger.warn(`Auth code grant mismatch: stored client_id '${authCode.clientId}' does not match request client_id '${body.client_id}'`);
            throw OAuthException.invalidGrant("The authorization code was not issued to this client or the client_id is invalid.");
        }

        // Verify redirect_uri binding (RFC 6749 §4.1.3)
        if (authCode.redirectUri) {
            if (!body.redirect_uri) {
                throw OAuthException.invalidGrant(
                    'The redirect_uri parameter is required when it was included in the authorization request'
                );
            }
            if (body.redirect_uri !== authCode.redirectUri) {
                throw OAuthException.invalidGrant(
                    'The redirect_uri does not match the value used in the authorization request'
                );
            }
        }

        // Validate PKCE: only when the authorization code was issued with a code_challenge
        if (authCode.codeChallenge) {
            if (!body.code_verifier) {
                throw OAuthException.invalidGrant("code_verifier is required when code_challenge was provided in the authorization request");
            }
            const generatedChallenge = CryptUtil.generateCodeChallenge(body.code_verifier, authCode.method);
            if (generatedChallenge !== authCode.codeChallenge) {
                throw OAuthException.invalidGrant("The authorization code is invalid or the code verifier does not match");
            }
        }

        // Resolve user and tenant from the auth code record
        const user = await this.authUserService.findUserById(authCode.userId);
        const tenant = await this.authUserService.findTenantById(authCode.tenantId);

        // Use the resource from the auth code (auth code's stored value takes precedence per Requirement 3.5)
        return this.tokenIssuanceService.issueToken(user, tenant, {
            subscriberTenantHint: authCode.subscriberTenantHint,
            requestedScope: body.scope || authCode.scope,
            nonce: authCode.nonce ?? undefined,
            sid: authCode.sid ?? undefined,
            grant_type: GRANT_TYPES.CODE,
            requireAuthTime: authCode.requireAuthTime,
            resource: authCode.resource ?? undefined,
            oauthClientId: authCode.clientId,
        });
    }

    private async handlePasswordGrant(body: any): Promise<any> {
        let validationPipe = new ValidationPipe(
            ValidationSchema.PasswordGrantSchema,
        );
        await validationPipe.transform(body, null);

        // Log deprecation warning for every password grant request (Requirement 6.1, 6.2, 6.3)
        logger.warn(`Password grant requested by client_id '${body.client_id}'. The password grant is deprecated per OAuth 2.1.`);

        // Resolve Client entity by clientId or alias (Requirement 4.1)
        let client: Client;
        try {
            client = await this.clientService.findByClientIdOrAlias(body.client_id);
        } catch {
            throw OAuthException.unauthorizedClient('The password grant is not permitted for this client');
        }

        // Reject if allowPasswordGrant is false (Requirement 4.3, 5.1, 5.2, 5.3)
        if (!client.allowPasswordGrant) {
            throw OAuthException.unauthorizedClient('The password grant is not permitted for this client');
        }

        // Validate credentials only after client is authorized (Requirement 5.3)
        const user: User = await this.authService.validate(
            body.username,
            body.password
        );

        // Use the loaded client's tenant (Requirement 4.2)
        const tenant = client.tenant;

        // Validate resource indicator if present
        const resource = await this.validateResourceForTokenRequest(body.resource, body.client_id);

        return this.tokenIssuanceService.issueToken(user, tenant, {
            subscriberTenantHint: body.subscriber_tenant_hint,
            requestedScope: body.scope,
            grant_type: GRANT_TYPES.PASSWORD,
            resource,
            oauthClientId: body.client_id,
        });
    }

    private async handleClientCredentialsGrant(body: any): Promise<any> {
        let validationPipe = new ValidationPipe(
            ValidationSchema.ClientCredentialGrantSchema,
        );
        await validationPipe.transform(body, null);

        // Validate client credentials and get the Client entity
        // Requirements: 2.1, 3.5
        const client: Client =
            await this.authService.validateClientCredentials(
                body.client_id,
                body.client_secret,
            );

        // Validate resource indicator if present.
        let resource: string | undefined;
        if (body.resource) {
            // First validate the URI format per RFC 8707
            if (!ResourceIndicatorValidator.isValidResourceUri(body.resource)) {
                throw OAuthException.invalidTarget('The resource parameter must be an absolute URI without a fragment component');
            }

            // Validate against the Client's allowedResources
            const allowedResources = client.allowedResources
                ? (typeof client.allowedResources === 'string'
                    ? JSON.parse(client.allowedResources)
                    : client.allowedResources)
                : null;
            ResourceIndicatorValidator.validateResource(body.resource, allowedResources);
            resource = body.resource;
        }

        return this.tokenIssuanceService.issueClientCredentialsToken(
            client,
            body.scope ?? null,
            resource,
        );
    }

    private async handleRefreshTokenGrant(body: any): Promise<any> {
        const validationPipe = new ValidationPipe(
            ValidationSchema.RefreshTokenGrantSchema,
        );
        await validationPipe.transform(body, null);

        // Authenticate the client: resolve Client entity directly.
        // Confidential clients must provide a secret, public clients only need a valid client_id (RFC 6749 §6).
        // Requirements: 2.1, 2.3, 4.2, 4.3
        let client: Client;
        try {
            client = await this.clientService.findByClientIdOrAlias(body.client_id);
        } catch {
            throw OAuthException.invalidClient('Client authentication failed');
        }

        // Validate client authentication
        if (client.isPublic) {
            // Public clients don't need a secret, but we still validate the client exists
            // (already done above via findByClientIdOrAlias)
        } else {
            // Confidential clients must provide a valid secret
            if (!body.client_secret) {
                throw OAuthException.invalidClient('Confidential clients must provide client_secret');
            }
            if (!this.clientService.validateClientSecret(client, body.client_secret)) {
                throw OAuthException.invalidClient('Client authentication failed');
            }
        }

        // Validate resource indicator if present
        const resource = await this.validateResourceForTokenRequest(body.resource, body.client_id);

        // Use the Client entity's clientId (UUID) for refresh token binding
        return this.tokenIssuanceService.refreshToken(
            body.refresh_token,
            client.clientId,
            body.scope,
            resource,
            body.client_id,
        );
    }

    /**
     * Validate a resource parameter for token requests.
     * Looks up the client, parses allowedResources, and validates the resource.
     * Returns the validated resource or undefined if no resource was provided.
     */
    private async validateResourceForTokenRequest(
        resource: string | undefined,
        clientId: string,
    ): Promise<string | undefined> {
        if (!resource) {
            return undefined;
        }

        const client = await this.clientService.findByClientIdOrAlias(clientId);
        const allowedResources = client.allowedResources
            ? (typeof client.allowedResources === 'string'
                ? JSON.parse(client.allowedResources)
                : client.allowedResources)
            : null;

        ResourceIndicatorValidator.validateResource(resource, allowedResources);
        return resource;
    }
}
