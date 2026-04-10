import {Inject, Injectable, Logger, NotFoundException} from '@nestjs/common';
import {AuthService} from './auth.service';
import {ClientService} from '../services/client.service';
import {OAuthException} from '../exceptions/oauth-exception';
import {ScopeNormalizer} from '../casl/scope-normalizer';
import {Token} from '../casl/contexts';
import {RS256_TOKEN_GENERATOR, TokenService} from '../core/token-abstraction';

/**
 * RFC 7662 introspection response shape.
 *
 * Active responses include all fields; inactive responses contain only
 * `{ active: false }` with no additional metadata (fail-secure by design).
 */
export interface IntrospectionResponse {
    active: boolean;
    /** Subject identifier — user UUID (TenantToken) or "oauth" (TechnicalToken). */
    sub?: string;
    /** Space-delimited OIDC scopes (never contains role enum values). */
    scope?: string;
    /** The client_id from the token's client_id claim. */
    client_id?: string;
    /** Audience — JSON array from the token's aud claim. */
    aud?: string[];
    /** Always "Bearer". */
    token_type?: string;
    /** Expiration time as an integer Unix timestamp (seconds since epoch). */
    exp?: number;
    /** Issued-at time as an integer Unix timestamp (seconds since epoch). */
    iat?: number;
}

/**
 * Owns the business logic for RFC 7662 Token Introspection.
 *
 * Responsibilities:
 *   1. Authenticate the requesting client via {@link ClientService} (constant-time
 *      secret comparison using scryptSync + timingSafeEqual).
 *   2. Validate the submitted access token via {@link AuthService.validateAccessToken}
 *      (JWT decode, signature verification, locked-user check).
 *   3. Enforce tenant isolation — the token's tenant must match the client's tenant.
 *   4. Build the RFC 7662 response, mapping scopes through {@link ScopeNormalizer}
 *      to ensure only OIDC values are exposed (never internal role enums).
 *
 * Fail-secure: any error during token validation (expired, malformed, bad
 * signature, locked user, internal error) returns `{ active: false }`. The
 * specific failure reason is logged internally but never exposed to the caller.
 *
 * Client authentication errors (invalid_client) are re-thrown as
 * {@link OAuthException} so the global exception filter can produce the
 * correct 401 response.
 */
@Injectable()
export class TokenIntrospectionService {
    private readonly logger = new Logger(TokenIntrospectionService.name);

    constructor(
        private readonly clientService: ClientService,
        private readonly authService: AuthService,
        @Inject(RS256_TOKEN_GENERATOR)
        private readonly tokenGenerator: TokenService,
    ) {}

    /**
     * Introspect an access token on behalf of an authenticated client.
     *
     * @param clientId     - The requesting client's identifier (from Client entity, not legacy Tenant.clientId).
     * @param clientSecret - The requesting client's plain-text secret.
     * @param token        - The access token string to introspect.
     * @param tokenTypeHint - Optional hint ("access_token"); accepted but does not change behaviour.
     * @returns An {@link IntrospectionResponse} — either active with full metadata or `{ active: false }`.
     * @throws OAuthException with `invalid_client` when client authentication fails.
     */
    async introspect(
        clientId: string,
        clientSecret: string,
        token: string,
        tokenTypeHint?: string,
    ): Promise<IntrospectionResponse> {
        try {
            // ── Step 1: Authenticate the requesting client ──────────────
            let client;
            try {
                client = await this.clientService.findByClientId(clientId);
            } catch (e) {
                if (e instanceof NotFoundException) {
                    throw OAuthException.invalidClient('Client authentication failed');
                }
                throw e;
            }

            if (!this.clientService.validateClientSecret(client, clientSecret)) {
                throw OAuthException.invalidClient('Client authentication failed');
            }

            // ── Step 2: Validate the access token ───────────────────────
            // Any failure (expired, malformed, bad signature, locked user)
            // is caught and mapped to { active: false }.
            let validatedToken: Token;
            try {
                validatedToken = await this.authService.validateAccessToken(token);
            } catch {
                return {active: false};
            }

            // ── Step 3: Tenant isolation ────────────────────────────────
            // A token issued by tenant A must not be introspectable by a
            // client belonging to tenant B.
            const tokenTenantId = validatedToken.isTenantToken()
                ? validatedToken.asTenantToken().tenant.id
                : validatedToken.asTechnicalToken().tenant.id;

            if (tokenTenantId !== client.tenantId) {
                this.logger.warn(`Tenant mismatch: token tenant ${tokenTenantId} != client tenant ${client.tenantId}`);
                return {active: false};
            }

            // ── Step 4: Build active response ───────────────────────────
            return this.buildActiveResponse(validatedToken, clientId, token);
        } catch (e) {
            // Re-throw OAuthExceptions (client auth errors) so the
            // HttpExceptionFilter produces the correct 401 response.
            if (e instanceof OAuthException) {
                throw e;
            }
            // Any other error is swallowed — log internally, return inactive.
            this.logger.error('Unexpected error during introspection', e.stack);
            return {active: false};
        }
    }

    /**
     * Map a validated token to the RFC 7662 active response format.
     *
     * - `sub` is the token's `sub` claim (UUID for TenantTokens, "oauth" for TechnicalTokens).
     * - `aud` is the token's `aud` claim as a JSON array.
     * - `client_id` is the token's `client_id` claim (not the requesting client's ID).
     * - `scope` is derived via {@link ScopeNormalizer.format} which produces a
     *   space-delimited string of OIDC values only (openid, profile, email).
     *   Internal role enums (SUPER_ADMIN, TENANT_ADMIN, TENANT_VIEWER) are
     *   never included.
     * - `exp` and `iat` are read from the raw JWT payload as integer Unix
     *   timestamps (seconds since epoch).
     */
    private buildActiveResponse(token: Token, clientId: string, rawToken: string): IntrospectionResponse {
        const decoded = this.tokenGenerator.decode(rawToken);
        return {
            active: true,
            sub: token.sub,
            scope: ScopeNormalizer.format(token.scopes),
            client_id: token.client_id,
            aud: token.aud,
            token_type: 'Bearer',
            exp: decoded.exp,
            iat: decoded.iat,
        };
    }
}
