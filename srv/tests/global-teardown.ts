import {INestApplication} from '@nestjs/common';
import {FakeSmtpServer} from '../src/mail/FakeSmtpServer';
import {TenantAppServer} from './apps_&_subscription/tenant-app-server';

declare global {
    var __SHARED_TEST_APP__: INestApplication | undefined;
    var __SHARED_SMTP__: FakeSmtpServer | undefined;
    var __SHARED_WEBHOOK__: TenantAppServer | undefined;
}

export default async function globalTeardown(): Promise<void> {
    const app = globalThis.__SHARED_TEST_APP__;
    const smtpServer = globalThis.__SHARED_SMTP__;
    const webhookServer = globalThis.__SHARED_WEBHOOK__;

    if (app) {
        try {
            await app.close();
            console.log('[globalTeardown] NestJS app closed');
        } catch (error) {
            console.error('[globalTeardown] Error closing NestJS app:', error);
        }
    }

    if (smtpServer) {
        try {
            await smtpServer.close();
            console.log('[globalTeardown] FakeSmtpServer closed');
        } catch (error) {
            console.error('[globalTeardown] Error closing FakeSmtpServer:', error);
        }
    }

    if (webhookServer) {
        try {
            await webhookServer.close();
            console.log('[globalTeardown] TenantAppServer closed');
        } catch (error) {
            console.error('[globalTeardown] Error closing TenantAppServer:', error);
        }
    }
}
