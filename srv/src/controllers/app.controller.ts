import {
    Body,
    ClassSerializerInterceptor,
    ConflictException,
    Controller,
    Delete,
    ForbiddenException,
    Get,
    NotFoundException,
    Param,
    ParseUUIDPipe,
    Patch,
    Post,
    UseGuards,
    UseInterceptors
} from '@nestjs/common';

import {SubscriptionService} from '../services/subscription.service';
import {AppService} from "../services/app.service";
import {TenantService} from "../services/tenant.service";
import {schemaPipe} from "../validation/validation.pipe";
import * as yup from "yup";
import {JwtAuthGuard} from "../auth/jwt-auth.guard";
import {CurrentPermission, CurrentTenantId, Permission} from "../auth/auth.decorator";
import {SecurityService} from "../casl/security.service";
import {OnboardingService} from "../services/onboarding.service";
import {OnboardCustomerDto, OnboardCustomerSchema} from "../dto/onboard-customer.dto";

@Controller('/api/apps')
@UseInterceptors(ClassSerializerInterceptor)
export class AppController {
    constructor(
        private readonly tenantService: TenantService,
        private readonly appService: AppService,
        private readonly subscriptionService: SubscriptionService,
        private readonly securityService: SecurityService,
        private readonly onboardingService: OnboardingService
    ) {
    }

    private mapAppResponse(app: any): any {
        return {
            id: app.id,
            name: app.name,
            appUrl: app.appUrl,
            description: app.description,
            isPublic: app.isPublic,
            ownerTenantId: app.owner?.id,
            createdAt: app.createdAt,
            clientId: app.client?.clientId,
            alias: app.client?.alias,
            onboardingEnabled: app.onboardingEnabled,
            onboardingCallbackUrl: app.onboardingCallbackUrl,
        };
    }

    private mapAppDetailResponse(app: any): any {
        const base = this.mapAppResponse(app);
        if (app.client) {
            const {clientSecrets, ...safeClient} = app.client;
            base.client = safeClient;
        }
        return base;
    }

    @Post("/create")
    @UseGuards(JwtAuthGuard)
    async createApp(
        @CurrentPermission() permission: Permission,
        @Body('tenantId', ParseUUIDPipe) tenantId: string,
        @Body('name', schemaPipe(yup.string().required('name is required').max(128))) name: string,
        @Body('appUrl', schemaPipe(yup.string().required('app url is required').max(2048))) appUrl: string,
        @Body('description', schemaPipe(yup.string().max(128))) description: string,
        @Body('onboardingEnabled', schemaPipe(yup.boolean().optional())) onboardingEnabled?: boolean,
        @Body('onboardingCallbackUrl', schemaPipe(yup.string().max(2048).nullable().optional())) onboardingCallbackUrl?: string,
    ) {
        const app = await this.appService.createApp(permission, tenantId, name, appUrl, description, onboardingEnabled, onboardingCallbackUrl);
        return this.mapAppResponse(app);
    }

    @Patch('/:appId')
    @UseGuards(JwtAuthGuard)
    async updateApp(
        @CurrentPermission() permission: Permission,
        @Param('appId', ParseUUIDPipe) appId: string,
        @Body('name', schemaPipe(yup.string().required('name is required').max(128))) name: string,
        @Body('appUrl', schemaPipe(yup.string().required('app url is required').max(2048))) appUrl: string,
        @Body('description', schemaPipe(yup.string().max(128))) description: string,
        @Body('onboardingEnabled', schemaPipe(yup.boolean().optional())) onboardingEnabled?: boolean,
        @Body('onboardingCallbackUrl', schemaPipe(yup.string().max(2048).nullable().optional())) onboardingCallbackUrl?: string | null,
    ) {
        const app = await this.appService.updateApp(permission, appId, name, appUrl, description, onboardingEnabled, onboardingCallbackUrl);
        return this.mapAppResponse(app);
    }

    @Delete('/:appId')
    @UseGuards(JwtAuthGuard)
    async deleteApp(
        @CurrentPermission() permission: Permission,
        @Param('appId', ParseUUIDPipe) appId: string
    ) {
        await this.appService.deleteApp(permission, appId);
        return {status: 'success'};
    }

    // ─── New token-derived routes (no :tenantId in URL) ───

