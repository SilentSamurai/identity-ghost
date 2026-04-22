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
 *
 * If a previous test run was killed without teardown (e.g. double Ctrl+C),
 * stale ports are cleaned up automatically before starting new servers.
 */
import * as process from 'node:process';
import * as path from 'path';
import * as fs from 'fs';
import {execSync} from 'child_process';
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

/**
 * Kill any process listening on the given port.
 * Works on Windows (netstat + taskkill) and Unix (lsof + kill).
 * Silently ignores errors — the port may already be free.
 */
function killPort(port: number): void {
    try {
        if (process.platform === 'win32') {
            // Find PIDs listening on the port via netstat
            const output = execSync(
                `netstat -ano | findstr "LISTENING" | findstr ":${port} "`,
                {encoding: 'utf-8', timeout: 5000},
            );
            const pids = new Set<string>();
            for (const line of output.trim().split('\n')) {
                const pid = line.trim().split(/\s+/).pop();
                if (pid && pid !== '0') pids.add(pid);
            }
            for (const pid of pids) {
                try {
                    execSync(`taskkill /F /PID ${pid}`, {timeout: 5000});
                    console.log(`[globalSetup] Killed stale process PID ${pid} on port ${port}`);
                } catch { /* already dead */ }
            }
        } else {
            execSync(`lsof -ti :${port} | xargs kill -9`, {timeout: 5000});
            console.log(`[globalSetup] Killed stale process on port ${port}`);
        }
    } catch {
        // Nothing listening on this port — that's fine
    }
}

/**
 * If a previous test run was killed without teardown, a stale .test-ports.json
 * will still exist. Read it, kill anything on those ports, and delete the file.
 */
function cleanupStalePorts(): void {
    const portFilePath = path.resolve(__dirname, '../.test-ports.json');
    if (!fs.existsSync(portFilePath)) return;

    console.log('[globalSetup] Found stale .test-ports.json — cleaning up leftover ports...');
    try {
        const raw = fs.readFileSync(portFilePath, 'utf-8');
        const ports = JSON.parse(raw);
        const portValues: number[] = Object.values(ports).filter(
            (v): v is number => typeof v === 'number' && v > 0,
        );
        for (const port of portValues) {
            killPort(port);
        }
    } catch (error) {
        console.warn('[globalSetup] Could not parse stale port file:', error);
    }
    try {
        fs.unlinkSync(portFilePath);
        console.log('[globalSetup] Deleted stale .test-ports.json');
    } catch { /* ignore */ }
}

export default async function globalSetup(): Promise<void> {
    // Clean up ports from a previously killed test run
    cleanupStalePorts();

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
