import {Column, CreateDateColumn, Entity, Index, PrimaryColumn} from "typeorm";

@Entity({name: "login_sessions"})
export class LoginSession {
    @PrimaryColumn({name: "sid", type: "varchar", length: 36})
    sid: string;

    @Column({name: "user_id", type: "varchar", length: 36, nullable: false})
    @Index()
    userId: string;

    @Column({name: "tenant_id", type: "varchar", length: 36, nullable: false})
    @Index()
    tenantId: string;

    @Column({name: "auth_time", type: "integer", nullable: false})
    authTime: number;

    @Column({name: "expires_at", type: "datetime", nullable: false})
    expiresAt: Date;

    @Column({name: "invalidated_at", type: "datetime", nullable: true})
    invalidatedAt: Date | null;

    @CreateDateColumn({name: "created_at"})
    createdAt: Date;
}
