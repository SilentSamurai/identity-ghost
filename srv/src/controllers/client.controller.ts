import {
    Body,
    ClassSerializerInterceptor,
    Controller,
    Delete,
    Get,
    Param,
    Patch,
    Post,
    Request,
    UseGuards,
    UseInterceptors,
} from '@nestjs/common';
import {JwtAuthGuard} from '../auth/jwt-auth.guard';
import {ClientService} from '../services/client.service';
import {SecurityService} from '../casl/security.service';
import {AuthContext} from '../casl/contexts';
import {schemaPipe} from '../validation/validation.pipe';
import {CurrentTenantId} from '../auth/current-tenant.decorator';
import * as yup from 'yup';

const CreateClientSchema = yup.object().shape({
    tenantId: yup.string().uuid('tenantId must be a valid UUID').required('tenantId is required'),
    name: yup.string().required('name is required').max(128),
    redirectUris: yup.array().of(yup.string().url('each redirectUri must be a valid URL')).default([]),
    allowedScopes: yup.string().max(1024),
    grantTypes: yup.string().max(256),
    responseTypes: yup.string().max(256),
    tokenEndpointAuthMethod: yup.string().max(64),
    isPublic: yup.boolean(),
    requirePkce: yup.boolean(),
    allowPasswordGrant: yup.boolean(),
    allowRefreshToken: yup.boolean(),
});

const UpdateClientSchema = yup.object().shape({
    name: yup.string().max(128),
    redirectUris: yup.array().of(yup.string().url('each redirectUri must be a valid URL')),
    requirePkce: yup.boolean(),
    allowPasswordGrant: yup.boolean(),
    allowRefreshToken: yup.boolean(),
});

@Controller('/api/clients')
@UseInterceptors(ClassSerializerInterceptor)
export class ClientController {
    constructor(
        private readonly clientService: ClientService,
        private readonly securityService: SecurityService,
    ) {
    }

    @Post('/create')
    @UseGuards(JwtAuthGuard)
    async createClient(
        @Request() request: AuthContext,
        @Body(schemaPipe(CreateClientSchema)) body: {
            tenantId: string;
            name: string;
            redirectUris?: string[];
            allowedScopes?: string;
            grantTypes?: string;
            responseTypes?: string;
            tokenEndpointAuthMethod?: string;
            isPublic?: boolean;
            requirePkce?: boolean;
            allowPasswordGrant?: boolean;
            allowRefreshToken?: boolean;
        },
    ) {
        const result = await this.clientService.createClient(
            request,
            body.tenantId,
            body.name,
            body.redirectUris || [],
            body.allowedScopes,
            body.grantTypes,
            body.responseTypes,
            body.tokenEndpointAuthMethod,
            body.isPublic,
            body.requirePkce,
            body.allowPasswordGrant,
            body.allowRefreshToken,
        );
        return {
            client: result.client,
            clientSecret: result.plainSecret,
        };
    }

    // ─── New token-derived route ───

    @Get('/my/clients')
    @UseGuards(JwtAuthGuard)
    async getMyClients(
        @Request() request: AuthContext,
        @CurrentTenantId() tenantId: string,
    ) {
        return this.clientService.findByTenantId(tenantId);
    }

    @Get('/:clientId')
    @UseGuards(JwtAuthGuard)
    async getClient(
        @Request() request: AuthContext,
        @Param('clientId') clientId: string,
    ) {
        return this.clientService.findByClientId(clientId);
    }

    @Post('/:clientId/rotate-secret')
    @UseGuards(JwtAuthGuard)
    async rotateSecret(
        @Request() request: AuthContext,
        @Param('clientId') clientId: string,
    ) {
        const result = await this.clientService.rotateSecret(clientId);
        return {
            client: result.client,
            clientSecret: result.plainSecret,
        };
    }

    @Patch('/:clientId')
    @UseGuards(JwtAuthGuard)
    async updateClient(
        @Request() request: AuthContext,
        @Param('clientId') clientId: string,
        @Body(schemaPipe(UpdateClientSchema)) body: {
            name?: string;
            redirectUris?: string[];
            requirePkce?: boolean;
            allowPasswordGrant?: boolean;
            allowRefreshToken?: boolean;
        },
    ) {
        return this.clientService.updateClient(request, clientId, body);
    }

    @Delete('/:clientId')
    @UseGuards(JwtAuthGuard)
    async deleteClient(
        @Request() request: AuthContext,
        @Param('clientId') clientId: string,
    ) {
        await this.clientService.deleteClient(request, clientId);
        return {status: 'success'};
    }
}
