import {Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn} from "typeorm";
import {Tenant} from "./tenant.entity";

@Entity({name: "clients"})
export class Client {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Column({unique: true, nullable: false, name: "client_id"})
    clientId: string;

    @Column({type: "simple-json", nullable: true, name: "client_secrets"})
    clientSecrets: { secret: string; salt: string; created_at: string; expires_at: string | null }[];

    @Column({type: "simple-json", nullable: true, name: "redirect_uris"})
    redirectUris: string[];

    @Column({nullable: true, name: "allowed_scopes"})
    allowedScopes: string;

    @Column({nullable: true, name: "grant_types"})
    grantTypes: string;

    @Column({nullable: true, name: "response_types"})
    responseTypes: string;

    @Column({name: "token_endpoint_auth_method", default: "client_secret_basic"})
    tokenEndpointAuthMethod: string;

    @Column({name: "is_public", type: "boolean", default: false})
    isPublic: boolean;

    @Column({name: "require_pkce", type: "boolean", default: false})
    requirePkce: boolean;

    @Column({name: "allow_password_grant", type: "boolean", default: false})
    allowPasswordGrant: boolean;

    @Column({name: "allow_refresh_token", type: "boolean", default: true})
    allowRefreshToken: boolean;

    @Column({nullable: true})
    name: string;

    @CreateDateColumn({name: "created_at"})
    createdAt: Date;

    @Column({name: "tenant_id"})
    tenantId: string;

    @ManyToOne(() => Tenant, tenant => tenant.clients, {onDelete: "CASCADE"})
    @JoinColumn({name: "tenant_id"})
    tenant: Tenant;
}
