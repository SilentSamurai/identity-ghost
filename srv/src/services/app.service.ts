import {BadRequestException, ConflictException, Injectable, Logger} from '@nestjs/common';
import {InjectDataSource, InjectRepository} from '@nestjs/typeorm';
import {DataSource, Not, Repository} from 'typeorm';
import {App} from '../entity/app.entity';
import {Client} from '../entity/client.entity';
import {TenantService} from "./tenant.service";
import {SubscriptionService} from "./subscription.service";
import {Permission} from "../auth/auth.decorator";
import {Action} from "../casl/actions.enum";
import {SubjectEnum} from '../entity/subjectEnum';
import {ClientService} from './client.service';
import {deriveSlug, buildAlias} from '../utils/slug.util';
import {isValidRedirectUri} from '../utils/redirect-uri.validator';
import {AppClientAuditLogger} from '../log/app-client-audit.logger';

@Injectable()
export class AppService {
    private readonly logger = new Logger(AppService.name);

    constructor(
        @InjectRepository(App)
        private readonly appRepository: Repository<App>,
        @InjectDataSource()
        private readonly dataSource: DataSource,
        private readonly tenantService: TenantService,
        private readonly subscriptionService: SubscriptionService,
        private readonly clientService: ClientService,
        private readonly appClientAuditLogger: AppClientAuditLogger,
    ) {
    }

    async createApp(permission: Permission, tenantId: string, name: string, appUrl: string, description?: string): Promise<App> {
        const tenant = await this.tenantService.findById(permission, tenantId);
        permission.isAuthorized(Action.Update, SubjectEnum.TENANT, {id: tenant.id});

        if (!isValidRedirectUri(appUrl)) {
            throw new BadRequestException('App URL is not a valid redirect URI');
        }

        const slug = deriveSlug(name);
        if (!slug) {
            throw new BadRequestException('App name produces no valid slug');
        }

        const alias = buildAlias(slug, tenant.domain);
        if (alias.length > 253) {
            throw new BadRequestException('Derived client alias exceeds 253-character limit');
        }

        const clientRepo = this.dataSource.getRepository(Client);
        const existingAlias = await clientRepo.findOne({where: {alias}});
        if (existingAlias) {
            throw new ConflictException('Client alias already in use');
        }

        const actorId = permission.authContext?.SECURITY_CONTEXT?.sub || 'unknown';

        return this.dataSource.transaction(async (manager) => {
            const appClient = await this.clientService.createAppClient(manager, {
                tenant,
                alias,
                name,
                appUrl,
            });

            const app = manager.create(App, {
                name,
                description,
                appUrl,
                owner: tenant,
                client: appClient,
                clientId: appClient.id,
            });

            return manager.save(app);
        }).then((saved) => {
            // Audit log fires AFTER transaction commits (task 15.2)
            this.appClientAuditLogger.logCreated({
                appId: saved.id,
                appName: saved.name,
                ownerTenantId: tenant.id,
                clientId: saved.client?.clientId || '',
                alias: saved.client?.alias || alias,
                actorId,
                correlationId: '',
            });
            return saved;
        }).catch((error) => {
            // Log creation failure (task 15.3)
            const reason = error instanceof ConflictException ? 'duplicate_alias'
                : error instanceof BadRequestException ? 'validation_failed'
                : 'persistence_error';
            this.appClientAuditLogger.logCreateFailed({
                appName: name,
                ownerTenantId: tenantId,
                reason,
                actorId,
                correlationId: '',
            });
            throw error;
        });
    }

    async getAppById(appId: string): Promise<App> {
        return this.appRepository.findOneOrFail({where: {id: appId}, relations: ['owner', 'client']});
    }

    async findByTenantId(tenantId: string): Promise<App[]> {
        return this.appRepository.find({
            where: {owner: {id: tenantId}},
            relations: ['client'],
        });
    }

    async findByClientId(clientId: string): Promise<App | null> {
        return this.appRepository.findOne({
            where: {client: {id: clientId}},
            relations: ['client'],
        });
    }

    async findAllApps(excludeTenantId: string): Promise<App[]> {
        const allApps = await this.appRepository.find({
            where: {
                owner: {
                    id: Not(excludeTenantId)
                },
                isPublic: true
            },
            relations: ['owner', 'client']
        });

        const subscribedApps = await this.subscriptionService.findByTenantId(excludeTenantId);
        const subscribedAppIds = new Set(subscribedApps.map(sub => sub.app.id));

        return allApps.filter(app => !subscribedAppIds.has(app.id));
    }

    async deleteApp(permission: Permission, appId: string): Promise<void> {
        const app = await this.getAppById(appId);
        permission.isAuthorized(Action.Update, SubjectEnum.TENANT, {id: app.owner.id});

        const subscriptions = await this.subscriptionService.findAllByAppId(appId);
        if (subscriptions.length > 0) {
            throw new Error('Cannot delete app with subscriptions');
        }

        await this.dataSource.transaction(async (manager) => {
            const appToDelete = await manager.findOneOrFail(App, {where: {id: app.id}});
            await manager.remove(appToDelete);
            if (app.client) {
                await this.clientService.deleteAppClient(manager, app.client.id);
            }
        });
    }

    async updateApp(permission: Permission, appId: string, name: string, appUrl: string, description?: string): Promise<App> {
        const app = await this.getAppById(appId);
        permission.isAuthorized(Action.Update, SubjectEnum.TENANT, {id: app.owner.id});

        if (appUrl !== app.appUrl && !isValidRedirectUri(appUrl)) {
            throw new BadRequestException('App URL is not a valid redirect URI');
        }

        const nameChanged = name !== app.name;
        const appUrlChanged = appUrl !== app.appUrl;
        const descChanged = description !== undefined && description !== app.description;

        if (!nameChanged && !appUrlChanged && descChanged) {
            app.description = description;
            return this.appRepository.save(app);
        }

        return this.dataSource.transaction(async (manager) => {
            if (nameChanged) {
                await this.clientService.updateAppClientName(manager, app.client.id, name);
            }
            if (appUrlChanged) {
                await this.clientService.replaceSeededRedirectUri(manager, app.client.id, app.appUrl, appUrl);
            }

            app.name = name;
            app.appUrl = appUrl;
            if (description !== undefined) {
                app.description = description;
            }

            return manager.save(app);
        });
    }

    async publishApp(permission: Permission, appId: string): Promise<App> {
        const app = await this.getAppById(appId);
        permission.isAuthorized(Action.Update, SubjectEnum.TENANT, {id: app.owner.id});
        app.isPublic = true;
        return this.appRepository.save(app);
    }
}
