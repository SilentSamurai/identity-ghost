import {Injectable, Logger, NotFoundException} from '@nestjs/common';
import {InjectRepository} from '@nestjs/typeorm';
import {Repository} from 'typeorm';
import {Subscription, SubscriptionStatus} from '../entity/subscription.entity';
import {Tenant} from '../entity/tenant.entity';
import {Role} from '../entity/role.entity';
import {App} from '../entity/app.entity';
import {TechnicalTokenService} from '../core/technical-token.service';

const logger = new Logger("AppSubscriptionService");

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
export class AppSubscriptionService {
    constructor(
        @InjectRepository(Subscription)
        private readonly subscriptionRepo: Repository<Subscription>,
        @InjectRepository(Role)
        private readonly roleRepo: Repository<Role>,
        @InjectRepository(App)
        private readonly appRepo: Repository<App>,
        private readonly technicalTokenService: TechnicalTokenService,
    ) {
    }

    /**
     * This public method handles the app subscription process:
     * 1) Create a subscription in PENDING status.
     * 2) Copy the owner's roles for the subscriber.
     * 3) Call the onboard endpoint and parse additional apps to subscribe to.
     * 4) Update the subscription status to SUCCESS if everything completes properly.
     *
     * If any part of the process throws an error, that error is captured in subscription.message.
     *
     * @param subscriberTenant The tenant initiating the subscription
     * @param app The app they want to subscribe to
     * @param visited A set used to avoid re-subscribing the same app in recursion
     */
    async subscribeApp(
        subscriberTenant: Tenant,
        app: App,
        visited: Set<string> = new Set<string>()
    ): Promise<Subscription> {
        // Prevent tenant from subscribing to their own app
        if (subscriberTenant.id === app.owner.id) {
            throw new Error('A tenant cannot subscribe to their own application');
        }

        // First check if there's an existing subscription
        const existingSub = await this.subscriptionRepo.findOne({
            where: {subscriber: {id: subscriberTenant.id}, app: {id: app.id}},
        });

        // If there's an existing subscription
        if (existingSub) {
            // If the subscription is in progress (PENDING), throw an error
            if (existingSub.status === SubscriptionStatus.PENDING) {
                throw new Error('A subscription process is already in progress for this app');
            }
            // If the previous subscription failed, we can retry
            if (existingSub.status === SubscriptionStatus.FAILED) {
                // Delete the failed subscription to start fresh
                await this.subscriptionRepo.delete(existingSub);
            } else {
                // If the subscription is successful, return it
                return existingSub;
            }
        }

        // If we've already processed this app in the current call chain, return
        if (visited.has(app.id)) {
            return existingSub;
        }
        visited.add(app.id);

        let subscription: Subscription;

        try {
            // Create a new subscription with status = PENDING
            subscription = await this.createPendingSubscription(subscriberTenant, app);

            // Copy the app owner's roles
            await this.copyOwnerRoles(subscriberTenant, app);

            // Call the onboard endpoint; potentially subscribe to additional apps
            const onboardSucceeded = await this.callOnboardEndpoint(subscriberTenant, app, visited);

            // If everything went well, mark the subscription as SUCCESS
            if (onboardSucceeded) {
                subscription.status = SubscriptionStatus.SUCCESS;
                subscription.message = null;
                await this.subscriptionRepo.save(subscription);
            }

            return subscription;
        } catch (error) {
            // If anything goes wrong, store the error message in subscription
            const errorText = error instanceof Error ? error.message : String(error);

            // Initialize subscription if none existed yet
            if (!subscription) {
                subscription = this.subscriptionRepo.create({
                    subscriber: subscriberTenant,
                    app,
                    status: SubscriptionStatus.FAILED,
                });
            }

            subscription.message = errorText;
            subscription.status = SubscriptionStatus.FAILED;
            await this.subscriptionRepo.save(subscription);

            // Re-throw the error
            throw error;
        }
    }

    async unsubscribe(
        tenant: Tenant,
        app: App,
        visited: Set<string> = new Set<string>()
    ): Promise<{ status: boolean }> {
        // First check if there's an existing subscription
        const existingSub = await this.subscriptionRepo.findOne({
            where: {subscriber: {id: tenant.id}, app: {id: app.id}},
        });

        // If no subscription exists, return success
        if (!existingSub) {
            return {status: true};
        }

        if (existingSub.status === SubscriptionStatus.FAILED) {
            await this.subscriptionRepo.delete({
                id: existingSub.id,
            });
            return {status: true};
        }

        // If there's an ongoing unsubscription (PENDING), ignore this request
        if (existingSub.status === SubscriptionStatus.PENDING) {
            return {status: false};
        }

        // Prevent multiple processes from unsubscribing the same app repeatedly
        if (visited.has(app.id)) {
            return {status: false};
        }
        visited.add(app.id);

        let subscription: Subscription = existingSub;

        try {
            // Call the off board endpoint (if it fails, an error is thrown and caught below)
            await this.callOffboardingEndpoint(tenant, app, visited);

            // Remove roles that were created for this tenant
            const rolesToRemove = await this.roleRepo.find({
                where: {
                    tenant: {id: tenant.id},
                    app: app
                },
            });
            if (rolesToRemove.length > 0) {
                await this.roleRepo.remove(rolesToRemove);
            }

            // Only delete the subscription if everything succeeded
            await this.subscriptionRepo.delete({
                id: subscription.id,
            });

            return {status: true};
        } catch (error) {
            const errorText = error instanceof Error ? error.message : String(error);

            // If subscription wasn't found or created, create a new one for error reporting
            if (subscription) {
                // Store the error in subscription.message
                subscription.message = errorText;
                await this.subscriptionRepo.save(subscription);
            }

            throw error;
        }
    }

