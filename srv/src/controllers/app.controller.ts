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

@Controller('/api/apps')
@UseInterceptors(ClassSerializerInterceptor)
export class AppController {
    constructor(
        private readonly tenantService: TenantService,
        private readonly appService: AppService,
        private readonly subscriptionService: SubscriptionService
    ) {
    }

    @Post("/create")
    @UseGuards(JwtAuthGuard)
    async createApp(
        @CurrentPermission() permission: Permission,
        @Body('tenantId', ParseUUIDPipe) tenantId: string,
        @Body('name', schemaPipe(yup.string().required('name is required').max(128))) name: string,
        @Body('appUrl', schemaPipe(yup.string().required('app url is required').max(2048))) appUrl: string,
        @Body('description', schemaPipe(yup.string().max(128))) description: string
    ) {
        const app = await this.appService.createApp(permission, tenantId, name, appUrl, description);
        return app;
    }

    @Patch('/:appId')
    @UseGuards(JwtAuthGuard)
    async updateApp(
        @CurrentPermission() permission: Permission,
        @Param('appId', ParseUUIDPipe) appId: string,
        @Body('name', schemaPipe(yup.string().required('name is required').max(128))) name: string,
        @Body('appUrl', schemaPipe(yup.string().required('app url is required').max(2048))) appUrl: string,
        @Body('description', schemaPipe(yup.string().max(128))) description: string
    ) {
        const app = await this.appService.updateApp(permission, appId, name, appUrl, description);
        return app;
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

    @Get('/my/created')
    @UseGuards(JwtAuthGuard)
    async getMyAppsCreated(
        @CurrentPermission() permission: Permission,
        @CurrentTenantId() tenantId: string,
    ) {
        return this.appService.findByTenantId(tenantId);
    }

    @Get('/my/available')
    @UseGuards(JwtAuthGuard)
    async getMyAvailableApps(
        @CurrentPermission() permission: Permission,
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
        @CurrentPermission() permission: Permission,
        @Param('appId', ParseUUIDPipe) appId: string
    ) {
        const app = await this.appService.publishApp(permission, appId);
        return app;
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
