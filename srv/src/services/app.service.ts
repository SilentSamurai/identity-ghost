import {Injectable} from '@nestjs/common';
import {InjectRepository} from '@nestjs/typeorm';
import {Not, Repository} from 'typeorm';
import {App} from '../entity/app.entity';
import {TenantService} from "./tenant.service";
import {SubscriptionService} from "./subscription.service";
import {Permission} from "../auth/auth.decorator";
import {Action} from "../casl/actions.enum";
import {SubjectEnum} from '../entity/subjectEnum';

@Injectable()
export class AppService {
    constructor(
        @InjectRepository(App)
        private readonly appRepository: Repository<App>,
        private readonly tenantService: TenantService,
        private readonly subscriptionService: SubscriptionService,
    ) {
    }

    /**
     * Creates a new application owned by the specified tenant.
     */
    async createApp(permission: Permission, tenantId: string, name: string, appUrl: string, description?: string): Promise<App> {
        const tenant = await this.tenantService.findById(permission, tenantId);
        permission.isAuthorized(Action.Update, SubjectEnum.TENANT, {id: tenant.id});
        const newApp = this.appRepository.create({
            name,
            description,
            appUrl: appUrl,
            owner: tenant
        });
        return this.appRepository.save(newApp);
    }

    /**
     * Retrieves an app by its ID.
     */
    async getAppById(appId: string): Promise<App> {
        return this.appRepository.findOneOrFail({where: {id: appId}, relations: ['owner']});
    }

    /**
     * Retrieves a tenant by its ID.
     */
    async findByTenantId(tenantId: string): Promise<App[]> {
        return this.appRepository.findBy({owner: {id: tenantId}});
    }

    /**
     * Retrieves all apps that are available for subscription, excluding apps owned by the specified tenant
     * and apps that the tenant is already subscribed to.
     */
    async findAllApps(excludeTenantId: string): Promise<App[]> {
        // Get all public apps except those owned by the current tenant
        const allApps = await this.appRepository.find({
            where: {
                owner: {
                    id: Not(excludeTenantId)
                },
                isPublic: true
            },
            relations: ['owner']
        });

        // Get all apps the tenant is already subscribed to
        const subscribedApps = await this.subscriptionService.findByTenantId(excludeTenantId);
        const subscribedAppIds = new Set(subscribedApps.map(sub => sub.app.id));

        // Filter out apps that the tenant is already subscribed to
        return allApps.filter(app => !subscribedAppIds.has(app.id));
    }

    /**
     * Deletes an app by its ID. This will also handle unsubscribing all tenants from the app.
     */
    async deleteApp(permission: Permission, appId: string): Promise<void> {
        const app = await this.getAppById(appId);
        permission.isAuthorized(Action.Update, SubjectEnum.TENANT, {id: app.owner.id});

        // Get all subscriptions for this app
        const subscriptions = await this.subscriptionService.findAllByAppId(appId);

        if (subscriptions.length > 0) {
            throw new Error('Cannot delete app with subscriptions');
        }
        // Delete the app
        await this.appRepository.remove(app);
    }

    /**
     * Updates an existing application.
     */
    async updateApp(permission: Permission, appId: string, name: string, appUrl: string, description?: string): Promise<App> {
        const app = await this.getAppById(appId);

        // Check if the user has permission to update this app
        permission.isAuthorized(Action.Update, SubjectEnum.APPS, {id: app.id});

        app.name = name;
        app.appUrl = appUrl;
        if (description !== undefined) {
            app.description = description;
        }

        return this.appRepository.save(app);
    }

    async publishApp(permission: Permission, appId: string): Promise<App> {
        const app = await this.getAppById(appId);
        permission.isAuthorized(Action.Update, SubjectEnum.TENANT, {id: app.owner.id});
        app.isPublic = true;
        return this.appRepository.save(app);
    }
}