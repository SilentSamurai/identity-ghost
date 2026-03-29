import {Inject, Injectable} from "@nestjs/common";
import {Tenant} from "../entity/tenant.entity";
import {TechnicalToken} from "../casl/contexts";
import {RoleEnum} from "../entity/roleEnum";
import {RS256_TOKEN_GENERATOR, TokenService} from "./token-abstraction";

@Injectable()
export class TechnicalTokenService {
    constructor(
        @Inject(RS256_TOKEN_GENERATOR)
        private readonly tokenGenerator: TokenService,
    ) {
    }

    createTechnicalToken(tenant: Tenant, roles: string[]): TechnicalToken {
        roles = roles instanceof Array ? roles : [];
        return TechnicalToken.create({
            sub: "oauth",
            tenant: {
                id: tenant.id,
                name: tenant.name,
                domain: tenant.domain,
            },
            scopes: [RoleEnum.TENANT_VIEWER, ...roles]
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
