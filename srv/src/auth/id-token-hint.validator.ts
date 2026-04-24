import {Inject, Injectable, Logger} from "@nestjs/common";
import {RS256_TOKEN_GENERATOR, SIGNING_KEY_PROVIDER, SigningKeyProvider, TokenService} from "../core/token-abstraction";
import {OAuthException} from "../exceptions/oauth-exception";

/**
 * Result of validating an id_token_hint parameter.
 */
export interface IdTokenHintValidationResult {
    /** The decoded payload of the validated ID token */
    payload: Record<string, any>;
    /** The subject (user ID) from the ID token */
    sub: string;
}

/**
 * IdTokenHintValidator - Validates ID tokens received as id_token_hint parameters.
 *
 * This validator ensures that an ID token used as an id_token_hint parameter:
 * 1. Is a well-formed JWT
 * 2. Has an `aud` claim that is a JSON array (not a bare string)
 * 3. Contains the expected client_id in the `aud` array
 * 4. Has a valid signature (verified using the kid from the JWT header)
 *
 * Per OIDC Core §3.1.2.1, expired tokens are accepted as hints — the validator
 * checks structure and audience but does not enforce `exp`.
 *
 * This prevents cross-client token confusion attacks where an ID token issued
 * for client A is used as a hint at client B.
 */
@Injectable()
export class IdTokenHintValidator {
    private readonly logger = new Logger(IdTokenHintValidator.name);

    constructor(
        @Inject(RS256_TOKEN_GENERATOR)
        private readonly tokenGenerator: TokenService,
        @Inject(SIGNING_KEY_PROVIDER)
        private readonly signingKeyProvider: SigningKeyProvider,
    ) {
    }

    /**
     * Validate an id_token_hint parameter.
     *
     * Steps:
     * 1. Decode the JWT without verification to inspect claims
     * 2. Validate aud is a JSON array
     * 3. Validate expectedClientId is present in aud
     * 4. Verify the JWT signature using the kid from the header
     *
     * @param idTokenHint - The raw JWT string from the id_token_hint parameter
     * @param expectedClientId - The client_id that should be in the aud claim
     * @returns The decoded payload and subject if validation succeeds
     * @throws OAuthException with invalid_request if validation fails
     */
    async validate(
        idTokenHint: string,
        expectedClientId: string,
    ): Promise<IdTokenHintValidationResult> {
        // Step 1: Decode the JWT without verification to inspect header and claims
        let decoded: { header: any; payload: any };
        try {
            decoded = this.tokenGenerator.decodeComplete(idTokenHint);
        } catch (error) {
            this.logger.warn(`Failed to decode id_token_hint: ${error.message}`);
            throw OAuthException.invalidRequest('The id_token_hint parameter must be a valid JWT');
        }

        const {header, payload} = decoded;

        // Step 2: Validate aud is a JSON array
        if (!payload.aud) {
            this.logger.warn('id_token_hint missing aud claim');
            throw OAuthException.invalidRequest('The id_token_hint must contain an aud claim');
        }

        if (!Array.isArray(payload.aud)) {
            this.logger.warn(`id_token_hint aud is not an array: ${typeof payload.aud}`);
            throw OAuthException.invalidRequest('The id_token_hint aud claim must be a JSON array');
        }

        // Step 3: Validate expectedClientId is present in the aud array
        if (!payload.aud.includes(expectedClientId)) {
            this.logger.warn(
                `id_token_hint aud does not contain expected client_id: expected=${expectedClientId}, aud=${JSON.stringify(payload.aud)}`,
            );
            throw OAuthException.invalidRequest(
                'The id_token_hint was not issued for this client',
            );
        }

        // Step 4: Extract kid from header and verify signature
        const kid = header.kid;
        if (!kid) {
            this.logger.warn('id_token_hint missing kid in header');
            throw OAuthException.invalidRequest('The id_token_hint must contain a kid header');
        }

        let publicKey: string;
        try {
            publicKey = await this.signingKeyProvider.getPublicKeyByKid(kid, payload.tenant_id);
        } catch (error) {
            this.logger.warn(`id_token_hint kid not found: ${kid}`);
            throw OAuthException.invalidRequest('The id_token_hint signature key is unknown');
        }

        try {
            // Verify signature but do NOT enforce exp (per OIDC Core §3.1.2.1, the hint MAY be expired)
            await this.tokenGenerator.verify(idTokenHint, {
                publicKey,
                ignoreExpiration: true,
            });
        } catch (error) {
            this.logger.warn(`id_token_hint signature verification failed: ${error.message}`);
            throw OAuthException.invalidRequest('The id_token_hint signature is invalid');
        }

        // Extract sub claim
        if (!payload.sub) {
            this.logger.warn('id_token_hint missing sub claim');
            throw OAuthException.invalidRequest('The id_token_hint must contain a sub claim');
        }

        this.logger.log(`id_token_hint validated successfully: sub=${payload.sub}`);

        return {
            payload,
            sub: payload.sub,
        };
    }
}
