import * as fc from 'fast-check';
import {CorsOriginService} from '../../src/services/cors-origin.service';

/**
 * Feature: cors-origin-restriction, Property 2: Origin extraction preserves URI components
 *
 * For any valid redirect URI with a scheme (http or https), a host, an optional non-default port,
 * and an arbitrary path, extractOrigin SHALL return a string equal to scheme://host[:port]
 * where port is included only when it differs from the scheme's default (80 for http, 443 for https).
 *
 * Validates: Requirements 4.1
 */
describe('Property 2: Origin extraction preserves URI components', () => {
    // Arbitrary for scheme (http or https)
    const schemeArb = fc.constantFrom('http', 'https');

    // Arbitrary for hostname (alphanumeric with dots)
    const hostnameArb = fc.oneof(
        fc.constantFrom('localhost', 'example.com', 'app.example.com', 'sub.domain.example.org'),
        fc.domain(),
    );

    // Arbitrary for port (optional, non-default)
    // For http: default is 80, so non-default is anything else
    // For https: default is 443, so non-default is anything else
    const portArb = fc.option(
        fc.integer({min: 1, max: 65535}).filter(p => p !== 80 && p !== 443),
        {nil: null},
    );

    // Arbitrary for path (including query and fragment)
    const pathArb = fc.oneof(
        fc.constantFrom('', '/', '/callback', '/auth/callback', '/silent-renew'),
        fc.string({minLength: 1, maxLength: 50}).map(s => '/' + s),
    );

    it('extractOrigin returns scheme://host[:port] for valid URIs', () => {
        fc.assert(
            fc.property(
                schemeArb,
                hostnameArb,
                portArb,
                pathArb,
                (scheme, host, port, path) => {
                    // Build the full URI
                    const portPart = port !== null ? `:${port}` : '';
                    const uri = `${scheme}://${host}${portPart}${path}`;

                    // Extract origin
                    const origin = CorsOriginService.extractOrigin(uri);

                    // Expected origin (URL.origin includes port only if non-default)
                    const expectedOrigin = port !== null
                        ? `${scheme}://${host}:${port}`
                        : `${scheme}://${host}`;

                    expect(origin).toBe(expectedOrigin);
                },
            ),
            {numRuns: 100},
        );
    });

    it('extractOrigin omits default ports (80 for http, 443 for https)', () => {
        fc.assert(
            fc.property(
                schemeArb,
                hostnameArb,
                pathArb,
                (scheme, host, path) => {
                    // Use default port for the scheme
                    const defaultPort = scheme === 'http' ? 80 : 443;
                    const uri = `${scheme}://${host}:${defaultPort}${path}`;

                    const origin = CorsOriginService.extractOrigin(uri);

                    // Expected origin should NOT include the default port
                    const expectedOrigin = `${scheme}://${host}`;

                    expect(origin).toBe(expectedOrigin);
                },
            ),
            {numRuns: 100},
        );
    });

    it('extractOrigin includes non-default ports', () => {
        fc.assert(
            fc.property(
                schemeArb,
                hostnameArb,
                fc.integer({min: 1, max: 65535}).filter(p => p !== 80 && p !== 443),
                pathArb,
                (scheme, host, port, path) => {
                    const uri = `${scheme}://${host}:${port}${path}`;

                    const origin = CorsOriginService.extractOrigin(uri);

                    // Expected origin should include the non-default port
                    const expectedOrigin = `${scheme}://${host}:${port}`;

                    expect(origin).toBe(expectedOrigin);
                },
            ),
            {numRuns: 100},
        );
    });
});

/**
 * Feature: cors-origin-restriction, Property 3: Malformed URI resilience
 *
 * For any string that is not a valid URI (missing scheme, invalid characters, empty string),
 * extractOrigin SHALL return null without throwing an exception.
 *
 * Validates: Requirements 4.5
 */
describe('Property 3: Malformed URI resilience', () => {
    it('extractOrigin returns null for empty string', () => {
        const result = CorsOriginService.extractOrigin('');
        expect(result).toBeNull();
    });

    it('extractOrigin returns null for URIs with missing scheme', () => {
        fc.assert(
            fc.property(
                fc.domain(),
                fc.string({minLength: 1, maxLength: 50}),
                (domain, path) => {
                    const malformedUri = `${domain}/${path}`;
                    const result = CorsOriginService.extractOrigin(malformedUri);
                    expect(result).toBeNull();
                },
            ),
            {numRuns: 100},
        );
    });

    it('extractOrigin does not throw for any string input', () => {
        fc.assert(
            fc.property(
                fc.string({minLength: 0, maxLength: 100}),
                (randomString: string) => {
                    // Should not throw for any string input
                    expect(() => {
                        CorsOriginService.extractOrigin(randomString);
                    }).not.toThrow();
                },
            ),
            {numRuns: 100},
        );
    });
});
