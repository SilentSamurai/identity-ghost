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
    BadRequestException,
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
import {TenantAmbiguityService, TenantInfo} from "../auth/tenant-ambiguity.service";
import {FirstPartyResolver} from "../auth/first-party-resolver";
import {AppClientAuditLogger} from "../log/app-client-audit.logger";
import {AppService} from "../services/app.service";
import {FlowIdCookieService} from "../auth/flow-id-cookie.service";
import {CsrfTokenService} from "../auth/csrf-token.service";

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
        private readonly tenantAmbiguityService: TenantAmbiguityService,
        private readonly firstPartyResolver: FirstPartyResolver,
        private readonly appClientAuditLogger: AppClientAuditLogger,
        private readonly appService: AppService,
        private readonly flowIdCookieService: FlowIdCookieService,
        private readonly csrfTokenService: CsrfTokenService,
    ) {
    }

/**
     * GET /api/oauth/authorize — OAuth 2.0 authorization endpoint.
     *
     * Flow chart (entry point: external app redirects user to /authorize):
     *```mermaid
     *   graph TD
     *       START((External App<br/>redirects user)) --> A
     *       A[GET /api/oauth/authorize] -->|no session / invalid / from_logout| D[302 → UI login form]
     *       A -->|prompt=none + no session| E[302 redirect_uri?error=login_required]
     *       A -->|session + no consent| I[302 → UI consent]
     *       A -->|session + consent + session_confirmed=true| B[302 redirect_uri?code=...]
     *       A -->|session + consent + no session_confirmed| C[302 → UI session-confirm]
     *       A -->|session + consent + skipConfirm=true| B
     *       C -->|Continue click| A
     *       C -->|Logout click| G[POST /api/oauth/logout]
     *       G --> D
     *       I -->|Grant consent| H[POST /api/oauth/consent]
     *       I -->|Deny consent| J[302 redirect_uri?error=access_denied]
     *       H --> B
     *       D -->|POST /api/oauth/login| F
     *       F{login result} -->|success + first-party| B
     *       F -->|success + third-party + no consent| I
     *       F -->|success + third-party + consent| C
     *       F -->|requires_tenant_selection=true| K[UI tenant-selection]
     *       K -->|select tenant + re-POST /api/oauth/login| F
     *       B --> END((External App<br/>receives code))
     *```
     */
    @Get("/authorize")
    async authorize(
        @Query() query: AuthorizeQueryParams,
        @Req() req: ExpressRequest,
        @Res() res: Response,
    ): Promise<void> {
        try {
            const validated = await this.authorizeService.validateAuthorizeRequest(query);

            // 0. User explicitly denied consent — issue the access_denied error
            //    redirect immediately, before any session or UI checks.
            if (query.consent_denied === 'true') {
                return this.redirectWithError(
                    res,
                    validated.redirectUri,
                    'access_denied',
                    'The user denied the authorization request.',
                    validated.state,
                );
            }

            // 1. Forced login: from_logout or prompt=login
            if (query.from_logout === 'true' || validated.prompt === 'login') {
                const flowId = this.flowIdCookieService.mintIfAbsent(req, res);
                return this.redirectToAuthorizeUI(res, query, validated, 'login', flowId);
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
                const flowId = this.flowIdCookieService.mintIfAbsent(req, res);
                return this.redirectToAuthorizeUI(res, query, validated, 'login', flowId);
            }

            // 5. Session valid — resolve client and consent
            const client = await this.clientService.findByClientIdOrAlias(query.client_id!);

            // First-party = redirect_uri points to auth server itself (user stays on auth server)
            // Third-party = redirect_uri points to external app (user authorizing external app)
            // See FirstPartyResolver for detailed explanation
            const isFirstParty = this.firstPartyResolver.isFirstParty(client, validated.redirectUri);

            // Task 15.3: Log when authorize resolves to an App_Client
            const linkedApp = await this.appService.findByClientId(client.id);
            if (linkedApp) {
                this.appClientAuditLogger.logAuthorizeResolved({
                    appId: linkedApp.id,
                    clientId: client.clientId,
                    alias: client.alias || '',
                    userId: session.userId,
                    correlationId: '',
                });
            }

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
                    const flowId = this.flowIdCookieService.mintIfAbsent(req, res);
                    return this.redirectToAuthorizeUI(res, query, validated, 'session-confirm', flowId);
                }
                const flowId = this.flowIdCookieService.mintIfAbsent(req, res);
                return this.redirectToAuthorizeUI(res, query, validated, 'consent', flowId);
            }

            // No consent → consent UI
            if (!consentGranted) {
                const flowId = this.flowIdCookieService.mintIfAbsent(req, res);
                return this.redirectToAuthorizeUI(res, query, validated, 'consent', flowId);
            }

            // Consent exists → issue code or session-confirm
            if (skipConfirm || confirmed) {
                return this.issueCodeAndRedirect(res, session, client, query, validated);
            }
            const flowId = this.flowIdCookieService.mintIfAbsent(req, res);
            return this.redirectToAuthorizeUI(res, query, validated, 'session-confirm', flowId);

        } catch (error) {
            if (error instanceof AuthorizeRedirectException) {
                // Post-redirect OAuth error per RFC 6749 §4.1.2.1.
                // Funnel through `redirectWithError` so `flow_id` is cleared
                // on the same response that issues the 302 (Req 5.14, 12.6).
                return this.redirectWithError(
                    res,
                    error.redirectUri,
                    error.errorCode,
                    error.errorDescription,
                    error.state,
                );
            }
            // Pre-redirect error (unknown `client_id`, unregistered
            // `redirect_uri`, etc.). Per Req 5.6 the error is rendered on
            // the auth server without redirecting to External_Client, but
            // we still clear any `flow_id` cookie carried over from a
            // previous flow so it does not linger after the abandoned
            // request.
            this.flowIdCookieService.clear(res);
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
     *
     * Clears the `flow_id` cookie before the 302 so the completed flow's
     * CSRF context is terminated on External_Client redirect (Req 5.14,
     * 12.6). The redirect URL carries only `code` and `state` — no
     * internal signals (`view`, `csrf_token`, `session_confirmed`,
     * `from_logout`, `sid`, `flow_id`) appear in the query string
     * (Req 5.4, 5.13).
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
            validated.subscriberTenantHint,
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
        this.flowIdCookieService.clear(res);
        res.redirect(302, `${validated.redirectUri}?${params.toString()}`);
    }

    /**
     * Redirect to the unified `/authorize` UI route with the requested `view`.
     *
     * Builds the target URL as:
     *   `${BASE_URL}/authorize?view=<view>&csrf_token=<t>&<all OAuth params from query>`
     *
     * Every OAuth parameter present on the original authorize request is
     * forwarded unchanged (Req 5.15). The internal signaling params
     * `session_confirmed`, `from_logout`, `sid`, and `flow_id` are never
     * forwarded onto this UI redirect (Req 5.8, 5.13).
     *
     * The CSRF token is computed from the caller-supplied `flowId` via
     * `CsrfTokenService.computeFromFlowId`, which returns
     * `HMAC-SHA256(COOKIE_SECRET, flowId)`. Callers obtain `flowId` from
     * `FlowIdCookieService.mintIfAbsent(req, res)` immediately before
     * calling this helper, so the same token is emitted for every UI
     * redirect within one flow (Req 5.10, 5.11, 5.12).
     *
     * Requirements: 5.1, 5.2, 5.3, 5.7, 5.8, 5.9, 5.10, 5.11, 5.12, 5.15
     */
    private redirectToAuthorizeUI(
        res: Response,
        query: AuthorizeQueryParams,
        validated: import('../auth/authorize.service').ValidatedAuthorizeRequest,
        view: 'login' | 'consent' | 'session-confirm',
        flowId: string = '',
    ): void {
        const params = new URLSearchParams();

        // Non-OAuth signaling params come first for readability of the URL.
        params.set('view', view);
        params.set(
            'csrf_token',
            flowId ? this.csrfTokenService.computeFromFlowId(flowId) : '',
        );

        // OAuth parameters (Req 5.15). Prefer the validated/normalized values
        // where available — they have already been defaulted / coerced by
        // AuthorizeService.validateAuthorizeRequest — and fall back to the
        // raw query for fields the validator does not echo back.
        params.set('client_id', query.client_id!);
        params.set('redirect_uri', validated.redirectUri);
        params.set('response_type', validated.responseType);
        params.set('scope', validated.scope);
        params.set('state', validated.state);
        if (validated.codeChallenge) {
            params.set('code_challenge', validated.codeChallenge);
            params.set('code_challenge_method', validated.codeChallengeMethod);
        }
        if (validated.nonce) params.set('nonce', validated.nonce);
        if (validated.resource) params.set('resource', validated.resource);
        if (validated.prompt) {
            // Strip prompt=consent when redirecting to the consent view.
            // Once the consent screen is shown, prompt=consent has fulfilled
            // its purpose. Echoing it back would create an infinite loop:
            // grant → authorize (still has prompt=consent) → consent again.
            if (validated.prompt === 'consent' && view === 'consent') {
                // Don't include prompt — it's satisfied by showing the view.
            } else {
                params.set('prompt', validated.prompt);
            }
        }
        if (validated.maxAge !== undefined) params.set('max_age', String(validated.maxAge));
        if (query.id_token_hint) params.set('id_token_hint', query.id_token_hint);
        if (validated.subscriberTenantHint) {
            params.set('subscriber_tenant_hint', validated.subscriberTenantHint);
        }

        // Intentionally NOT forwarded (Req 5.8, 5.13):
        //   - session_confirmed / from_logout: one-shot internal flags, consumed by
        //     the backend on the redirect that carried them and never echoed onwards.
        //   - sid / flow_id: session/flow cookie values must never appear in URLs.

        res.redirect(302, `${Environment.get('BASE_URL', '')}/authorize?${params.toString()}`);
    }

    /**
     * Redirect to redirect_uri with an OAuth error (RFC 6749 §4.1.2.1).
     *
     * Clears the `flow_id` cookie before the 302 so the abandoned flow's
     * CSRF context is terminated on External_Client redirect (Req 5.14,
     * 12.6). The redirect URL carries only `error`, `error_description`,
     * and (when present) the original `state` — no internal signals
     * (`view`, `csrf_token`, `session_confirmed`, `from_logout`, `sid`,
     * `flow_id`) appear in the query string (Req 5.5, 5.13).
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
        this.flowIdCookieService.clear(res);
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
            csrf_token: string;
            subscriber_tenant_hint?: string;
        },
    ): Promise<{ success: true } | { requires_tenant_selection: true; tenants: TenantInfo[] }> {
        // Validate CSRF token against the signed `flow_id` cookie BEFORE any
        // credential validation, session creation, or tenant lookup. On 403
        // we do not touch the auth subsystem at all — no session is created
        // and no tenant lists are returned (Req 8.3, 12.1, 12.2, 12.3, 12.4).
        this.csrfTokenService.verifyOrThrow(
            req.signedCookies?.flow_id,
            body.csrf_token,
        );

        const user: User = await this.authService.validate(body.email, body.password);

        // Resolve Client entity by clientId or alias
        let client: Client;
        try {
            client = await this.clientService.findByClientIdOrAlias(body.client_id);
        } catch {
            throw OAuthException.invalidClient('Unknown client_id');
        }

        // Check if this is a first-party app (stored identity lookup)
        // Note: For tenant resolution, we only check if it's the default client.
        // Consent decisions are made in /authorize using isFirstParty() with redirect_uri.
        const isDefaultClient = this.firstPartyResolver.isDefaultClient(client);

        // For third-party apps without a hint, check for ambiguous tenants
        if (!isDefaultClient && !body.subscriber_tenant_hint) {
            const subscriberTenants = await this.tenantAmbiguityService.findSubscriberTenants(
                user.id,
                client.clientId,
            );

            if (subscriberTenants.length > 1) {
                // Multiple tenants — user must select one
                // Don't create session yet
                logger.log(`User ${user.email} has ${subscriberTenants.length} subscriber tenants for client ${body.client_id} — requiring selection`);
                return {
                    requires_tenant_selection: true,
                    tenants: subscriberTenants,
                };
            }
        }

        // If hint provided, validate it
        if (body.subscriber_tenant_hint) {
            const isValidHint = await this.tenantAmbiguityService.validateHint(
                user.id,
                client.clientId,
                body.subscriber_tenant_hint,
            );
            if (!isValidHint) {
                throw OAuthException.invalidRequest('Invalid subscriber_tenant_hint');
            }
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
        @Body()
        body: {
            client_id: string;
            scope?: string;
            csrf_token: string;
            decision: 'grant' | 'deny';
        },
    ): Promise<{success: true}> {
        // 1. Validate CSRF token against the signed `flow_id` cookie BEFORE any
        // consent record write. On 403 no session lookup or consent write occurs
        // (Req 6.3, 6.4, 12.1, 12.2, 12.3, 12.4).
        this.csrfTokenService.verifyOrThrow(
            req.signedCookies?.flow_id,
            body.csrf_token,
        );

        // 2. Validate session from signed cookie
        const sid = (req as any).signedCookies?.sid;
        if (!sid) {
            throw new UnauthorizedException('No session');
        }
        const session = await this.loginSessionService.findSessionBySid(sid);
        if (!session) {
            throw new UnauthorizedException('Session expired');
        }

        // 3. Validate client exists
        let client: Client;
        try {
            client = await this.clientService.findByClientIdOrAlias(body.client_id);
        } catch {
            throw new BadRequestException('Unknown client_id');
        }

        // 4. Record consent decision (grant or deny)
        // For deny, we don't record anything - frontend will redirect with error
        if (body.decision === 'grant') {
            const resolvedScopes = this.scopeResolverService.resolveScopes(
                body.scope || '', client.allowedScopes || 'openid profile email',
            );
            await this.consentService.grantConsent(session.userId, client.clientId, resolvedScopes);
        }

        // Return success — frontend handles the redirect to authorize or client
        return {success: true};
    }

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
