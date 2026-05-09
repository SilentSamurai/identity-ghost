import {Column, Entity, JoinColumn, ManyToOne, OneToMany, OneToOne, PrimaryGeneratedColumn} from 'typeorm';
import {Tenant} from './tenant.entity';
import {Role} from './role.entity';
import {Client} from './client.entity';

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

    @ManyToOne(() => Tenant, tenant => tenant.createdApps)
    @JoinColumn({name: 'owner_tenant_id'})
    owner: Tenant;

    @OneToMany(() => Role, role => role.app)
    roles: Role[];

    @Column({name: 'created_at', default: () => 'CURRENT_TIMESTAMP'})
    createdAt: Date;

    @Column({name: 'is_public', type: 'boolean', default: false})
    isPublic: boolean;

    @OneToOne(() => Client)
    @JoinColumn({name: 'client_id'})
    client: Client;

    @Column({name: 'client_id'})
    clientId: string;
}