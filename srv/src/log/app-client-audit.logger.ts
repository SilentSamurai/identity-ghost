import {Injectable, Logger} from '@nestjs/common';

@Injectable()
export class AppClientAuditLogger {
    private readonly logger = new Logger('AppClientAudit');

    logCreated(event: {
        appId: string;
        appName: string;
        ownerTenantId: string;
        clientId: string;
        alias: string;
        actorId: string;
        correlationId: string;
    }): void {
        this.logger.log(`App_Client created: appId=${event.appId}, appName=${event.appName}, ownerTenantId=${event.ownerTenantId}, clientId=${event.clientId}, alias=${event.alias}, actorId=${event.actorId}, correlationId=${event.correlationId}`);
    }

    logCreateFailed(event: {
        appId?: string;
        appName?: string;
        ownerTenantId?: string;
        reason: 'validation_failed' | 'duplicate_alias' | 'app_not_found' | 'persistence_error' | 'unauthorized';
        actorId: string;
        correlationId: string;
    }): void {
        this.logger.error(`App_Client creation failed: appId=${event.appId || 'N/A'}, appName=${event.appName || 'N/A'}, ownerTenantId=${event.ownerTenantId || 'N/A'}, reason=${event.reason}, actorId=${event.actorId}, correlationId=${event.correlationId}`);
    }

    logAuthorizeResolved(event: {
        appId: string;
        clientId: string;
        alias: string;
        userId: string | 'unauthenticated';
        correlationId: string;
    }): void {
        this.logger.log(`Authorize resolved to App_Client: appId=${event.appId}, clientId=${event.clientId}, alias=${event.alias}, userId=${event.userId}, correlationId=${event.correlationId}`);
    }
}
