import {Inject, Injectable} from "@nestjs/common";
import {RS256_TOKEN_GENERATOR, SIGNING_KEY_PROVIDER, SigningKeyProvider, TokenService} from "../core/token-abstraction";
import {Environment} from "../config/environment.service";
import {User} from "../entity/user.entity";
import {createHash, randomUUID} from "crypto";

export interface GenerateIdTokenParams {
    user: Pick<User, "id" | "email" | "name" | "verified">;
    tenantId: string;
    clientId: string;
    grantedScopes: string[];
    accessToken: string;
    nonce?: string;
    authTime?: number;
    sessionId?: string;
    amr?: string[];
    acr?: string;
}

@Injectable()
export class IdTokenService {
    constructor(
        @Inject(RS256_TOKEN_GENERATOR)
        private readonly tokenGenerator: TokenService,
        @Inject(SIGNING_KEY_PROVIDER)
        private readonly signingKeyProvider: SigningKeyProvider,
        private readonly configService: Environment,
    ) {}

    static computeAtHash(accessToken: string): string {
        const hash = createHash('sha256').update(accessToken, 'ascii').digest();
        const leftHalf = hash.subarray(0, hash.length / 2);
        return leftHalf.toString('base64url');
    }

    async generateIdToken(params: GenerateIdTokenParams): Promise<string | undefined> {
        const {user, tenantId, clientId, grantedScopes} = params;

        // Return undefined if openid scope is not granted
        if (!grantedScopes.includes("openid")) {
            return undefined;
        }

        const expirationSeconds = parseInt(
            this.configService.get("ID_TOKEN_EXPIRATION_TIME_IN_SECONDS", "3600"),
            10,
        ) || 3600;

        const iat = Math.floor(Date.now() / 1000);

        const claims: Record<string, any> = {
            sub: user.id,
            aud: [clientId],
            azp: clientId,
            iat,
            auth_time: params.authTime ?? Math.floor(Date.now() / 1000),
            sid: params.sessionId ?? randomUUID(),
            amr: params.amr ?? ["pwd"],
        };

        // Conditionally add acr only when provided
        if (params.acr !== undefined) {
            claims.acr = params.acr;
        }

        // Conditionally add nonce only when provided
        if (params.nonce !== undefined) {
            claims.nonce = params.nonce;
        }

        // Compute at_hash from the access token
        claims.at_hash = IdTokenService.computeAtHash(params.accessToken);

        // Add name claim when profile scope is granted
        if (grantedScopes.includes("profile")) {
            claims.name = user.name;
        }

        // Add email and email_verified when email scope is granted
        if (grantedScopes.includes("email")) {
            claims.email = user.email;
            claims.email_verified = user.verified;
        }

        const { privateKey, kid } = await this.signingKeyProvider.getSigningKeyWithKid(tenantId);
        const idToken = await this.tokenGenerator.sign(claims, {
            privateKey,
            keyid: kid,
            issuer: this.configService.get("SUPER_TENANT_DOMAIN"),
            expiresIn: expirationSeconds,
        });

        return idToken;
    }
}