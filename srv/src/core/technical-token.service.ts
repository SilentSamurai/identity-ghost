import {Injectable} from "@nestjs/common";
import {Tenant} from "../entity/tenant.entity";
import {TechnicalToken} from "../casl/contexts";
import {RoleEnum} from "../entity/roleEnum";
import {JwtServiceRS256} from "../auth/jwt.service";

@Injectable()
export class TechnicalTokenService {
    constructor(
        private readonly jwtServiceRS256: JwtServiceRS256,
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
        return this.jwtServiceRS256.sign(payload.asPlainObject(), {
            privateKey: tenant.privateKey
        });
    }
}
