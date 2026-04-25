import {Inject, Injectable} from "@nestjs/common";
import {randomUUID} from "crypto";
import {TechnicalToken} from "../casl/contexts";
import {ScopeNormalizer} from "../casl/scope-normalizer";
import {Environment} from "../config/environment.service";
import {RS256_TOKEN_GENERATOR, SIGNING_KEY_PROVIDER, SigningKeyProvider, TokenService} from "./token-abstraction";
import {Client} from "../entity/client.entity";

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

    /**
     * Create a technical token for client_credentials grant.
     * Accepts either a Client entity (preferred) or Tenant (legacy compatibility).
     * Requirements: 3.5
     */
    createTechnicalToken(client: Client, additionalScopes: string[], audience?: string[]): TechnicalToken {
        additionalScopes = additionalScopes instanceof Array ? additionalScopes : [];
        const scopeString = ScopeNormalizer.format([...DEFAULT_TECHNICAL_SCOPES, ...additionalScopes]);
        
        const tenant = client.tenant;
        
        return TechnicalToken.create({
            sub: "oauth",
            tenant: {
                id: tenant.id,
                name: tenant.name,
                domain: tenant.domain,
            },
            scope: scopeString,
            aud: audience || [this.configService.get("SUPER_TENANT_DOMAIN")],
            jti: randomUUID(),
            nbf: Math.floor(Date.now() / 1000),
            client_id: client.clientId,
            tenant_id: tenant.id,
        });
    }

    /**
     * Create a technical access token for client_credentials grant.
     * Accepts either a Client entity (preferred) or Tenant (legacy compatibility).
     * Requirements: 3.5
     */
    async createTechnicalAccessToken(
        client: Client,
        additionalScopes: string[],
        audience?: string[],
    ): Promise<string> {
        additionalScopes = additionalScopes instanceof Array ? additionalScopes : [];
        const payload = this.createTechnicalToken(client, additionalScopes, audience);
        
        const tenantId = client.tenantId;
        
        const {privateKey, kid} = await this.signingKeyProvider.getSigningKeyWithKid(tenantId);
        return this.tokenGenerator.sign(payload.asPlainObject(), {
            privateKey,
            keyid: kid,
            issuer: this.configService.get("SUPER_TENANT_DOMAIN"),
        });
    }

}
