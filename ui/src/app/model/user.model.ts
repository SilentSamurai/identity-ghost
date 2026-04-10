export interface AuthTenant {
    id: string;
    name: string;
    domain: string;
    client_id?: string;
}

export interface JwtToken {
    sub: string;
    tenant: AuthTenant;
    scopes: string[];
    roles: string[];
    grant_type: string;
    iat: number;
    exp: number;
    iss: string;
    // RFC 9068 claims
    aud: string[];
    jti: string;
    nbf: number;
    scope: string;
    client_id: string;
    tenant_id: string;
}

export class DecodedToken implements JwtToken {
    sub: string;
    tenant: AuthTenant;
    scopes: string[];
    roles: string[];
    grant_type: string;
    iat: number;
    exp: number;
    iss: string;
    aud: string[];
    jti: string;
    nbf: number;
    scope: string;
    client_id: string;
    tenant_id: string;
    // Populated from session storage (fetched from /api/users/me), not from JWT
    email: string;
    name: string;

    constructor(init?: Partial<JwtToken>) {
        this.sub = init?.sub ?? '';
        this.tenant = init?.tenant ?? {
            id: '',
            name: '',
            domain: '',
        };
        this.roles = init?.roles ?? [];
        this.grant_type = init?.grant_type ?? '';
        this.iat = init?.iat ?? 0;
        this.exp = init?.exp ?? 0;
        this.iss = init?.iss ?? '';
        this.aud = init?.aud ?? [];
        this.jti = init?.jti ?? '';
        this.nbf = init?.nbf ?? 0;
        this.scope = init?.scope ?? '';
        this.client_id = init?.client_id ?? '';
        this.tenant_id = init?.tenant_id ?? '';
        // Derive scopes array from space-delimited scope string
        this.scopes = init?.scopes ?? (this.scope ? this.scope.split(' ').filter(s => s.length > 0) : []);
        this.email = '';
        this.name = '';
    }

    public isSuperAdmin(): boolean {
        return this.roles.includes('SUPER_ADMIN');
    }

    public isTenantAdmin(): boolean {
        return this.roles.includes('TENANT_ADMIN') || this.roles.includes('SUPER_ADMIN');
    }
}
