import {Body, Controller, Header, HttpCode, Logger, Post, Req} from '@nestjs/common';
import {Request} from 'express';
import {TokenIntrospectionService, IntrospectionResponse} from '../auth/token-introspection.service';
import {OAuthException} from '../exceptions/oauth-exception';
import {parseBasicAuthHeader} from '../util/http.util';

const logger = new Logger('IntrospectionController');

/**
 * RFC 7662 Token Introspection endpoint.
 *
 * Allows resource servers to query the authorization server about the state
 * of an access token and retrieve its associated metadata (subject, scope,
 * client, expiry) without decoding the JWT themselves.
 *
 * Client authentication is required for every request — either via HTTP Basic
 * (Base64-encoded `client_id:client_secret` in the Authorization header) or
 * via `client_id` / `client_secret` in the request body. When both are
 * present, the Basic header takes precedence.
 *
 * All responses carry `Cache-Control: no-store` and `Pragma: no-cache` per
 * RFC 7662 §2.1 to prevent caching of token metadata.
 */
@Controller('api/oauth')
export class IntrospectionController {
    constructor(private readonly introspectionService: TokenIntrospectionService) {}

    /**
     * POST /api/oauth/introspect
     *
     * Accepts an `application/x-www-form-urlencoded` or JSON body with:
     *   - `token`           (required) — the access token string to introspect
     *   - `token_type_hint` (optional) — hint about the token type; currently accepted but ignored
     *   - `client_id`       (conditional) — required if not using Basic auth
     *   - `client_secret`   (conditional) — required if not using Basic auth
     *
     * Returns:
     *   - 200 with `{ active: true, sub, scope, client_id, token_type, exp, iat }` for valid tokens
     *   - 200 with `{ active: false }` for invalid, expired, or unrecognised tokens
     *   - 400 with `{ error: "invalid_request" }` when the `token` parameter is missing
     *   - 401 with `{ error: "invalid_client" }` when client authentication fails
     */
    @Post('introspect')
    @HttpCode(200)
    @Header('Cache-Control', 'no-store')
    @Header('Pragma', 'no-cache')
    async introspect(
        @Req() req: Request,
        @Body() body: { token?: string; token_type_hint?: string; client_id?: string; client_secret?: string },
    ): Promise<IntrospectionResponse> {
        let clientId = body.client_id;
        let clientSecret = body.client_secret;

        // Basic auth takes precedence over body credentials (RFC 7662 §2.1).
        // Decode the Base64 `client_id:client_secret` pair from the Authorization header.
        const basicCredentials = parseBasicAuthHeader(req.headers.authorization);
        if (basicCredentials) {
            clientId = basicCredentials.username;
            clientSecret = basicCredentials.password;
        }

        // The `token` parameter is mandatory per RFC 7662 §2.1.
        if (!body.token || body.token.trim() === '') {
            throw OAuthException.invalidRequest('The "token" parameter is required');
        }

        // Client authentication is required — reject early if credentials are absent
        // to avoid passing undefined into scryptSync downstream.
        if (!clientId || !clientSecret) {
            throw OAuthException.invalidClient('Client authentication is required');
        }

        return this.introspectionService.introspect(clientId, clientSecret, body.token, body.token_type_hint);
    }
}
