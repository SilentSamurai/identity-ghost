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
    Header,
    HttpCode,
    Logger,
    Post,
    Query,
    Req,
    Res,
    UnauthorizedException,
    UseFilters,
    UseInterceptors,
} from "@nestjs/common";
import {Request as ExpressRequest, Response} from "express";
import * as crypto from "crypto";

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
import {Client} from "../entity/client.entity";
import {LoginSessionService} from "../auth/login-session.service";
import {ConsentService} from "../auth/consent.service";
import {ScopeResolverService} from "../casl/scope-resolver.service";
import {ClientService} from "../services/client.service";
import {ResourceIndicatorValidator} from "../auth/resource-indicator.validator";
import {Environment} from "../config/environment.service";
import {RefreshTokenService} from "../auth/refresh-token.service";
import { deprecate } from "util";

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
        private readonly clientService: ClientService,
        private readonly refreshTokenService: RefreshTokenService,
    ) {
    }

    @Get("/authorize")
    async authorize(
        @Query() query: AuthorizeQueryParams,
        @Req() req: ExpressRequest,
        @Res() res: Response,
    ): Promise<void> {
        try {
            const validated = await this.authorizeService.validateAuthorizeRequest(query);

            // 1. Forced login: from_logout or prompt=login
            if (query.from_logout === 'true' || validated.prompt === 'login') {
                return this.redirectToLoginUI(res, query, validated);
            }

            // 2. Unsupported prompt values
            const supportedPrompts = ['none', 'login', 'consent', undefined];
            if (validated.prompt && !supportedPrompts.includes(validated.prompt)) {
                return this.redirectWithError(
                    res, validated.redirectUri,
                    'invalid_request',
                    `Unsupported prompt value: ${validated.prompt}. Supported values: none, login, consent`,
                    validated.state,
                );
            }

            // 3. Resolve session from signed sid cookie
            const session = await this.resolveSession(req, validated.maxAge);

            // 4. No session
            if (!session) {
                if (validated.prompt === 'none') {
                    return this.redirectWithError(
                        res, validated.redirectUri, 'login_required', 'No valid session', validated.state,
                    );
                }
                return this.redirectToLoginUI(res, query, validated);
            }

            // 5. Session valid — resolve client and consent
            const client = await this.clientService.findByClientIdOrAlias(query.client_id!);
            const isFirstParty = client.alias === query.client_id;

            const resolvedScopes = this.scopeResolverService.resolveScopes(
                validated.scope, client.allowedScopes || 'openid profile email',
            );

            let consentGranted = true;
            if (!isFirstParty) {
                const consentCheck = await this.consentService.checkConsent(
                    session.userId, client.clientId, resolvedScopes,
                );
                consentGranted = !consentCheck.consentRequired;
            }

            const skipConfirm = client.tenant?.skipSessionConfirm === true;
            const confirmed = query.session_confirmed === 'true';

            // prompt=consent — force re-approval (session-confirm first if configured)
            if (validated.prompt === 'consent') {
                if (!skipConfirm && !confirmed) {
                    return this.redirectToSessionConfirmUI(res, query, validated);
                }
                return this.redirectToConsentUI(res, query, validated, session.sid);
            }

            // No consent → consent UI
            if (!consentGranted) {
                return this.redirectToConsentUI(res, query, validated, session.sid);
            }

            // Consent exists → issue code or session-confirm
            if (skipConfirm || confirmed) {
                return this.issueCodeAndRedirect(res, session, client, query, validated);
            }
            return this.redirectToSessionConfirmUI(res, query, validated);

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

    /**
     * Resolve session from signed sid cookie.
     * Returns null if cookie is missing, signature invalid, session not found, expired, or max_age exceeded.
     */
    private async resolveSession(req: ExpressRequest, maxAge?: number): Promise<import('../entity/login-session.entity').LoginSession | null> {
        const sid = (req as any).signedCookies?.sid;
        if (!sid) return null;

        const session = await this.loginSessionService.findSessionBySid(sid);
        if (!session) return null;

        // max_age check per OIDC Core §3.1.2.1
        if (maxAge !== undefined) {
            const elapsed = Math.floor(Date.now() / 1000) - session.authTime;
            if (elapsed > maxAge) return null;
        }
        return session;
    }

    /**
     * Issue an authorization code and redirect to the client's redirect_uri.
     */
    private async issueCodeAndRedirect(
        res: Response,
        session: import('../entity/login-session.entity').LoginSession,
        client: Client,
        query: AuthorizeQueryParams,
        validated: import('../auth/authorize.service').ValidatedAuthorizeRequest,
    ): Promise<void> {
        const user = await this.authUserService.findUserById(session.userId);
        const authCode = await this.authCodeService.createAuthToken(
            user,
            client.tenant,
            query.client_id!,
            validated.codeChallenge || null,
            validated.codeChallenge ? (validated.codeChallengeMethod || 'plain') : null,
            undefined,
            validated.redirectUri,
            validated.scope,
            validated.nonce,
            session.sid,
            false,
            validated.resource,
        );
        const params = new URLSearchParams();
        params.set('code', authCode);
        if (validated.state) params.set('state', validated.state);
        res.redirect(302, `${validated.redirectUri}?${params.toString()}`);
    }

    /**
     * Redirect to the login UI, preserving all OAuth params.
     */
    private redirectToLoginUI(
        res: Response,
        query: AuthorizeQueryParams,
        validated: import('../auth/authorize.service').ValidatedAuthorizeRequest,
    ): void {
        const params = new URLSearchParams();
        params.set('client_id', query.client_id!);
        params.set('redirect_uri', validated.redirectUri);
        params.set('scope', validated.scope);
        params.set('state', validated.state);
        params.set('response_type', validated.responseType);
        if (validated.codeChallenge) {
            params.set('code_challenge', validated.codeChallenge);
            params.set('code_challenge_method', validated.codeChallengeMethod);
        }
        if (validated.nonce) params.set('nonce', validated.nonce);
        if (validated.resource) params.set('resource', validated.resource);
        if (query.from_logout === 'true') params.set('from_logout', 'true');
        res.redirect(302, `${Environment.get('BASE_URL', '')}/authorize?${params.toString()}`);
    }

    /**
     * Redirect to the session-confirm UI, preserving all OAuth params.
     */
    private redirectToSessionConfirmUI(
        res: Response,
        query: AuthorizeQueryParams,
        validated: import('../auth/authorize.service').ValidatedAuthorizeRequest,
    ): void {
        const params = new URLSearchParams();
        params.set('client_id', query.client_id!);
        params.set('redirect_uri', validated.redirectUri);
        params.set('response_type', validated.responseType);
        params.set('state', validated.state);
        params.set('scope', validated.scope);
        if (validated.codeChallenge) {
            params.set('code_challenge', validated.codeChallenge);
            params.set('code_challenge_method', validated.codeChallengeMethod);
        }
        if (validated.nonce) params.set('nonce', validated.nonce);
        if (validated.resource) params.set('resource', validated.resource);
        res.redirect(302, `${Environment.get('BASE_URL', '')}/session-confirm?${params.toString()}`);
    }

    /**
     * Redirect to the consent UI with a stateless CSRF token.
     */
    private redirectToConsentUI(
        res: Response,
        query: AuthorizeQueryParams,
        validated: import('../auth/authorize.service').ValidatedAuthorizeRequest,
        sid: string,
    ): void {
        // Stateless CSRF token — deterministic per session, multi-tab safe
        const csrfToken = crypto
            .createHmac('sha256', Environment.get('COOKIE_SECRET', 'dev-cookie-secret-do-not-use-in-prod'))
            .update(sid)
            .digest('hex');

        const params = new URLSearchParams();
        params.set('client_id', query.client_id!);
        params.set('redirect_uri', validated.redirectUri);
        params.set('response_type', validated.responseType);
        params.set('state', validated.state);
        params.set('scope', validated.scope);
        params.set('csrf_token', csrfToken);
        if (validated.codeChallenge) {
            params.set('code_challenge', validated.codeChallenge);
            params.set('code_challenge_method', validated.codeChallengeMethod);
        }
        if (validated.nonce) params.set('nonce', validated.nonce);
        if (validated.resource) params.set('resource', validated.resource);
        res.redirect(302, `${Environment.get('BASE_URL', '')}/consent?${params.toString()}`);
    }

    /**
     * Redirect to redirect_uri with an OAuth error.
     */
    private redirectWithError(
        res: Response,
        redirectUri: string,
        error: string,
        description: string,
        state?: string,
    ): void {
        const params = new URLSearchParams();
        params.set('error', error);
        params.set('error_description', description);
        if (state) params.set('state', state);
        res.redirect(302, `${redirectUri}?${params.toString()}`);
    }

    /**
     * Helper to get the cookie options for the sid cookie.
     */
    private getSidCookieOptions(maxAge: number): Record<string, any> {
        return {
            signed: true,
            httpOnly: true,
            secure: Environment.get('ENABLE_HTTPS') === 'true' || process.env.NODE_ENV === 'production',
            sameSite: 'lax' as const,
            path: '/api/oauth',
            maxAge: maxAge * 1000, // convert seconds to ms
        };
    }

    @Post("/login")
    async login(
        @Req() req: ExpressRequest,
        @Res({passthrough: true}) res: Response,
        @Body(new ValidationPipe(ValidationSchema.LoginSchema))
        body: {
            client_id: string;
            password: string;
            email: string;
        },
    ): Promise<{ success: true }> {
        const user: User = await this.authService.validate(body.email, body.password);

        // Resolve Client entity by clientId or alias
        let client: Client;
        try {
            client = await this.clientService.findByClientIdOrAlias(body.client_id);
        } catch {
            throw OAuthException.invalidClient('Unknown client_id');
        }
        const tenant = client.tenant;

        // Create a new login session
        const session = await this.loginSessionService.createSession(user.id, tenant.id);

        // Compute cookie max-age from configured session duration
        const durationSeconds = parseInt(
            Environment.get('LOGIN_SESSION_DURATION_SECONDS', '1296000'),
            10,
        );

        // Set signed sid cookie
        res.cookie('sid', session.sid, this.getSidCookieOptions(durationSeconds));

        // Return success — frontend constructs the redirect URL from OAuth params it already has
        return {success: true};
    }

    @Post("/consent")
    async consent(
        @Req() req: ExpressRequest,
        @Res() res: Response,
        @Body()
        body: {
            client_id: string;
            redirect_uri: string;
            scope?: string;
            state?: string;
            response_type?: string;
            code_challenge?: string;
            code_challenge_method?: string;
            nonce?: string;
            resource?: string;
            csrf_token: string;
            decision: 'grant' | 'deny';
        },
    ): Promise<void> {
        // 1. Validate session from signed cookie first
        const sid = (req as any).signedCookies?.sid;
        if (!sid) {
            res.status(401).send('No session');
            return;
        }
        const session = await this.loginSessionService.findSessionBySid(sid);
        if (!session) {
            res.status(401).send('Session expired');
            return;
        }

        // 2. Validate CSRF token using constant-time comparison
        const expectedToken = crypto
            .createHmac('sha256', Environment.get('COOKIE_SECRET', 'dev-cookie-secret-do-not-use-in-prod'))
            .update(sid)
            .digest('hex');

        let csrfValid = false;
        try {
            csrfValid = body.csrf_token &&
                body.csrf_token.length === expectedToken.length &&
                crypto.timingSafeEqual(
                    Buffer.from(body.csrf_token, 'hex'),
                    Buffer.from(expectedToken, 'hex'),
                );
        } catch {
            csrfValid = false;
        }

        if (!csrfValid) {
            res.status(403).send('Invalid CSRF token');
            return;
        }

        // 3. Validate redirect_uri against client's registered URIs
        let client: Client;
        try {
            client = await this.clientService.findByClientIdOrAlias(body.client_id);
        } catch {
            res.status(400).send('Unknown client_id');
            return;
        }

        const registeredUris: string[] = client.redirectUris || [];
        if (registeredUris.length > 0 && !registeredUris.includes(body.redirect_uri)) {
            res.status(400).send('Invalid redirect_uri');
            return;
        }

        // Handle denial — redirect to client with error
        if (body.decision === 'deny') {
            const params = new URLSearchParams();
            params.set('error', 'access_denied');
            params.set('error_description', 'User denied consent');
            if (body.state) params.set('state', body.state);
            res.redirect(302, `${body.redirect_uri}?${params.toString()}`);
            return;
        }

        // Handle grant — record consent and PRG redirect to authorize
        const resolvedScopes = this.scopeResolverService.resolveScopes(
            body.scope || '', client.allowedScopes || 'openid profile email',
        );
        await this.consentService.grantConsent(session.userId, client.clientId, resolvedScopes);

        // PRG: redirect to authorize — it will see session + consent and issue code
        const params = new URLSearchParams();
        params.set('client_id', body.client_id);
        params.set('redirect_uri', body.redirect_uri);
        params.set('response_type', body.response_type || 'code');
        if (body.scope) params.set('scope', body.scope);
        if (body.state) params.set('state', body.state);
        if (body.code_challenge) params.set('code_challenge', body.code_challenge);
        if (body.code_challenge_method) params.set('code_challenge_method', body.code_challenge_method);
        if (body.nonce) params.set('nonce', body.nonce);
        if (body.resource) params.set('resource', body.resource);
        params.set('session_confirmed', 'true');
        res.redirect(302, `/api/oauth/authorize?${params.toString()}`);
    }

    /**
     * POST /session-logout — Cookie-authenticated logout.
     * Invalidates the server-side session, revokes associated refresh tokens, and clears the sid cookie.
     */
    // @Post("/session-logout")
    // @HttpCode(200)
    // @Header('Cache-Control', 'no-store')
    // @Header('Pragma', 'no-cache')
    // async sessionLogout(
    //     @Req() req: ExpressRequest,
    //     @Res({passthrough: true}) res: Response,
    // ): Promise<Record<string, never>> {
    //     const sid = (req as any).signedCookies?.sid;
    //     if (sid) {
    //         await this.loginSessionService.invalidateSession(sid);
    //         await this.refreshTokenService.revokeBySid(sid);
    //     }

    //     // Clear the sid cookie
    //     res.cookie('sid', '', {
    //         signed: true,
    //         httpOnly: true,
    //         secure: Environment.get('ENABLE_HTTPS') === 'true' || process.env.NODE_ENV === 'production',
    //         sameSite: 'lax' as const,
    //         path: '/api/oauth',
    //         maxAge: 0,
    //     });

    //     return {};
    // }

    /**
     * GET /session-info — Cookie-authenticated session info.
     * Returns the email of the currently authenticated user.
     */
    @Get("/session-info")
    @Header('Cache-Control', 'no-store')
    async sessionInfo(
        @Req() req: ExpressRequest,
    ): Promise<{ email: string }> {
        const sid = (req as any).signedCookies?.sid;
        if (!sid) {
            throw new UnauthorizedException('No session');
        }

        const session = await this.loginSessionService.findSessionBySid(sid);
        if (!session) {
            throw new UnauthorizedException('Session expired');
        }

        const user = await this.authUserService.findUserById(session.userId);
        return {email: user.email};
    }

    /**
     * GET /logout — RP-Initiated Logout entry point (per OpenID Connect RP-Initiated Logout §2).
     * Validates post_logout_redirect_uri if provided and redirects to the UI logout page.
     */
    @Get("/logout")
    async rpInitiatedLogout(
        @Query() query: { post_logout_redirect_uri?: string; state?: string; id_token_hint?: string },
        @Res() res: Response,
    ): Promise<void> {
        const params = new URLSearchParams();
        if (query.post_logout_redirect_uri) {
            params.set('post_logout_redirect_uri', query.post_logout_redirect_uri);
        }
        if (query.state) {
            params.set('state', query.state);
        }
        res.redirect(302, `${Environment.get('BASE_URL', '')}/logout?${params.toString()}`);
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
