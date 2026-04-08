import {Inject, Injectable} from "@nestjs/common";
import {RS256_TOKEN_GENERATOR, SIGNING_KEY_PROVIDER, SigningKeyProvider, TokenService} from "../core/token-abstraction";
import {Environment} from "../config/environment.service";
import {User} from "../entity/user.entity";

export interface GenerateIdTokenParams {
    user: Pick<User, "id" | "email" | "name">;
    tenantId: string;
    clientId: string;
    grantedScopes: string[];
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

    async generateIdToken(params: GenerateIdTokenParams): Promise<string | undefined> {
        const {user, tenantId, clientId, grantedScopes} = params;

        // Return undefined if openid scope is not granted
        if (!grantedScopes.includes("openid")) {
            return undefined;
        }

        const claims: Record<string, any> = {
            sub: user.id,
            aud: clientId,
        };

        // Add email claim when scopes include email or openid
        // (email is a default OIDC claim when openid is present)
        if (grantedScopes.includes("email") || grantedScopes.includes("openid")) {
            claims.email = user.email;
        }

        // Add name claim when scopes include profile
        if (grantedScopes.includes("profile")) {
            claims.name = user.name;
        }

        const { privateKey, kid } = await this.signingKeyProvider.getSigningKeyWithKid(tenantId);
        const idToken = await this.tokenGenerator.sign(claims, {
            privateKey,
            keyid: kid,
            issuer: this.configService.get("SUPER_TENANT_DOMAIN"),
        });

        return idToken;
    }
}