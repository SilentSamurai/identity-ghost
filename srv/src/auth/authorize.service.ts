import {Injectable, Logger, NotFoundException} from '@nestjs/common';
import {ClientService} from '../services/client.service';
import {ScopeResolverService} from '../casl/scope-resolver.service';
import {OAuthException} from '../exceptions/oauth-exception';
import {AuthorizeRedirectException} from '../exceptions/authorize-redirect.exception';
import {Client} from '../entity/client.entity';
import {ValidationSchema} from '../validation/validation.schema';
import {ResourceIndicatorValidator} from './resource-indicator.validator';
import {IdTokenHintValidator} from './id-token-hint.validator';

export interface AuthorizeQueryParams {
    response_type?: string;
    client_id?: string;
    redirect_uri?: string;
    scope?: string;
    state?: string;
    code_challenge?: string;
    code_challenge_method?: string;
    nonce?: string;
    prompt?: string;
    max_age?: number;
    resource?: string;
    id_token_hint?: string;
}

export interface ValidatedAuthorizeRequest {
    clientId: string;
    redirectUri: string;
    scope: string;
    state: string;
    codeChallenge?: string;
    codeChallengeMethod: string;
    nonce?: string;
    prompt?: string;
    maxAge?: number;
    resource?: string;
    idTokenHintSub?: string;
}

@Injectable()
export class AuthorizeService {
    private readonly logger = new Logger(AuthorizeService.name);

    constructor(
        private readonly clientService: ClientService,
        private readonly scopeResolver: ScopeResolverService,
        private readonly idTokenHintValidator: IdTokenHintValidator,
    ) {
    }

    async validateAuthorizeRequest(params: AuthorizeQueryParams): Promise<ValidatedAuthorizeRequest> {
        this.logRequest(params);

        try {
            // Phase 1: Schema validation
            await this.validateSchema(params);

            // Phase 2: Business validation
            // 1. Validate client_id and retrieve client
            const client = await this.validateClientId(params.client_id);

            // 2. Validate redirect_uri
            const redirectUri = this.validateRedirectUri(client, params.redirect_uri);

            // 3. Validate prompt none exclusivity (post-redirect error — redirect_uri is now confirmed safe)
            this.validatePromptNoneExclusivity(params.prompt, redirectUri, params.state);

            // 4. Validate state (post-redirect from here)
            this.validateState(params.state, redirectUri);

            // 5. Validate PKCE
            const {codeChallenge, codeChallengeMethod} = this.validatePkce(
                client,
                params.code_challenge,
                params.code_challenge_method,
                redirectUri,
                params.state,
            );

            // 6. Validate nonce length
            this.validateNonce(params.nonce, redirectUri, params.state);

            // 7. Validate resource indicator (post-redirect error)
            this.validateResourceIndicator(params.resource, client, redirectUri, params.state);

            // 8. Resolve scope
            // OIDC Core §11: The offline_access scope is only honored when the response_type
            // results in an authorization code being returned. Since this server only supports
            // response_type=code, this condition is always satisfied — any offline_access scope
            // that passes scope resolution will result in an authorization code that can be
            // exchanged for a refresh token. No additional response_type check is needed here.
            const resolvedScopes = this.scopeResolver.resolveScopes(
                params.scope || null,
                client.allowedScopes,
            );
            const scope = resolvedScopes.join(' ');

            // 9. Validate id_token_hint (post-redirect error)
            let idTokenHintSub: string | undefined;
            if (params.id_token_hint) {
                idTokenHintSub = await this.validateIdTokenHint(
                    params.id_token_hint,
                    client.clientId,
                    redirectUri,
                    params.state,
                );
            }

            return {
                clientId: client.clientId,
                redirectUri,
                scope,
                state: params.state,
                codeChallenge,
                codeChallengeMethod,
                nonce: params.nonce,
                prompt: params.prompt,
                maxAge: params.max_age,
                resource: params.resource,
                idTokenHintSub,
            };
        } catch (error) {
            if (error instanceof OAuthException || error instanceof AuthorizeRedirectException) {
                const errorCode = error instanceof OAuthException
                    ? error.errorCode
                    : (error as AuthorizeRedirectException).errorCode;
                this.logger.warn(`Authorization request failed: error_code=${errorCode}`);
            }
            throw error;
        }
    }

    public validateRedirectUri(client: Client, redirectUri?: string): string {
        const registeredUris: string[] = client.redirectUris || [];

        if (!redirectUri) {
            if (registeredUris.length === 1) {
                return registeredUris[0];
            }
            throw OAuthException.invalidRequest(
                registeredUris.length === 0
                    ? 'The client has no registered redirect URIs'
                    : 'The redirect_uri parameter is required when the client has multiple registered redirect URIs',
            );
        }

        if (!registeredUris.includes(redirectUri)) {
            throw OAuthException.invalidRequest(
                'The redirect_uri does not match any registered redirect URI',
            );
        }

        return redirectUri;
    }

