import * as path from 'path';
import * as fs from 'fs';
import * as superTest from 'supertest';
import TestAgent from 'supertest/lib/agent';
import { JwtService } from '@nestjs/jwt';
import { SmtpClientAdapter } from './smtp-client-adapter';
import { WebhookClientAdapter } from './webhook-client-adapter';

export interface PortFile {
    appPort: number;
    smtpPort: number;
    smtpControlPort: number;
    webhookPort: number;
}

const REQUIRED_PORT_FIELDS: (keyof PortFile)[] = ['appPort', 'smtpPort', 'smtpControlPort', 'webhookPort'];

/**
 * Reads and validates the port file written by globalSetup.
 * Exported for use in property tests.
 */
export function readPortFile(filePath?: string): PortFile {
    const resolvedPath = filePath ?? path.resolve(__dirname, '../.test-ports.json');

    let raw: string;
    try {
        raw = fs.readFileSync(resolvedPath, 'utf-8');
    } catch {
        throw new Error('Port file not found at srv/.test-ports.json. Did globalSetup run?');
    }

    let parsed: any;
    try {
        parsed = JSON.parse(raw);
    } catch {
        throw new Error('Port file contains invalid JSON');
    }

    for (const field of REQUIRED_PORT_FIELDS) {
        if (parsed[field] === undefined || parsed[field] === null) {
            throw new Error(`Port file missing required field: ${field}`);
        }
    }

    return parsed as PortFile;
}

/**
 * Drop-in replacement for TestAppFixture that connects to the shared
 * global infrastructure over HTTP instead of bootstrapping its own app.
 */
export class SharedTestFixture {
    public readonly smtp: SmtpClientAdapter;
    public readonly webhook: WebhookClientAdapter;
    public readonly nestApp: null = null;

    private readonly _httpAgent: TestAgent<superTest.Test>;
    private readonly _jwtService: JwtService;

    constructor() {
        const ports = readPortFile();

        this._httpAgent = superTest(`http://127.0.0.1:${ports.appPort}`) as TestAgent<superTest.Test>;
        this._jwtService = new JwtService({});
        this.smtp = new SmtpClientAdapter(`http://127.0.0.1:${ports.smtpControlPort}`);
        this.webhook = new WebhookClientAdapter(`http://localhost:${ports.webhookPort}`);
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