    @Post('/:appId/my/subscribe')
    @UseGuards(JwtAuthGuard)
    async subscribeMyTenantToApp(
        @CurrentPermission() permission: Permission,
        @Param('appId', ParseUUIDPipe) appId: string,
        @CurrentTenantId() tenantId: string,
    ) {
        return this._subscribeToApp(permission, appId, tenantId);
    }

    @Post('/:appId/my/unsubscribe')
    @UseGuards(JwtAuthGuard)
    async unsubscribeMyTenantFromApp(
        @CurrentPermission() permission: Permission,
        @Param('appId', ParseUUIDPipe) appId: string,
        @CurrentTenantId() tenantId: string,
    ) {
        return this._unsubscribeFromApp(permission, appId, tenantId);
    }

    @Get('/my/subscriptions')
    @UseGuards(JwtAuthGuard)
    async getMyTenantSubscriptions(
        @CurrentPermission() permission: Permission,
        @CurrentTenantId() tenantId: string,
    ) {
        return this.subscriptionService.findByTenantId(tenantId);
    }

    @Get('/:appId')
    @UseGuards(JwtAuthGuard)
    async getAppDetail(
        @Param('appId', ParseUUIDPipe) appId: string,
    ) {
        const app = await this.appService.getAppById(appId);
        return this.mapAppDetailResponse(app);
    }

    @Get('/my/created')
    @UseGuards(JwtAuthGuard)
    async getMyAppsCreated(
        @CurrentPermission() permission: Permission,
        @CurrentTenantId() tenantId: string,
    ) {
        const apps = await this.appService.findByTenantId(tenantId);
        return apps.map(a => this.mapAppResponse(a));
    }

    @Get('/my/available')
    @UseGuards(JwtAuthGuard)
    async getMyAvailableApps(
        @CurrentPermission() permission: Permission,
        @CurrentTenantId() tenantId: string,
    ) {
        const apps = await this.appService.findAllApps(tenantId);
        return apps.map(a => this.mapAppResponse(a));
    }

    @Get('/subscriptions/:appId')
    @UseGuards(JwtAuthGuard)
    async getAllSubscriptions(
        @Param('appId', ParseUUIDPipe) appId: string
    ) {
        return this.subscriptionService.findAllByAppId(appId);
    }

    @Patch('/:appId/publish')
    @UseGuards(JwtAuthGuard)
    async publishApp(
        @CurrentPermission() permission: Permission,
        @Param('appId', ParseUUIDPipe) appId: string
    ) {
        const app = await this.appService.publishApp(permission, appId);
        return app;
    }

    @Post('/:appId/test-webhook')
    @UseGuards(JwtAuthGuard)
    async testWebhook(
        @CurrentPermission() permission: Permission,
        @Param('appId', ParseUUIDPipe) appId: string,
    ) {
        return this.appService.testWebhook(permission, appId);
    }

    @Post('/:appId/onboard-customer')
    @UseGuards(JwtAuthGuard)
    async onboardCustomer(
        @CurrentPermission() permission: Permission,
        @Param('appId', ParseUUIDPipe) appId: string,
        @Body(schemaPipe(OnboardCustomerSchema)) body: OnboardCustomerDto
    ) {
        // Extract token via SecurityService
        const technicalToken = this.securityService.getTechnicalToken(permission.authContext);
        
        // Get the app with owner relation
        let app;
        try {
            app = await this.appService.getAppById(appId);
        } catch (error) {
            throw new NotFoundException('App not found');
        }
        
        // Verify token is TechnicalToken (client_credentials grant) and belongs to app owner
        if (technicalToken.tenant.id !== app.owner.id) {
            throw new ForbiddenException('Technical token does not belong to app owner');
        }
        
        // Call OnboardingService.onboardCustomer()
        const response = await this.onboardingService.onboardCustomer(
            appId,
            app.owner.id,
            body
        );
        
        return response;
    }

    // ─── Shared implementation methods ───

    private async _subscribeToApp(permission: Permission, appId: string, tenantId: string) {
        await this.subscriptionService.subscribeApp(
            await this.tenantService.findById(permission, tenantId),
            await this.appService.getAppById(appId)
        );
        return {status: "success"};
    }

    private async _unsubscribeFromApp(permission: Permission, appId: string, tenantId: string) {
        await this.subscriptionService.unsubscribe(
            await this.tenantService.findById(permission, tenantId),
            await this.appService.getAppById(appId)
        );
        return {status: "success"};
    }
}
