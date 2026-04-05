import {Column, CreateDateColumn, Entity, PrimaryColumn} from "typeorm";

@Entity({name: "auth_code"})
export class AuthCode {
    @PrimaryColumn({name: "code", length: 16})
    code: string;

    @Column({name: "code_challenge", unique: true, nullable: false})
    codeChallenge: string;

    @Column({name: "method", nullable: false})
    method: string;

    @Column({name: "user_id", nullable: false})
    userId: string;

    @Column({name: "tenant_id", nullable: false})
    tenantId: string;

    @Column({name: "subscriber_tenant_hint", nullable: true})
    subscriberTenantHint: string;

    @Column({name: "client_id", nullable: false})
    clientId: string;

    @Column({name: "redirect_uri", nullable: true})
    redirectUri: string;

    @Column({name: "scope", nullable: true})
    scope: string;

    @Column({name: "used", default: false})
    used: boolean;

    @Column({name: "used_at", nullable: true})
    usedAt: Date;

    @Column({name: "expires_at", nullable: false})
    expiresAt: Date;

    @CreateDateColumn({name: "created_at"})
    createdAt: Date;
}
