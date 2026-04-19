/**
 * Global test setup for integration tests.
 * 
 * This file sets up the shared test application instance that runs once
 * for all integration tests. It:
 * - Creates a test NestJS application
 * - Starts a fake SMTP server for email testing
 * - Starts a webhook server for subscription testing
 * - Applies the HttpExceptionFilter globally for consistent error handling
 * 
 * The app is reused across all tests for performance (avoids startup overhead).
 */
import * as process from 'node:process';
import * as path from 'path';
import * as fs from 'fs';
import {INestApplication} from '@nestjs/common';
import {Test} from '@nestjs/testing';
import {Environment} from '../src/config/environment.service';
import {AppModule} from '../src/app.module';
import {HttpExceptionFilter} from '../src/exceptions/filter/http-exception.filter';
import {createFakeSmtpServer, FakeSmtpServer} from '../src/mail/FakeSmtpServer';
import {createTenantAppServer, TenantAppServer} from './apps_&_subscription/tenant-app-server';
import {TestUtilsController} from './test-utils.controller';
import {TypeOrmModule} from '@nestjs/typeorm';
import {LoginSession} from '../src/entity/login-session.entity';
import {AuthCode} from '../src/entity/auth_code.entity';
import {User} from '../src/entity/user.entity';
import {CorsOriginService} from '../src/services/cors-origin.service';

declare global {
    var __SHARED_TEST_APP__: INestApplication | undefined;
    var __SHARED_SMTP__: FakeSmtpServer | undefined;
    var __SHARED_WEBHOOK__: TenantAppServer | undefined;
}

export default async function globalSetup(): Promise<void> {
    let smtpServer: FakeSmtpServer | undefined;
    let webhookServer: TenantAppServer | undefined;
    let app: INestApplication | undefined;

    try {
        // 1. Load environment
        process.env.ENV_FILE = './envs/.env.testing';
        process.env.ENABLE_FAKE_SMTP_SERVER = 'false';
        Environment.setup();

        // 2. Start FakeSmtpServer on dynamic ports
        smtpServer = createFakeSmtpServer({port: 0, controlPort: 0});
        await smtpServer.listen();

        // Point the mail transport at the actual bound port
        process.env.MAIL_PORT = String(smtpServer.boundPort);

        // 3. Start TenantAppServer on a dynamic port
        webhookServer = createTenantAppServer({port: 0});
        await webhookServer.listen();

        // 4. Compile and start the NestJS app on a dynamic port
        //    Register TestUtilsController for test-only endpoints (session expiry, auth code lookup)
        const moduleRef = await Test.createTestingModule({
            imports: [AppModule, TypeOrmModule.forFeature([LoginSession, AuthCode, User])],
            controllers: [TestUtilsController],
        }).compile();

        app = moduleRef.createNestApplication();
        app.useGlobalFilters(new HttpExceptionFilter());

        // Enable CORS with dynamic origin validation (mirrors setup.ts)
        if (Environment.get("ENABLE_CORS")) {
            const corsOriginService = app.get(CorsOriginService);
            app.enableCors({
                origin: async (origin, callback) => {
                    if (!origin) {
                        callback(null, true);
                        return;
                    }
                    try {
                        const allowed = await corsOriginService.isAllowedOrigin(origin);
                        callback(null, allowed ? origin : false);
                    } catch (error) {
                        console.warn(`CORS origin validation error for origin "${origin}":`, error);
                        callback(null, false);
                    }
                },
                methods: ['GET', 'POST', 'OPTIONS'],
                allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
                credentials: true,
            });
        }

        await app.listen(0);

        const addr = app.getHttpServer().address();
        const appPort = typeof addr === 'object' ? addr.port : 0;

        // 5. Write port file for worker processes
        const portFilePath = path.resolve(__dirname, '../.test-ports.json');
        const portData = {
            appPort,
            smtpPort: smtpServer.boundPort,
            smtpControlPort: smtpServer.boundControlPort,
            webhookPort: webhookServer.boundPort,
        };
        fs.writeFileSync(portFilePath, JSON.stringify(portData, null, 2));

        // 6. Store references on globalThis for teardown
        globalThis.__SHARED_TEST_APP__ = app;
        globalThis.__SHARED_SMTP__ = smtpServer;
        globalThis.__SHARED_WEBHOOK__ = webhookServer;

        console.log('[globalSetup] Shared test infrastructure started:', portData);
    } catch (error) {
        console.error('[globalSetup] Failed to start shared test infrastructure:', error);

        // Close any already-started servers before re-throwing
        if (app) {
            try {
                await app.close();
            } catch (e) {
                console.error('[globalSetup] Error closing app:', e);
            }
        }
        if (webhookServer) {
            try {
                await webhookServer.close();
            } catch (e) {
                console.error('[globalSetup] Error closing webhook server:', e);
            }
        }
        if (smtpServer) {
            try {
                await smtpServer.close();
            } catch (e) {
                console.error('[globalSetup] Error closing SMTP server:', e);
            }
        }

        throw error;
    }
}
