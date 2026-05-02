import {AnyAbility} from "@casl/ability/dist/types/PureAbility";

export enum GRANT_TYPES {
    PASSWORD = "password",
    CLIENT_CREDENTIALS = "client_credentials",
    REFRESH_TOKEN = "refresh_token",
    CODE = "authorization_code",
}

export class ChangeEmailToken {
    sub: string;
    updatedEmail: string;
}

export class ResetPasswordToken {
    sub: string;
}

export class EmailVerificationToken {
    sub: string;
}

export class RefreshToken {
    email: string;
    domain: string;
}

export interface Token {
    get sub(): string;

    get scopes(): string[];

    get grant_type(): GRANT_TYPES;

    get client_id(): string;

    get tenant_id(): string;

    get aud(): string[];

    get jti(): string;

    isTenantToken(): boolean;

    isTechnicalToken(): boolean;

    isInternalToken(): boolean;

    asTenantToken(): TenantToken;

    asTechnicalToken(): TechnicalToken;
}

export interface TenantInfo {
    id: string;
    name: string;
    domain: string;
}

export interface TenantTokenParams {
    sub: string;
    tenant: TenantInfo;
    roles: string[];
    grant_type: GRANT_TYPES;
    aud: string[];
    jti: string;
    nbf: number;
    scope: string;
    client_id: string;
    tenant_id: string;
}

export interface TechnicalTokenParams {
    sub: string;
    tenant: {
        id: string;
        name: string;
        domain: string;
    };
    scope: string;
    aud: string[];
    jti: string;
    nbf: number;
    client_id: string;
    tenant_id: string;
}

export class InternalToken implements Token {
    sub: string;
    scopes: string[] = [];
    grant_type: GRANT_TYPES = GRANT_TYPES.CLIENT_CREDENTIALS;
    client_id: string = '';
    tenant_id: string = '';
    aud: string[] = [];
    jti: string = '';
    purpose: string;
    scopedTenantId?: string;

    static create(params: { purpose: string; scopedTenantId?: string }): InternalToken {
        const token = new InternalToken();
        token.purpose = params.purpose;
        token.scopedTenantId = params.scopedTenantId;
        token.sub = `internal:${params.purpose}`;
        return token;
    }

    isTenantToken(): boolean {
        return false;
    }

    isTechnicalToken(): boolean {
        return false;
    }

    isInternalToken(): boolean {
        return true;
    }

    asTenantToken(): TenantToken {
        throw new Error("Internal token cannot be cast to TenantToken");
    }

    asTechnicalToken(): TechnicalToken {
        throw new Error("Internal token cannot be cast to TechnicalToken");
    }
}

export class TenantToken implements Token {
    sub: string; // user id 
    scopes: string[];
    roles: string[];
    grant_type: GRANT_TYPES;
    tenant: TenantInfo;
    aud: string[];
    jti: string;
    nbf: number;
    scope: string;
    client_id: string;
    tenant_id: string;

    // Optional fields — populated during validation from DB, not from JWT
    email?: string;
    name?: string;
    userId?: string;
    userTenant?: TenantInfo;

    static create(params: TenantTokenParams & { userTenant?: TenantInfo }): TenantToken {
        const token = new TenantToken();
        token.sub = params.sub;
        token.tenant = params.tenant;
        token.roles = params.roles;
        token.grant_type = params.grant_type;
        token.aud = params.aud;
        token.jti = params.jti;
        token.nbf = params.nbf;
        token.scope = params.scope;
        token.client_id = params.client_id;
        token.tenant_id = params.tenant_id;
        // Derive internal scopes array from space-delimited scope string
        token.scopes = params.scope ? params.scope.split(' ').filter(s => s.length > 0) : [];
        if (params.userTenant) {
            token.userTenant = params.userTenant;
        }
        return token;
    }

    isTechnicalToken(): boolean {
        return false;
    }

    isTenantToken(): boolean {
        return true;
    }

    isInternalToken(): boolean {
        return false;
    }

    asPlainObject(): Record<string, any> {
        const obj: Record<string, any> = {
            sub: this.sub,
            aud: this.aud,
            jti: this.jti,
            nbf: this.nbf,
            scope: this.scope,
            client_id: this.client_id,
            tenant_id: this.tenant_id,
            tenant: this.tenant,
            roles: this.roles,
            grant_type: this.grant_type,
        };
        if (this.userTenant) {
            obj.userTenant = this.userTenant;
        }
        return obj;
    }

    asTechnicalToken(): TechnicalToken {
        throw new Error("Invalid Token");
    }

    asTenantToken(): TenantToken {
        return this;
    }
}

export class TechnicalToken implements Token {
    sub: string;
    scopes: string[];
    tenant: {
        id: string;
        name: string;
        domain: string;
    };
    grant_type: GRANT_TYPES = GRANT_TYPES.CLIENT_CREDENTIALS;
    aud: string[];
    jti: string;
    nbf: number;
    scope: string;
    client_id: string;
    tenant_id: string;

    static create(params: TechnicalTokenParams): TechnicalToken {
        const token = new TechnicalToken();
        token.sub = params.sub;
        token.tenant = params.tenant;
        token.aud = params.aud;
        token.jti = params.jti;
        token.nbf = params.nbf;
        token.scope = params.scope;
        token.client_id = params.client_id;
        token.tenant_id = params.tenant_id;
        // Derive internal scopes array from space-delimited scope string
        token.scopes = params.scope ? params.scope.split(' ').filter(s => s.length > 0) : [];
        return token;
    }

    isTechnicalToken(): boolean {
        return true;
    }

    isTenantToken(): boolean {
        return false;
    }

    isInternalToken(): boolean {
        return false;
    }

    asPlainObject(): Record<string, any> {
        return {
            sub: this.sub,
            aud: this.aud,
            jti: this.jti,
            nbf: this.nbf,
            scope: this.scope,
            client_id: this.client_id,
            tenant_id: this.tenant_id,
            tenant: this.tenant,
            grant_type: this.grant_type,
            isTechnical: true,
        };
    }

    asTechnicalToken(): TechnicalToken {
        return this;
    }

    asTenantToken(): TenantToken {
        throw new Error("Invalid Token");
    }
}

export class AuthContext {
    SCOPE_ABILITIES: AnyAbility;
    SECURITY_CONTEXT: Token;
}
