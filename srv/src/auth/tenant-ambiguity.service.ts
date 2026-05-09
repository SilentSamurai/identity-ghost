import {Injectable, Logger} from '@nestjs/common';
import {InjectRepository} from '@nestjs/typeorm';
import {Repository} from 'typeorm';
import {Tenant} from '../entity/tenant.entity';
import {TenantMember} from '../entity/tenant.members.entity';
import {Subscription, SubscriptionStatus} from '../entity/subscription.entity';
import {App} from '../entity/app.entity';
import {ClientService} from '../services/client.service';

export interface TenantInfo {
    id: string;
    name: string;
    domain: string;
}

@Injectable()
export class TenantAmbiguityService {
    private readonly logger = new Logger(TenantAmbiguityService.name);

    constructor(
        @InjectRepository(TenantMember)
        private readonly memberRepo: Repository<TenantMember>,
        @InjectRepository(Subscription)
        private readonly subscriptionRepo: Repository<Subscription>,
        @InjectRepository(Tenant)
        private readonly tenantRepo: Repository<Tenant>,
        @InjectRepository(App)
        private readonly appRepo: Repository<App>,
        private readonly clientService: ClientService,
    ) {}

    async findSubscriberTenants(userId: string, clientId: string): Promise<TenantInfo[]> {
        try {
            const client = await this.clientService.findByClientIdOrAlias(clientId);
            if (!client) {
                this.logger.debug(`Client ${clientId} not found — no subscriber tenants`);
                return [];
            }

            const app = await this.appRepo.findOne({
                where: {client: {id: client.id}},
                relations: ['owner'],
            });
            if (!app) {
                this.logger.debug(`Client ${clientId} is not linked to any App — no subscriber tenants`);
                return [];
            }

            const appOwnerTenantId = app.owner.id;

            const memberships = await this.memberRepo.find({
                where: {userId},
            });

            if (memberships.length === 0) {
                this.logger.debug(`User ${userId} has no tenant memberships`);
                return [];
            }

            const subscriptions = await this.subscriptionRepo
                .createQueryBuilder('subscription')
                .leftJoinAndSelect('subscription.subscriber', 'subscriber')
                .leftJoinAndSelect('subscription.app', 'sapp')
                .where('sapp.id = :appId', {appId: app.id})
                .andWhere('subscription.status = :status', {status: SubscriptionStatus.SUCCESS})
                .getMany();

            const subscribedTenantIds = new Set(
                subscriptions.map(s => s.subscriber?.id).filter(Boolean)
            );

            const memberTenantIds = memberships.map(m => m.tenantId);
            const tenants = await this.tenantRepo.findByIds(memberTenantIds);
            const tenantMap = new Map(tenants.map(t => [t.id, t]));

            const subscriberTenants: TenantInfo[] = [];
            for (const membership of memberships) {
                const tenant = tenantMap.get(membership.tenantId);
                if (
                    tenant &&
                    tenant.id !== appOwnerTenantId &&
                    subscribedTenantIds.has(tenant.id)
                ) {
                    subscriberTenants.push({
                        id: tenant.id,
                        name: tenant.name,
                        domain: tenant.domain,
                    });
                }
            }

            this.logger.debug(
                `User ${userId} has ${subscriberTenants.length} subscriber tenant(s) for app ${app.id}`
            );

            return subscriberTenants;
        } catch (error) {
            this.logger.error(`Error finding subscriber tenants: ${error.message}`);
            return [];
        }
    }

    async validateHint(
        userId: string,
        clientId: string,
        hint: string,
    ): Promise<boolean> {
        const subscriberTenants = await this.findSubscriberTenants(userId, clientId);
        return subscriberTenants.some(t => t.domain === hint || t.id === hint);
    }

    async resolveHint(
        userId: string,
        clientId: string,
        hint: string,
    ): Promise<TenantInfo | null> {
        const subscriberTenants = await this.findSubscriberTenants(userId, clientId);
        return subscriberTenants.find(t => t.domain === hint || t.id === hint) || null;
    }
}
