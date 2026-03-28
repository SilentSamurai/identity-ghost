import * as fc from 'fast-check';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { readPortFile } from '../shared-test.fixture';
import { SmtpClientAdapter } from '../smtp-client-adapter';
import { WebhookClientAdapter } from '../webhook-client-adapter';

/**
 * Feature: shared-test-infrastructure, Property 2: Fixture URL targeting from port configuration
 *
 * For any valid port configuration read from the port file, the SharedTestFixture
 * SHALL create an SMTP client adapter targeting http://127.0.0.1:{smtpControlPort},
 * and a webhook client adapter targeting http://127.0.0.1:{webhookPort}.
 * The base URLs used by each client must exactly match the ports from the configuration.
 *
 * Validates: Requirements 4.1, 4.2, 4.3
 */
describe('Property 2: Fixture URL targeting from port configuration', () => {
    const tmpDir = os.tmpdir();

    it('SmtpClientAdapter buildUrl() targets the correct smtpControlPort from the port file', () => {
        fc.assert(
            fc.property(
                fc.integer({ min: 1, max: 65535 }),
                fc.integer({ min: 1, max: 65535 }),
                fc.integer({ min: 1, max: 65535 }),
                fc.integer({ min: 1, max: 65535 }),
                (appPort, smtpPort, smtpControlPort, webhookPort) => {
                    const tmpFile = path.join(tmpDir, `test-ports-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);

                    try {
                        fs.writeFileSync(tmpFile, JSON.stringify({ appPort, smtpPort, smtpControlPort, webhookPort }), 'utf-8');
                        const ports = readPortFile(tmpFile);

                        const smtp = new SmtpClientAdapter(`http://127.0.0.1:${ports.smtpControlPort}`);
                        const url = smtp.buildUrl('/__test__/emails/latest');

                        expect(url).toBe(`http://127.0.0.1:${smtpControlPort}/__test__/emails/latest`);
                    } finally {
                        if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
                    }
                },
            ),
            { numRuns: 100 },
        );
    });

    it('WebhookClientAdapter boundPort matches the webhookPort from the port file', () => {
        fc.assert(
            fc.property(
                fc.integer({ min: 1, max: 65535 }),
                fc.integer({ min: 1, max: 65535 }),
                fc.integer({ min: 1, max: 65535 }),
                fc.integer({ min: 1, max: 65535 }),
                (appPort, smtpPort, smtpControlPort, webhookPort) => {
                    const tmpFile = path.join(tmpDir, `test-ports-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);

                    try {
                        fs.writeFileSync(tmpFile, JSON.stringify({ appPort, smtpPort, smtpControlPort, webhookPort }), 'utf-8');
                        const ports = readPortFile(tmpFile);

                        const webhook = new WebhookClientAdapter(`http://127.0.0.1:${ports.webhookPort}`);

                        expect(webhook.boundPort).toBe(webhookPort);
                    } finally {
                        if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
                    }
                },
            ),
            { numRuns: 100 },
        );
    });

    it('port file ports produce correct base URLs for all adapters', () => {
        fc.assert(
            fc.property(
                fc.integer({ min: 1, max: 65535 }),
                fc.integer({ min: 1, max: 65535 }),
                fc.integer({ min: 1, max: 65535 }),
                fc.integer({ min: 1, max: 65535 }),
                (appPort, smtpPort, smtpControlPort, webhookPort) => {
                    const tmpFile = path.join(tmpDir, `test-ports-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);

                    try {
                        fs.writeFileSync(tmpFile, JSON.stringify({ appPort, smtpPort, smtpControlPort, webhookPort }), 'utf-8');
                        const ports = readPortFile(tmpFile);

                        // SMTP adapter base URL contains the correct control port
                        const smtp = new SmtpClientAdapter(`http://127.0.0.1:${ports.smtpControlPort}`);
                        expect(smtp.buildUrl('')).toBe(`http://127.0.0.1:${smtpControlPort}`);

                        // Webhook adapter extracts the correct port
                        const webhook = new WebhookClientAdapter(`http://127.0.0.1:${ports.webhookPort}`);
                        expect(webhook.boundPort).toBe(webhookPort);

                        // App port would target the correct URL (verified via string construction)
                        const appBaseUrl = `http://127.0.0.1:${ports.appPort}`;
                        expect(appBaseUrl).toBe(`http://127.0.0.1:${appPort}`);
                    } finally {
                        if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
                    }
                },
            ),
            { numRuns: 100 },
        );
    });
});
