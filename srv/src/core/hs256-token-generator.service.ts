import {Injectable} from "@nestjs/common";
import {JwtService} from "@nestjs/jwt";
import {Environment} from "../config/environment.service";
import {JwtSignOptions} from "@nestjs/jwt/dist/interfaces/jwt-module-options.interface";
import {JwtVerifyOptions} from "@nestjs/jwt/dist/interfaces";
import {TokenService} from "./token-abstraction";

@Injectable()
export class HS256TokenGenerator implements TokenService {
    private readonly jwtService: JwtService;

    constructor(private readonly configService: Environment) {
        this.jwtService = new JwtService({
            signOptions: {
                algorithm: "HS256",
                expiresIn: "1h"
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
}
