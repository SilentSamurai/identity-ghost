import {Injectable, InternalServerErrorException, Logger} from '@nestjs/common';
import {InjectRepository} from '@nestjs/typeorm';
import {Repository} from 'typeorm';
import {Subscription, SubscriptionStatus} from '../entity/subscription.entity';
import {Tenant} from '../entity/tenant.entity';
import {App} from '../entity/app.entity';
import {User} from "../entity/user.entity";
import {AuthContext} from "../casl/contexts";
import {TenantService} from "./tenant.service";
import {AppSubscriptionService} from './app-subscription.service';

const logger = new Logger("SubscriptionService");

/**
 * Interface for the response from app's onboard endpoint
 */
interface OnboardResponse {
    appNames?: string[];
}

/**
 * Interface for the response from app's off board endpoint
 */
interface OffboardResponse {
    appNames?: string[];
}

@Injectable()
export class SubscriptionService {
    constructor(
        @InjectRepository(Subscription)
        private readonly subscriptionRepo: Repository<Subscription>,
        @InjectRepository(App)
        private readonly appRepo: Repository<App>,
        private readonly tenantService: TenantService,
        private readonly appSubscriptionService: AppSubscriptionService,
    ) {
    }

    async subscribeApp(
        subscriberTenant: Tenant,
        app: App,
        visited: Set<string> = new Set<string>()
    ): Promise<Subscription> {
        return this.appSubscriptionService.subscribeApp(subscriberTenant, app, visited);
    }

    async unsubscribe(
        tenant: Tenant,
        app: App,
        visited: Set<string> = new Set<string>()
    ): Promise<{ status: boolean }> {
        return this.appSubscriptionService.unsubscribe(tenant, app, visited);
    }

    public async findAllByAppId(appId: string): Promise<Subscription[]> {
        return this.subscriptionRepo.find({
            where: {app: {id: appId}},
            relations: ['subscriber', 'app']
        });
    }

    /**
     * Returns all apps to which the specified tenant is subscribed.
     * @param tenantId The UUID of the tenant whose subscriptions we want to list.
     */
    public async findByTenantId(tenantId: string): Promise<Subscription[]> {
        const subscriptions = await this.subscriptionRepo.find({
            where: {subscriber: {id: tenantId}},
            relations: ['app'],
        });

        // Map each subscription to its associated app
        return subscriptions;
    }

    async isUserSubscribedToTenant(authContext: AuthContext, user: User, appOwnerTenant: Tenant): Promise<boolean> {
        // Get all tenants the user belongs to
        const userTenants = await this.tenantService.findByMembership(authContext, user);
        // For each user tenant, check if it is subscribed to any app owned by the logging-in tenant
        for (const tenant of userTenants) {
            if (tenant.id == appOwnerTenant.id) continue;
            if (await this.canLoginToTenant(authContext, tenant, appOwnerTenant)) {
                return true
            }
        }
        return false;
    }

    /**
     * Resolves subscription tenant ambiguity for a user and a target tenant (app owner).
     * Returns { resolvedTenant } if unambiguous, or { ambiguousTenants: [...] } if ambiguous.
     */
    async resolveSubscriptionTenantAmbiguity(context: AuthContext, user: User, appOwnerTenant: Tenant, subscriberTenantHint: string | null): Promise<{
        resolvedTenant?: Tenant,
        ambiguousTenants?: Tenant[]
    }> {
        // Find all userTenants that are subscribed to any of the ownedApps
        if (subscriberTenantHint) {
            const resolvedTenant = await this.tenantService.findByClientIdOrDomain(context, subscriberTenantHint);
            if (await this.canLoginToTenant(context, resolvedTenant, appOwnerTenant)) {
                return {resolvedTenant}
            }
            throw new InternalServerErrorException("subscribedTenant hint did not work");
        } else {
            // Find all tenants the user is a member of
            const userTenants = await this.tenantService.findByMembership(context, user);
            const validTenants = [];
            for (const t of userTenants) {
                if (t.id == appOwnerTenant.id) continue;
                if (await this.canLoginToTenant(context, t, appOwnerTenant)) {
                    validTenants.push(t)
                }
            }
            if (validTenants.length == 0) {
                // no subscription
                if (userTenants.length == 0) {
                    // user do not belong to any tenant
                    return {}
                }
                // provider login, logs into its own tenant
                return {}
            } else if (validTenants.length === 1) {
                // exactly 1 subscription
                return {resolvedTenant: validTenants[0]};
            } else {
                // multiple subscription
                return {ambiguousTenants: validTenants};
            }
        }
    }

    async canLoginToTenant(authContext: AuthContext, loggingTenant: Tenant, appOwnerTenant: Tenant): Promise<boolean> {
        // Get all apps owned by the app owner tenant
        const ownedApps = await this.appRepo.findBy({
            owner: {
                id: appOwnerTenant.id
            }
        });
        for (const app of ownedApps) {
            if (await this.hasValidSubscription(loggingTenant, app)) {
                return true;
            }
        }
        return false;
    }

    /**
     * Checks if a subscriber tenant has a valid subscription to any app owned by the target tenant.
     * @param subscriberTenant The tenant to check subscription status for
     * @param targetTenant The tenant whose apps we want to check subscription against
     * @param app subscription for this app
     * @returns true if the subscriber has at least one valid subscription to any app owned by the target tenant
     */
    async hasValidSubscription(subscriberTenant: Tenant, app: App): Promise<boolean> {
        return await this.subscriptionRepo.exists({
            where: {
                subscriber: {id: subscriberTenant.id},
                app: {id: app.id},
                status: SubscriptionStatus.SUCCESS
            }
        });
    }
}
