import {Column, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn} from 'typeorm';
import {Tenant} from './tenant.entity';
import {Role} from './role.entity';

@Entity({name: 'apps'})
export class App {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({unique: true})
    name: string;

    @Column({name: 'app_url'})
    appUrl: string;

    @Column({nullable: true})
    description?: string;

    // The tenant that created/owns this app.
    @ManyToOne(() => Tenant, tenant => tenant.createdApps)
    @JoinColumn({name: 'owner_tenant_id'})
    owner: Tenant;

    // Connects roles that are specifically assigned to this app.
    // Typically, you'll store them in the Role entity with an "app" relationship.
    @OneToMany(() => Role, role => role.app)
    roles: Role[];

    @Column({name: 'created_at', default: () => 'CURRENT_TIMESTAMP'})
    createdAt: Date;

    @Column({name: 'is_public', type: 'boolean', default: false})
    isPublic: boolean;

}