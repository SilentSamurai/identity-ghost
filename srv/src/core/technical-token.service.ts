import {Inject, Injectable} from "@nestjs/common";
import {randomUUID} from "crypto";
import {Tenant} from "../entity/tenant.entity";
import {TechnicalToken} from "../casl/contexts";
import {ScopeNormalizer} from "../casl/scope-normalizer";
import {Environment} from "../config/environment.service";
import {RS256_TOKEN_GENERATOR, SIGNING_KEY_PROVIDER, SigningKeyProvider, TokenService} from "./token-abstraction";

const DEFAULT_TECHNICAL_SCOPES = ['openid', 'profile', 'email'];

@Injectable()
export class TechnicalTokenService {
    constructor(
        @Inject(RS256_TOKEN_GENERATOR)
        private readonly tokenGenerator: TokenService,
        @Inject(SIGNING_KEY_PROVIDER)
        private readonly signingKeyProvider: SigningKeyProvider,
        private readonly configService: Environment,
    ) {
    }

    createTechnicalToken(tenant: Tenant, additionalScopes: string[]): TechnicalToken {
        additionalScopes = additionalScopes instanceof Array ? additionalScopes : [];
        const scopeString = ScopeNormalizer.format([...DEFAULT_TECHNICAL_SCOPES, ...additionalScopes]);
        return TechnicalToken.create({
            sub: "oauth",
            tenant: {
                id: tenant.id,
                name: tenant.name,
                domain: tenant.domain,
            },
            scope: scopeString,
            aud: [this.configService.get("SUPER_TENANT_DOMAIN")],
            jti: randomUUID(),
            nbf: Math.floor(Date.now() / 1000),
            client_id: tenant.clientId,
            tenant_id: tenant.id,
        });
    }

    async createTechnicalAccessToken(
        tenant: Tenant,
        additionalScopes: string[],
    ): Promise<string> {
        additionalScopes = additionalScopes instanceof Array ? additionalScopes : [];
        const payload = this.createTechnicalToken(tenant, additionalScopes);
        const { privateKey, kid } = await this.signingKeyProvider.getSigningKeyWithKid(tenant.id);
        return this.tokenGenerator.sign(payload.asPlainObject(), {
            privateKey,
            keyid: kid,
            issuer: this.configService.get("SUPER_TENANT_DOMAIN"),
        });
    }
}
