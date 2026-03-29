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

    @Column({name: "redirect_uri", nullable: true})
    redirectUri: string;

    @CreateDateColumn({name: "created_at"})
    createdAt: Date;
}
