/**
 * TenantAmbiguityService - Detects and resolves ambiguous tenant scenarios.
 *
 * When a user belongs to multiple tenants that are all subscribed to the same
 * third-party app, this service helps identify the ambiguity and validate
 * the user's tenant selection.
 */
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

    /**
     * Find all subscriber tenants where:
     * 1. The user is a member of the tenant
     * 2. The tenant is subscribed to an app owned by the client's tenant
     *
     * Returns empty array for first-party apps (user logs into app owner's tenant).
     * Returns single-element array if user belongs to only one subscriber tenant.
     * Returns multi-element array if user belongs to multiple subscriber tenants (ambiguous).
     */
    async findSubscriberTenants(userId: string, clientId: string): Promise<TenantInfo[]> {
        try {
            // Get the client and its tenant (the app owner)
            // Use findByClientIdOrAlias to support both UUID clientId and domain alias
            const client = await this.clientService.findByClientIdOrAlias(clientId);
            if (!client || !client.tenant) {
                this.logger.debug(`Client ${clientId} has no associated tenant — no subscriber tenants`);
                return [];
            }

            const appOwnerTenantId = client.tenant.id;

            // Find apps owned by the client's tenant
            const apps = await this.appRepo.find({
                where: {owner: {id: appOwnerTenantId}},
            });

            if (apps.length === 0) {
                this.logger.debug(`Tenant ${appOwnerTenantId} has no apps — no subscriber tenants`);
                return [];
            }

            const appIds = apps.map(a => a.id);

            // Get all tenants where user is a member
            const memberships = await this.memberRepo.find({
                where: {userId},
            });

            if (memberships.length === 0) {
                this.logger.debug(`User ${userId} has no tenant memberships`);
                return [];
            }

            // Get all active subscriptions to apps owned by the client's tenant
            const subscriptions = await this.subscriptionRepo
                .createQueryBuilder('subscription')
                .leftJoinAndSelect('subscription.subscriber', 'subscriber')
                .leftJoinAndSelect('subscription.app', 'app')
                .where('app.id IN (:...appIds)', {appIds})
                .andWhere('subscription.status = :status', {status: SubscriptionStatus.SUCCESS})
                .getMany();

            const subscribedTenantIds = new Set(
                subscriptions.map(s => s.subscriber?.id).filter(Boolean)
            );

            // Get tenant details for user's memberships
            const memberTenantIds = memberships.map(m => m.tenantId);
            const tenants = await this.tenantRepo.findByIds(memberTenantIds);
            const tenantMap = new Map(tenants.map(t => [t.id, t]));

            // Filter to tenants where user is member AND tenant is subscribed
            // Exclude the app owner's tenant (that's first-party, not subscriber)
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
                `User ${userId} has ${subscriberTenants.length} subscriber tenant(s) for client ${clientId}`
            );

            return subscriberTenants;
        } catch (error) {
            this.logger.error(`Error finding subscriber tenants: ${error.message}`);
            return [];
        }
    }

    /**
     * Validate that the hint is a valid subscriber tenant for this user/app.
     * The hint can be either a tenant domain or tenant ID.
     */
    async validateHint(
        userId: string,
        clientId: string,
        hint: string,
    ): Promise<boolean> {
        const subscriberTenants = await this.findSubscriberTenants(userId, clientId);
        return subscriberTenants.some(t => t.domain === hint || t.id === hint);
    }

    /**
     * Resolve a tenant hint to a TenantInfo object.
     * Returns null if the hint is invalid.
     */
    async resolveHint(
        userId: string,
        clientId: string,
        hint: string,
    ): Promise<TenantInfo | null> {
        const subscriberTenants = await this.findSubscriberTenants(userId, clientId);
        return subscriberTenants.find(t => t.domain === hint || t.id === hint) || null;
    }
}