    /**
     * Create a new subscription with status = PENDING.
     */
    private async createPendingSubscription(tenant: Tenant, app: App): Promise<Subscription> {
        const subscription = this.subscriptionRepo.create({
            subscriber: tenant,
            app,
            status: SubscriptionStatus.PENDING
        });
        return this.subscriptionRepo.save(subscription);
    }


    /**
     * Copy all roles owned by the app's owner to the subscriber tenant.
     */
    private async copyOwnerRoles(subscriberTenant: Tenant, app: App): Promise<void> {
        const ownerRoles = await this.roleRepo.find({
            where: {tenant: {id: app.owner.id}, app: {id: app.id}},
        });

        const newRoles = ownerRoles.map(role => {
            const roleCopy = this.roleRepo.create({
                ...role,
                id: undefined,      // Let TypeORM generate a new ID
                tenant: subscriberTenant, // Switch ownership to the subscribing tenant
                app: null           // Usually you set app = null or keep it the same if you want tenant B to have explicit reference
            });
            return roleCopy;
        });

        await this.roleRepo.save(newRoles);
    }

    /**
     * Call the app's onboard endpoint. If more apps are returned in the response,
     * recursively subscribe to them. Return whether the onboarding call
     * succeeded or not.
     *
     * If an error occurs, we throw it so that higher-level logic can handle
     * and store it in subscription.message.
     */
    private async callOnboardEndpoint(
        tenant: Tenant,
        app: App,
        visited: Set<string>
    ): Promise<boolean> {
        if (!app.appUrl) {
            // No onboard endpoint available
            return true;
        }

        const endpoint = `${app.appUrl.replace(/\/+$/, '')}/api/onboard/tenant`;
        logger.log(`Making request to endpoint: ${endpoint}`);
        logger.log(`Request payload:`, {tenantId: tenant.id});
        // Get technical token (use app owner's tenant)
        const token = await this.technicalTokenService.createTechnicalAccessToken(app.owner, []);
        logger.log(`Request headers:`, {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        });

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({tenantId: tenant.id}),
        });

        if (!response.ok) {
            const errorMsg = `Onboarding request failed for app "${app.name}": ${response.status} ${response.statusText}`;
            logger.warn(errorMsg);
            throw new Error(errorMsg);
        }

        let data: OnboardResponse = {};
        try {
            data = await response.json() as OnboardResponse;
            logger.log(`Response from ${app.name}:`, data);
        } catch (error) {
            logger.log(`Response from ${app.name} could not be parsed as JSON, ignoring body`);
        }

        if (data.appNames && Array.isArray(data.appNames)) {
            // Recursively subscribe to each app name returned
            for (const name of data.appNames) {
                const nextApp = await this.appRepo.findOne({where: {name}});
                if (nextApp) {
                    await this.subscribeApp(tenant, nextApp, visited);
                } else {
                    throw new NotFoundException(`App ${name} not found`);
                }
            }
        }

        return true;
    }

    /**
     * Calls the appUrl/offboard/tenant/<tenantId> endpoint, throwing an error
     * if it fails. If additional apps are returned in the response, recursively
     * unsubscribe from them as well.
     */
    private async callOffboardingEndpoint(
        tenant: Tenant,
        app: App,
        visited: Set<string>
    ): Promise<void> {
        // If no appUrl is set, there's nothing to call, so skip
        if (!app.appUrl) {
            return;
        }

        const endpoint = `${app.appUrl.replace(/\/+$/, '')}/api/offboard/tenant`;
        logger.log(`Making request to endpoint: ${endpoint}`);
        logger.log(`Request payload:`, {tenantId: tenant.id});
        // Get technical token (use app owner's tenant)
        const token = await this.technicalTokenService.createTechnicalAccessToken(app.owner, []);
        logger.log(`Request headers:`, {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        });

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({tenantId: tenant.id}),
        });

        if (!response.ok) {
            const errorMsg = `Offboarding request failed for app "${app.name}": ${response.status} ${response.statusText}`;
            logger.warn(errorMsg);
            throw new Error(errorMsg);
        }

        let data: OffboardResponse = {};
        try {
            data = await response.json() as OffboardResponse;
            logger.log(`Response from ${app.name}:`, data);
        } catch (error) {
            logger.log(`Response from ${app.name} could not be parsed as JSON, ignoring body`);
        }

        if (data.appNames && Array.isArray(data.appNames)) {
            for (const name of data.appNames) {
                const nextApp = await this.appRepo.findOne({where: {name}});
                if (nextApp) {
                    await this.unsubscribe(tenant, nextApp, visited);
                } else {
                    throw new NotFoundException(`App ${name} not found`);
                }
            }
        }
    }
} 