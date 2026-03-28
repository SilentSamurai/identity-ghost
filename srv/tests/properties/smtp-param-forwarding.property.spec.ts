import * as fc from 'fast-check';
import * as http from 'http';
import { SmtpClientAdapter } from '../smtp-client-adapter';

/**
 * Feature: shared-test-infrastructure, Property 3: SMTP search parameter forwarding
 *
 * For any combination of SMTP search parameters (to, subject, timeoutMs),
 * the SmtpClientAdapter SHALL include all provided parameters as query string
 * values in the HTTP request to the control API, and omit parameters that
 * were not provided.
 *
 * Validates: Requirements 5.4
 */
describe('Property 3: SMTP search parameter forwarding', () => {
    it('getLatestEmail forwards all provided params and omits absent ones', async () => {
        await fc.assert(
            fc.asyncProperty(
                fc.record(
                    {
                        to: fc.emailAddress(),
                        subject: fc.string({ minLength: 1, maxLength: 50 }),
                        timeoutMs: fc.integer({ min: 0, max: 60000 }),
                    },
                    { requiredKeys: [] },
                ),
                async (params) => {
                    let capturedUrl = '';

                    // Tiny HTTP server that captures the request URL
                    const server = http.createServer((req, res) => {
                        capturedUrl = req.url || '';
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({
                            subject: 'test',
                            to: {},
                            from: {},
                            links: [],
                            paths: [],
                        }));
                    });

                    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
                    const port = (server.address() as any).port;

                    try {
                        const adapter = new SmtpClientAdapter(`http://127.0.0.1:${port}`);
                        const callParams: { to?: string; subject?: string; timeoutMs?: number } = {};
                        if (params.to !== undefined) callParams.to = params.to;
                        if (params.subject !== undefined) callParams.subject = params.subject;
                        if (params.timeoutMs !== undefined) callParams.timeoutMs = params.timeoutMs;

                        const hasAnyParam = Object.keys(callParams).length > 0;
                        await adapter.getLatestEmail(hasAnyParam ? callParams : undefined);

                        // Parse the captured URL's query string
                        const url = new URL(capturedUrl, `http://127.0.0.1:${port}`);
                        const qs = url.searchParams;

                        // Provided params must be present with correct values
                        if (params.to !== undefined) {
                            expect(qs.get('to')).toBe(params.to);
                        } else {
                            expect(qs.has('to')).toBe(false);
                        }

                        if (params.subject !== undefined) {
                            expect(qs.get('subject')).toBe(params.subject);
                        } else {
                            expect(qs.has('subject')).toBe(false);
                        }

                        if (params.timeoutMs !== undefined) {
                            expect(qs.get('timeoutMs')).toBe(String(params.timeoutMs));
                        } else {
                            expect(qs.has('timeoutMs')).toBe(false);
                        }

                        // No extra params beyond the ones we provided
                        const expectedKeys = new Set<string>();
                        if (params.to !== undefined) expectedKeys.add('to');
                        if (params.subject !== undefined) expectedKeys.add('subject');
                        if (params.timeoutMs !== undefined) expectedKeys.add('timeoutMs');

                        const actualKeys = new Set(qs.keys());
                        expect(actualKeys).toEqual(expectedKeys);
                    } finally {
                        await new Promise<void>((resolve) => server.close(() => resolve()));
                    }
                },
            ),
            { numRuns: 100 },
        );
    });
});
