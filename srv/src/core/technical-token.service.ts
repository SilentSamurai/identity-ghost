import {Inject, Injectable} from "@nestjs/common";
import {Tenant} from "../entity/tenant.entity";
import {TechnicalToken} from "../casl/contexts";
import {ScopeNormalizer} from "../casl/scope-normalizer";
import {RS256_TOKEN_GENERATOR, TokenService} from "./token-abstraction";

const DEFAULT_TECHNICAL_SCOPES = ['openid', 'profile', 'email', 'tenant.read'];

@Injectable()
export class TechnicalTokenService {
    constructor(
        @Inject(RS256_TOKEN_GENERATOR)
        private readonly tokenGenerator: TokenService,
    ) {
    }

    createTechnicalToken(tenant: Tenant, roles: string[]): TechnicalToken {
        roles = roles instanceof Array ? roles : [];
        const merged = ScopeNormalizer.parse(
            ScopeNormalizer.format([...DEFAULT_TECHNICAL_SCOPES, ...roles])
        );
        return TechnicalToken.create({
            sub: "oauth",
            tenant: {
                id: tenant.id,
                name: tenant.name,
                domain: tenant.domain,
            },
            scopes: merged
        });
    }

    async createTechnicalAccessToken(
        tenant: Tenant,
        roles: string[],
    ): Promise<string> {
        roles = roles instanceof Array ? roles : [];
        const payload = this.createTechnicalToken(tenant, roles);
        return this.tokenGenerator.sign(payload.asPlainObject(), {
            privateKey: tenant.privateKey
        });
    }
}
