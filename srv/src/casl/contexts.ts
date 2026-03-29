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
    email: string;
    name: string;
    userId: string;
    tenant: TenantInfo;
    userTenant: TenantInfo;
    scopes: string[];
    roles: string[];
    grant_type: GRANT_TYPES;
}

export interface TechnicalTokenParams {
    sub: string;
    tenant: {
        id: string;
        name: string;
        domain: string;
    };
    scopes: string[];
}

export class InternalToken implements Token {
    sub: string;
    scopes: string[] = [];
    grant_type: GRANT_TYPES = GRANT_TYPES.CLIENT_CREDENTIALS;
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
    sub: string;
    scopes: string[];
    roles: string[];
    grant_type: GRANT_TYPES;
    email: string;
    name: string;
    userId: string;
    tenant: TenantInfo;
    userTenant: TenantInfo;

    static create(params: TenantTokenParams): TenantToken {
        const token = new TenantToken();
        token.sub = params.sub;
        token.email = params.email;
        token.name = params.name;
        token.userId = params.userId;
        token.tenant = params.tenant;
        token.userTenant = params.userTenant;
        token.scopes = params.scopes;
        token.roles = params.roles;
        token.grant_type = params.grant_type;
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
        return {
            sub: this.sub,
            email: this.email,
            name: this.name,
            userId: this.userId,
            tenant: this.tenant,
            userTenant: this.userTenant,
            scopes: this.scopes,
            roles: this.roles,
            grant_type: this.grant_type
        };
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

    static create(params: TechnicalTokenParams): TechnicalToken {
        const token = new TechnicalToken();
        token.sub = params.sub;
        token.tenant = params.tenant;
        token.scopes = params.scopes;
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
            tenant: this.tenant,
            scopes: this.scopes,
            grant_type: this.grant_type,
            isTechnical: true
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
