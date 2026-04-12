import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ClientService } from '../services/client.service';
import { ScopeResolverService } from '../casl/scope-resolver.service';
import { OAuthException } from '../exceptions/oauth-exception';
import { AuthorizeRedirectException } from '../exceptions/authorize-redirect.exception';
import { Client } from '../entity/client.entity';

export interface AuthorizeQueryParams {
    response_type?: string;
    client_id?: string;
    redirect_uri?: string;
    scope?: string;
    state?: string;
    code_challenge?: string;
    code_challenge_method?: string;
    nonce?: string;
}

export interface ValidatedAuthorizeRequest {
    clientId: string;
    redirectUri: string;
    scope: string;
    state: string;
    codeChallenge?: string;
    codeChallengeMethod: string;
    nonce?: string;
}

@Injectable()
export class AuthorizeService {
    private readonly logger = new Logger(AuthorizeService.name);

    constructor(
        private readonly clientService: ClientService,
        private readonly scopeResolver: ScopeResolverService,
    ) {}

    async validateAuthorizeRequest(params: AuthorizeQueryParams): Promise<ValidatedAuthorizeRequest> {
        this.logRequest(params);

        try {
            // 1. Validate response_type
            this.validateResponseType(params.response_type);

            // 2. Validate client_id and retrieve client
            const client = await this.validateClientId(params.client_id);

            // 3. Validate redirect_uri
            const redirectUri = this.validateRedirectUri(client, params.redirect_uri);

            // 4. Validate state (post-redirect from here)
            this.validateState(params.state, redirectUri);

            // 5. Validate PKCE
            const { codeChallenge, codeChallengeMethod } = this.validatePkce(
                client,
                params.code_challenge,
                params.code_challenge_method,
                redirectUri,
                params.state,
            );

            // 6. Validate nonce length
            this.validateNonce(params.nonce, redirectUri, params.state);

            // 7. Resolve scope
            const resolvedScopes = this.scopeResolver.resolveScopes(
                params.scope || null,
                client.allowedScopes,
            );
            const scope = resolvedScopes.join(' ');

            return {
                clientId: client.clientId,
                redirectUri,
                scope,
                state: params.state,
                codeChallenge,
                codeChallengeMethod,
                nonce: params.nonce,
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

    private validateResponseType(responseType?: string): void {
        if (!responseType || responseType !== 'code') {
            throw OAuthException.unsupportedResponseType(
                'The response_type parameter must be "code"',
            );
        }
    }

    private async validateClientId(clientId?: string): Promise<Client> {
        if (!clientId) {
            throw OAuthException.invalidRequest('The client_id parameter is required');
        }
        try {
            return await this.clientService.findByClientId(clientId);
        } catch (error) {
            if (error instanceof NotFoundException) {
                throw OAuthException.invalidRequest('Unknown client_id');
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
        let client: Client;
        try {
            client = await this.clientService.findByClientId(clientId);
        } catch (error) {
            if (error instanceof NotFoundException) {
                // Legacy tenant-based client — no Client entity, skip redirect URI validation
                return redirectUri || null;
            }
            throw error;
        }
        if (!redirectUri) {
            return null;
        }
        return this.validateRedirectUri(client, redirectUri);
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

    private logRequest(params: AuthorizeQueryParams): void {
        this.logger.log(
            `Authorize request: client_id=${params.client_id || 'missing'}, ` +
            `scope=${params.scope || 'default'}, ` +
            `pkce=${params.code_challenge ? 'present' : 'absent'}`,
        );
    }
}
