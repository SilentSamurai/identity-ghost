import * as fc from 'fast-check';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {readPortFile} from '../shared-test.fixture';

/**
 * Feature: shared-test-infrastructure, Property 1: Port file round-trip
 *
 * For any valid set of four port numbers (1–65535), writing them to a JSON file
 * and reading them back via readPortFile() should produce the exact same values.
 *
 * Validates: Requirements 3.1
 */
describe('Property 1: Port file round-trip', () => {
    const tmpDir = os.tmpdir();

    it('readPortFile returns the exact port values that were written to JSON', () => {
        fc.assert(
            fc.property(
                fc.integer({min: 1, max: 65535}),
                fc.integer({min: 1, max: 65535}),
                fc.integer({min: 1, max: 65535}),
                fc.integer({min: 1, max: 65535}),
                (appPort, smtpPort, smtpControlPort, webhookPort) => {
                    const tmpFile = path.join(tmpDir, `test-ports-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);

                    try {
                        const portData = {appPort, smtpPort, smtpControlPort, webhookPort};
                        fs.writeFileSync(tmpFile, JSON.stringify(portData), 'utf-8');

                        const result = readPortFile(tmpFile);

                        expect(result.appPort).toBe(appPort);
                        expect(result.smtpPort).toBe(smtpPort);
                        expect(result.smtpControlPort).toBe(smtpControlPort);
                        expect(result.webhookPort).toBe(webhookPort);
                    } finally {
                        if (fs.existsSync(tmpFile)) {
                            fs.unlinkSync(tmpFile);
                        }
                    }
                },
            ),
            {numRuns: 100},
        );
    });
});
