import {
    Column,
    CreateDateColumn,
    Entity,
    JoinColumn,
    ManyToOne,
    PrimaryGeneratedColumn,
} from "typeorm";
import {Exclude} from "class-transformer";
import {Tenant} from "./tenant.entity";

@Entity({name: "tenant_keys"})
export class TenantKey {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Column({name: "tenant_id", type: "varchar", length: 36})
    tenantId: string;

    @ManyToOne(() => Tenant, {onDelete: "CASCADE"})
    @JoinColumn({name: "tenant_id"})
    tenant: Tenant;

    @Column({name: "key_version", type: "int"})
    keyVersion: number;

    @Column({name: "kid", type: "varchar", length: 64, unique: true})
    kid: string;

    @Column({name: "public_key", type: "text"})
    publicKey: string;

    @Column({name: "private_key", type: "text"})
    @Exclude()
    privateKey: string;

    @Column({name: "is_current", type: "boolean", default: false})
    isCurrent: boolean;

    @CreateDateColumn({name: "created_at"})
    createdAt: Date;

    @Column({name: "superseded_at", type: "datetime", nullable: true})
    supersededAt: Date | null;

    @Column({name: "deactivated_at", type: "datetime", nullable: true})
    deactivatedAt: Date | null;
}
