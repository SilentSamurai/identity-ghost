import {
    Column,
    CreateDateColumn,
    Entity,
    Index,
    JoinColumn,
    ManyToOne,
    PrimaryGeneratedColumn,
} from "typeorm";
import {User} from "./user.entity";

@Entity({name: "refresh_tokens"})
export class RefreshToken {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Column({name: "token_hash", nullable: false})
    @Index()
    tokenHash: string;

    @Column({name: "family_id", type: "uuid", nullable: false})
    @Index()
    familyId: string;

    @Column({name: "parent_id", type: "uuid", nullable: true, unique: true})
    parentId: string | null;

    @Column({name: "user_id", type: "uuid", nullable: false})
    userId: string;

    @ManyToOne(() => User, {onDelete: "CASCADE"})
    @JoinColumn({name: "user_id"})
    user: User;

    @Column({name: "client_id", nullable: false})
    clientId: string;

    @Column({name: "tenant_id", type: "uuid", nullable: false})
    tenantId: string;

    @Column({nullable: false})
    scope: string;

    @Column({name: "absolute_expires_at", type: "datetime", nullable: false})
    absoluteExpiresAt: Date;

    @Column({name: "expires_at", type: "datetime", nullable: false})
    expiresAt: Date;

    @Column({default: false})
    revoked: boolean;

    @Column({name: "used_at", type: "datetime", nullable: true})
    usedAt: Date | null;

    @Column({name: "sid", type: "varchar", length: 36, nullable: true})
    @Index()
    sid: string | null;

    @CreateDateColumn({name: "created_at"})
    createdAt: Date;
}