    async validateRedirectUriForClient(clientId: string, redirectUri?: string): Promise<string | null> {
        const client = await this.clientService.findByClientIdOrAlias(clientId);

        const registeredUris: string[] = client.redirectUris || [];
        if (registeredUris.length === 0) {
            // Client has no registered redirect URIs — skip validation.
            // The redirect_uri binding check at token exchange still applies.
            return redirectUri || null;
        }
        if (!redirectUri) {
            return null;
        }
        return this.validateRedirectUri(client, redirectUri);
    }

    private async validateSchema(params: AuthorizeQueryParams): Promise<void> {
        try {
            await ValidationSchema.AuthorizeSchema.validate(params, {abortEarly: true});
        } catch (error) {
            // Log with client_id but never sensitive param values
            this.logger.warn(
                `Schema validation failed: client_id=${params.client_id || 'missing'}, ` +
                `error=${error.message}`,
            );

            // RFC 6749 §4.1.2.1: both missing and unsupported response_type
            // use the unsupported_response_type error code
            if (error.path === 'response_type') {
                throw OAuthException.unsupportedResponseType(
                    'The response_type parameter must be "code"',
                );
            }

            throw OAuthException.invalidRequest(error.message);
        }
    }

    private async validateClientId(clientId?: string): Promise<Client> {
        if (!clientId) {
            throw OAuthException.invalidRequest('The client_id parameter is required');
        }
        try {
            return await this.clientService.findByClientIdOrAlias(clientId);
        } catch (error) {
            if (error instanceof NotFoundException) {
                throw OAuthException.invalidRequest('Unknown client_id');
            }
            throw error;
        }
    }

    private validateState(state: string | undefined, redirectUri: string): void {
        if (!state) {
            throw new AuthorizeRedirectException(
                redirectUri,
                'invalid_request',
                'The state parameter is required for CSRF protection',
            );
        }
    }

    private validatePkce(
        client: Client,
        codeChallenge?: string,
        codeChallengeMethod?: string,
        redirectUri?: string,
        state?: string,
    ): { codeChallenge?: string; codeChallengeMethod: string } {
        // Default method to plain when challenge is present but method is omitted
        const effectiveMethod = codeChallenge && !codeChallengeMethod ? 'plain' : (codeChallengeMethod || 'plain');

        if (client.requirePkce && !codeChallenge) {
            throw new AuthorizeRedirectException(
                redirectUri,
                'invalid_request',
                'The code_challenge parameter is required for this client',
                state,
            );
        }

        if (client.requirePkce && effectiveMethod === 'plain') {
            throw new AuthorizeRedirectException(
                redirectUri,
                'invalid_request',
                'The code_challenge_method "plain" is not allowed; use "S256"',
                state,
            );
        }

        if (client.pkceMethodUsed === 'S256' && effectiveMethod === 'plain') {
            throw new AuthorizeRedirectException(
                redirectUri,
                'invalid_request',
                'PKCE downgrade from S256 to plain is not allowed',
                state,
            );
        }

        return {
            codeChallenge,
            codeChallengeMethod: codeChallenge ? effectiveMethod : 'plain',
        };
    }

    private validateNonce(nonce: string | undefined, redirectUri: string, state?: string): void {
        if (nonce && nonce.length > 512) {
            throw new AuthorizeRedirectException(
                redirectUri,
                'invalid_request',
                'The nonce parameter must not exceed 512 characters',
                state,
            );
        }
    }

    private validatePromptNoneExclusivity(prompt: string | undefined, redirectUri: string, state?: string): void {
        if (!prompt) {
            return;
        }
        const rawValues = prompt.split(' ').filter(v => v.length > 0);
        if (rawValues.includes('none') && rawValues.length > 1) {
            throw new AuthorizeRedirectException(
                redirectUri,
                'invalid_request',
                'prompt=none must not be combined with other values',
                state,
            );
        }
    }

    private validateResourceIndicator(
        resource: string | undefined,
        client: Client,
        redirectUri: string,
        state?: string,
    ): void {
        if (!resource) {
            return;
        }

        try {
            ResourceIndicatorValidator.validateResource(resource, client.allowedResources);
        } catch (error) {
            if (error instanceof OAuthException) {
                throw new AuthorizeRedirectException(
                    redirectUri,
                    error.errorCode,
                    error.errorDescription,
                    state,
                );
            }
            throw error;
        }
    }

    private async validateIdTokenHint(
        idTokenHint: string,
        expectedClientId: string,
        redirectUri: string,
        state?: string,
    ): Promise<string | undefined> {
        try {
            const result = await this.idTokenHintValidator.validate(idTokenHint, expectedClientId);
            return result.sub;
        } catch (error) {
            if (error instanceof OAuthException) {
                throw new AuthorizeRedirectException(
                    redirectUri,
                    error.errorCode,
                    error.errorDescription,
                    state,
                );
            }
            throw error;
        }
    }

    private logRequest(params: AuthorizeQueryParams): void {
        this.logger.log(
            `Authorize request: client_id=${params.client_id || 'missing'}, ` +
            `scope=${params.scope || 'default'}, ` +
            `pkce=${params.code_challenge ? 'present' : 'absent'}`,
        );
    }
}
