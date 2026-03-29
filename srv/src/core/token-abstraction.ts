import {JwtSignOptions} from "@nestjs/jwt/dist/interfaces/jwt-module-options.interface";
import {JwtVerifyOptions} from "@nestjs/jwt/dist/interfaces";

export interface TokenService {
    sign(payload: any, options: JwtSignOptions): Promise<string>;
    verify(token: string, options: JwtVerifyOptions): Promise<any>;
    decode(token: string): any;
}

export const RS256_TOKEN_GENERATOR = Symbol("RS256_TOKEN_GENERATOR");
export const HS256_TOKEN_GENERATOR = Symbol("HS256_TOKEN_GENERATOR");
export const ES256_TOKEN_GENERATOR = Symbol("ES256_TOKEN_GENERATOR");
export const PS256_TOKEN_GENERATOR = Symbol("PS256_TOKEN_GENERATOR");

export interface SigningKeyProvider {
    generateKeyPair(): { privateKey: string; publicKey: string };
    getPrivateKey(tenantId: string): Promise<string>;
    getPublicKey(tenantId: string): Promise<string>;
}

export const SIGNING_KEY_PROVIDER = Symbol("SIGNING_KEY_PROVIDER");
