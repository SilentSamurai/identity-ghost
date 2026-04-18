import {
    Column,
    CreateDateColumn,
    Entity,
    Index,
    JoinColumn,
    ManyToOne,
    PrimaryGeneratedColumn,
    Unique,
    UpdateDateColumn,
} from "typeorm";
import {User} from "./user.entity";

@Entity({name: "user_consents"})
@Unique("UQ_user_consents_user_client", ["userId", "clientId"])
export class UserConsent {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Column({name: "user_id", type: "varchar", length: 36, nullable: false})
    @Index()
    userId: string;

    @ManyToOne(() => User, {onDelete: "CASCADE"})
    @JoinColumn({name: "user_id"})
    user: User;

    @Column({name: "client_id", type: "varchar", nullable: false})
    @Index()
    clientId: string;

    @Column({name: "granted_scopes", type: "varchar", nullable: false})
    grantedScopes: string;

    @Column({name: "consent_version", type: "integer", nullable: false, default: 1})
    consentVersion: number;

    @CreateDateColumn({name: "created_at"})
    createdAt: Date;

    @UpdateDateColumn({name: "updated_at"})
    updatedAt: Date;
}
