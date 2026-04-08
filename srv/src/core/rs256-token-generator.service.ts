import {Injectable} from "@nestjs/common";
import {JwtService} from "@nestjs/jwt";
import {Environment} from "../config/environment.service";
import {JwtSignOptions} from "@nestjs/jwt/dist/interfaces/jwt-module-options.interface";
import {JwtVerifyOptions} from "@nestjs/jwt/dist/interfaces";
import {TokenService} from "./token-abstraction";

@Injectable()
export class RS256TokenGenerator implements TokenService {
    private readonly jwtService: JwtService;

    constructor(private readonly configService: Environment) {
        this.jwtService = new JwtService({
            signOptions: {
                algorithm: "RS256",
                expiresIn: this.configService.get(
                    "TOKEN_EXPIRATION_TIME",
                ),
                issuer: this.configService.get("SUPER_TENANT_DOMAIN")
            },
        });
    }

    async sign(payload: any, options: JwtSignOptions): Promise<string> {
        return this.jwtService.signAsync(payload, options);
    }

    async verify(token: string, options: JwtVerifyOptions): Promise<any> {
        return this.jwtService.verifyAsync(token, options);
    }

    decode(token: string): any {
        return this.jwtService.decode(token, {json: true});
    }

    decodeComplete(token: string): { header: any; payload: any } {
        const decoded = this.jwtService.decode(token, { complete: true }) as { header: any; payload: any } | null;
        return decoded ?? { header: {}, payload: {} };
    }
}
