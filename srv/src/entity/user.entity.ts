import {Column, CreateDateColumn, Entity, ManyToMany, PrimaryGeneratedColumn,} from "typeorm";
import {Exclude} from "class-transformer"; // Used with ClassSerializerInterceptor to exclude from responses.
import {Tenant} from "./tenant.entity";
import {Role} from "./role.entity";

@Entity({name: "users"})
export class User {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Column({nullable: false})
    @Exclude() // Exclude from responses.
    password: string;

    @Column({unique: true, nullable: false, length: 128})
    email: string;

    @Column({nullable: false, length: 128})
    name: string;

    @ManyToMany(() => Tenant, (tenant) => tenant.members)
    tenants: Tenant[];

    @ManyToMany(() => Role, (role) => role.users)
    roles: Role[];

    @Column({default: false})
    @Exclude() // Exclude from responses.
    verified: boolean;

    @CreateDateColumn({name: "created_at"})
    createdAt: Date;

    @Column({name: "email_count", default: 0})
    @Exclude() // Exclude from responses.
    emailCount: number;

    @Column({name: "email_count_reset_at", nullable: true})
    @Exclude() // Exclude from responses.
    emailCountResetAt: Date;

    @Column({default: false})
    @Exclude() // Exclude from non-admin responses.
    locked: boolean;
}
