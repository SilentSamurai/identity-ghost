import {
    Body,
    ClassSerializerInterceptor,
    Controller,
    Delete,
    Get,
    Param,
    ParseUUIDPipe,
    Patch,
    Post,
    Request,
    UseGuards,
    UseInterceptors
} from '@nestjs/common';

import {SubscriptionService} from '../services/subscription.service';
import {AppService} from "../services/app.service";
import {TenantService} from "../services/tenant.service";
import {AuthContext} from "../casl/contexts";
import {schemaPipe} from "../validation/validation.pipe";
import * as yup from "yup";
import {JwtAuthGuard} from "../auth/jwt-auth.guard";
import {SecurityService} from "../casl/security.service";
import {CurrentTenantId} from "../auth/current-tenant.decorator";

@Controller('/api/apps')
@UseInterceptors(ClassSerializerInterceptor)
export class AppController {
    constructor(
        private readonly securityService: SecurityService,
        private readonly tenantService: TenantService,
        private readonly appService: AppService,
        private readonly subscriptionService: SubscriptionService
    ) {
    }

    @Post("/create")
    @UseGuards(JwtAuthGuard)
    async createApp(
        @Request() request: AuthContext,
        @Body('tenantId', ParseUUIDPipe) tenantId: string,
        @Body('name', schemaPipe(yup.string().required('name is required').max(128))) name: string,
        @Body('appUrl', schemaPipe(yup.string().required('app url is required').max(2048))) appUrl: string,
        @Body('description', schemaPipe(yup.string().max(128))) description: string
    ) {
        const app = await this.appService.createApp(request, tenantId, name, appUrl, description);
        return app;
    }

    @Patch('/:appId')
    @UseGuards(JwtAuthGuard)
    async updateApp(
        @Request() request: AuthContext,
        @Param('appId', ParseUUIDPipe) appId: string,
        @Body('name', schemaPipe(yup.string().required('name is required').max(128))) name: string,
        @Body('appUrl', schemaPipe(yup.string().required('app url is required').max(2048))) appUrl: string,
        @Body('description', schemaPipe(yup.string().max(128))) description: string
    ) {
        const app = await this.appService.updateApp(request, appId, name, appUrl, description);
        return app;
    }

    @Delete('/:appId')
    @UseGuards(JwtAuthGuard)
    async deleteApp(
        @Request() request: AuthContext,
        @Param('appId', ParseUUIDPipe) appId: string
    ) {
        await this.appService.deleteApp(request, appId);
        return {status: 'success'};
    }

    // ─── New token-derived routes (no :tenantId in URL) ───

    @Post('/:appId/my/subscribe')
    @UseGuards(JwtAuthGuard)
    async subscribeMyTenantToApp(
        @Request() request: AuthContext,
        @Param('appId', ParseUUIDPipe) appId: string,
        @CurrentTenantId() tenantId: string,
    ) {
        return this._subscribeToApp(request, appId, tenantId);
    }

    @Post('/:appId/my/unsubscribe')
    @UseGuards(JwtAuthGuard)
    async unsubscribeMyTenantFromApp(
        @Request() request: AuthContext,
        @Param('appId', ParseUUIDPipe) appId: string,
        @CurrentTenantId() tenantId: string,
    ) {
        return this._unsubscribeFromApp(request, appId, tenantId);
    }

    @Get('/my/subscriptions')
    @UseGuards(JwtAuthGuard)
    async getMyTenantSubscriptions(
        @Request() request: AuthContext,
        @CurrentTenantId() tenantId: string,
    ) {
        return this.subscriptionService.findByTenantId(tenantId);
    }

    @Get('/my/created')
    @UseGuards(JwtAuthGuard)
    async getMyAppsCreated(
        @Request() request: AuthContext,
        @CurrentTenantId() tenantId: string,
    ) {
        return this.appService.findByTenantId(tenantId);
    }

    @Get('/my/available')
    @UseGuards(JwtAuthGuard)
    async getMyAvailableApps(
        @Request() request: AuthContext,
        @CurrentTenantId() tenantId: string,
    ) {
        return this.appService.findAllApps(tenantId);
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
        @Request() request: AuthContext,
        @Param('appId', ParseUUIDPipe) appId: string
    ) {
        const app = await this.appService.publishApp(request, appId);
        return app;
    }

    // ─── Shared implementation methods ───

    private async _subscribeToApp(request: AuthContext, appId: string, tenantId: string) {
        await this.subscriptionService.subscribeApp(
            await this.tenantService.findById(request, tenantId),
            await this.appService.getAppById(appId)
        );
        return {status: "success"};
    }

    private async _unsubscribeFromApp(request: AuthContext, appId: string, tenantId: string) {
        await this.subscriptionService.unsubscribe(
            await this.tenantService.findById(request, tenantId),
            await this.appService.getAppById(appId)
        );
        return {status: "success"};
    }
}
