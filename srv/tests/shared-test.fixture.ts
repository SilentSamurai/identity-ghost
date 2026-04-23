import * as superTest from 'supertest';
import TestAgent from 'supertest/lib/agent';
import {JwtService} from '@nestjs/jwt';
import {SmtpClientAdapter} from './smtp-client-adapter';
import {WebhookClientAdapter} from './webhook-client-adapter';
import {getTestPorts} from './test-ports';

/**
 * Shared test fixture that connects to the global test infrastructure
 * over HTTP instead of bootstrapping its own app.
 */
export class SharedTestFixture {
    public readonly smtp: SmtpClientAdapter;
    public readonly webhook: WebhookClientAdapter;
    public readonly nestApp: null = null;

    private readonly _httpAgent: TestAgent<superTest.Test>;
    private readonly _jwtService: JwtService;

    constructor() {
        const ports = getTestPorts();

        this._httpAgent = superTest(`http://127.0.0.1:${ports.app}`) as TestAgent<superTest.Test>;
        this._jwtService = new JwtService({});
        this.smtp = new SmtpClientAdapter(`http://127.0.0.1:${ports.smtpControl}`);
        this.webhook = new WebhookClientAdapter(`http://localhost:${ports.webhook}`);
    }

    public getHttpServer(): TestAgent<superTest.Test> {
        return this._httpAgent;
    }

    public jwtService(): JwtService {
        return this._jwtService;
    }

    public async close(): Promise<void> {
        // No-op — shared infrastructure lifecycle is managed by globalSetup/globalTeardown
    }
}
