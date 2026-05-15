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
import {TechnicalTokenService} from '../core/technical-token.service';

/** Sentinel tenant ID sent in test webhook calls so the app can detect and ignore them. */
export const WEBHOOK_TEST_TENANT_ID = '00000000-0000-0000-0000-000000000000';

export interface WebhookTestResult {
    url: string;
    status: number | null;
    latencyMs: number;
    ok: boolean;
    error?: string;
    bodyValid: boolean;
    body?: any;
}

export interface TestWebhookResponse {
    onboardingEnabled: boolean;
    onboard: WebhookTestResult | null;
    offboard: WebhookTestResult | null;
}

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
        private readonly technicalTokenService: TechnicalTokenService,
    ) {
    }

    async createApp(permission: Permission, tenantId: string, name: string, appUrl: string, description?: string, onboardingEnabled?: boolean, onboardingCallbackUrl?: string): Promise<App> {
        const tenant = await this.tenantService.findById(permission, tenantId);
        permission.isAuthorized(Action.Update, SubjectEnum.TENANT, {id: tenant.id});

        if (!isValidRedirectUri(appUrl)) {
            throw new BadRequestException('App URL is not a valid redirect URI');
        }

        // Validate onboardingCallbackUrl if provided
        if (onboardingCallbackUrl && !isValidRedirectUri(onboardingCallbackUrl)) {
            throw new BadRequestException('Onboarding callback URL is not a valid URI');
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

        // Create client and app as individual atomic operations to avoid
        // "cannot start a transaction within a transaction" on SQLite.
        // If app creation fails after client is saved, delete the orphaned client.
        const appClient = await this.clientService.createAppClient(this.dataSource.manager, {
            tenant,
            alias,
            name,
            appUrl,
        });

        let saved: App;
        try {
            const app = this.appRepository.create({
                name,
                description,
                appUrl,
                owner: tenant,
                client: appClient,
                clientId: appClient.id,
                onboardingEnabled: onboardingEnabled ?? true,
                onboardingCallbackUrl: onboardingCallbackUrl || undefined,
            });

            saved = await this.appRepository.save(app);
        } catch (error) {
            // Compensating action: remove client orphaned by failed app creation
            try {
                await this.clientService.deleteAppClient(this.dataSource.manager, appClient.id);
            } catch (cleanupError) {
                this.logger.warn(`Failed to clean up orphaned client ${appClient.id}: ${cleanupError}`);
            }

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
        }

        // Audit log fires after successful persistence (task 15.2)
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

        // Delete app and client as individual atomic operations to avoid
        // "cannot start a transaction within a transaction" on SQLite.
        await this.appRepository.remove(app);
        if (app.client) {
            try {
                await this.clientService.deleteAppClient(this.dataSource.manager, app.client.id);
            } catch (cleanupError) {
                this.logger.warn(`Failed to delete orphaned client ${app.client.id} after app deletion: ${cleanupError}`);
            }
        }
    }

    async updateApp(permission: Permission, appId: string, name: string, appUrl: string, description?: string, onboardingEnabled?: boolean, onboardingCallbackUrl?: string | null): Promise<App> {
        const app = await this.getAppById(appId);
        permission.isAuthorized(Action.Update, SubjectEnum.TENANT, {id: app.owner.id});

        if (appUrl !== app.appUrl && !isValidRedirectUri(appUrl)) {
            throw new BadRequestException('App URL is not a valid redirect URI');
        }

        // Validate onboardingCallbackUrl if provided (null means clear it)
        if (onboardingCallbackUrl && !isValidRedirectUri(onboardingCallbackUrl)) {
            throw new BadRequestException('Onboarding callback URL is not a valid URI');
        }

        const nameChanged = name !== app.name;
        const appUrlChanged = appUrl !== app.appUrl;
        const descChanged = description !== undefined && description !== app.description;
        const onboardingEnabledChanged = onboardingEnabled !== undefined && onboardingEnabled !== app.onboardingEnabled;
        const onboardingCallbackUrlChanged = onboardingCallbackUrl !== undefined && onboardingCallbackUrl !== app.onboardingCallbackUrl;

        // If only simple fields changed (no cascade needed), update directly
        if (!nameChanged && !appUrlChanged && (descChanged || onboardingEnabledChanged || onboardingCallbackUrlChanged)) {
            if (descChanged) app.description = description;
            if (onboardingEnabledChanged) app.onboardingEnabled = onboardingEnabled!;
            if (onboardingCallbackUrlChanged) app.onboardingCallbackUrl = onboardingCallbackUrl || undefined;
            return this.appRepository.save(app);
        }

        // Update client and app as individual atomic operations to avoid
        // "cannot start a transaction within a transaction" on SQLite.
        if (nameChanged) {
            await this.clientService.updateAppClientName(this.dataSource.manager, app.client.id, name);
        }
        if (appUrlChanged) {
            await this.clientService.replaceSeededRedirectUri(this.dataSource.manager, app.client.id, app.appUrl, appUrl);
        }

        app.name = name;
        app.appUrl = appUrl;
        if (description !== undefined) {
            app.description = description;
        }
        if (onboardingEnabled !== undefined) {
            app.onboardingEnabled = onboardingEnabled;
        }
        if (onboardingCallbackUrl !== undefined) {
            app.onboardingCallbackUrl = onboardingCallbackUrl || undefined;
        }

        return this.appRepository.save(app);
    }

    async publishApp(permission: Permission, appId: string): Promise<App> {
        const app = await this.getAppById(appId);
        permission.isAuthorized(Action.Update, SubjectEnum.TENANT, {id: app.owner.id});
        app.isPublic = true;
        return this.appRepository.save(app);
    }

    /**
     * Fire a dry-run onboard + offboard webhook call against the app's configured URL.
     * Sends X-Webhook-Test: true so the app handler can detect and short-circuit.
     * No subscription, tenant, or user records are created.
     *
     * Authorization: caller must be TENANT_ADMIN of the owning tenant.
     */
    async testWebhook(permission: Permission, appId: string): Promise<TestWebhookResponse> {
        const app = await this.getAppById(appId);
        permission.isAuthorized(Action.Update, SubjectEnum.TENANT, {id: app.owner.id});

        if (!app.onboardingEnabled) {
            return {onboardingEnabled: false, onboard: null, offboard: null};
        }

        const baseUrl = (app.onboardingCallbackUrl || app.appUrl || '').replace(/\/+$/, '');
        if (!baseUrl) {
            return {onboardingEnabled: true, onboard: null, offboard: null};
        }

        // Obtain a technical token for the owner tenant (same as real subscription flow)
        const ownerClient = await this.clientService.findByAlias(app.owner.domain);
        const token = await this.technicalTokenService.createTechnicalAccessToken(ownerClient, []);

        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
            'X-Webhook-Test': 'true',
        };
        const body = JSON.stringify({tenantId: WEBHOOK_TEST_TENANT_ID});

        const onboard = await this.probeEndpoint(`${baseUrl}/api/onboard/tenant`, headers, body);
        const offboard = await this.probeEndpoint(`${baseUrl}/api/offboard/tenant`, headers, body);

        return {onboardingEnabled: true, onboard, offboard};
    }

    private async probeEndpoint(
        url: string,
        headers: Record<string, string>,
        body: string,
    ): Promise<WebhookTestResult> {
        const start = Date.now();
        try {
            const response = await fetch(url, {method: 'POST', headers, body});
            const latencyMs = Date.now() - start;
            let parsedBody: any = null;
            let bodyValid = false;
            try {
                parsedBody = await response.json();
                bodyValid = true;
            } catch {
                bodyValid = false;
            }
            return {
                url,
                status: response.status,
                latencyMs,
                ok: response.ok,
                bodyValid,
                body: parsedBody,
            };
        } catch (err) {
            return {
                url,
                status: null,
                latencyMs: Date.now() - start,
                ok: false,
                error: err instanceof Error ? err.message : String(err),
                bodyValid: false,
            };
        }
    }
}
