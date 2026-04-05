import {Inject, Injectable} from "@nestjs/common";
import {RS256_TOKEN_GENERATOR, TokenService} from "../core/token-abstraction";
import {Environment} from "../config/environment.service";
import {User} from "../entity/user.entity";
import {Tenant} from "../entity/tenant.entity";

export interface GenerateIdTokenParams {
    user: Pick<User, "id" | "email" | "name">;
    tenant: Pick<Tenant, "privateKey">;
    clientId: string;
    grantedScopes: string[];
}

@Injectable()
export class IdTokenService {
    constructor(
        @Inject(RS256_TOKEN_GENERATOR)
        private readonly tokenGenerator: TokenService,
        private readonly configService: Environment,
    ) {}

    async generateIdToken(params: GenerateIdTokenParams): Promise<string | undefined> {
        const {user, tenant, clientId, grantedScopes} = params;

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

        // Let the RS256TokenGenerator handle exp/iat/iss via its default signOptions,
        // consistent with how access tokens are signed elsewhere in the codebase.
        const idToken = await this.tokenGenerator.sign(claims, {
            privateKey: tenant.privateKey,
            issuer: this.configService.get("SUPER_TENANT_DOMAIN"),
        });

        return idToken;
    }
}