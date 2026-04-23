import * as fc from 'fast-check';
import {ResourceIndicatorValidator} from '../../src/auth/resource-indicator.validator';
import {OAuthException} from '../../src/exceptions/oauth-exception';

/**
 * Feature: resource-indicator-support — Property-Based Tests for Resource URI Validation
 *
 * These tests exercise ResourceIndicatorValidator with randomly generated inputs
 * via fast-check, validating the correctness properties defined in the design document.
 */

// ── Arbitraries ─────────────────────────────────────────────────────────

/**
 * Generates valid absolute URIs with scheme, authority, and no fragment.
 * Per RFC 8707 Section 2, a resource indicator must be an absolute URI
 * that does not include a fragment component.
 */
const validAbsoluteUriArb = fc.tuple(
    fc.constantFrom('http', 'https'),
    fc.domain(),
    fc.option(fc.integer({min: 1, max: 65535}).map(n => n.toString()), {freq: 3}),
    fc.option(fc.webPath().filter(p => p.length > 1), {freq: 5}),
).map(([scheme, domain, port, path]) => {
    let uri = `${scheme}://${domain}`;
    if (port !== null) {
        uri += `:${port}`;
    }
    if (path !== null && path.length > 1) {
        // webPath starts with /, so we can append directly
        uri += path;
    }
    return uri;
});

/**
 * Generates relative URIs (missing scheme or authority).
 * These should be rejected by isValidResourceUri().
 */
const relativeUriArb = fc.oneof(
    // Path-only URIs
    fc.string({minLength: 1, maxLength: 50}).map(s => `/${s}`),
    // Relative paths without leading slash
    fc.string({minLength: 1, maxLength: 50}),
    // Scheme-only (no authority)
    fc.constantFrom('http', 'https').map(s => `${s}:`),
    // Double-slash without scheme
    fc.tuple(fc.domain(), fc.string({minLength: 0, maxLength: 20})).map(([domain, path]) => `//${domain}${path}`),
);

/**
 * Generates URIs with fragment components.
 * These should be rejected by isValidResourceUri().
 */
const uriWithFragmentArb = fc.tuple(
    validAbsoluteUriArb,
    fc.string({minLength: 1, maxLength: 20}),
).map(([uri, fragment]) => `${uri}#${fragment}`);

/**
 * Generates malformed strings that are not valid URIs.
 */
const malformedStringArb = fc.oneof(
    fc.constantFrom('', '   ', 'not a uri', '://missing-scheme.com', 'http://'),
    fc.string({minLength: 0, maxLength: 10}).filter(s => {
        // Filter out strings that happen to be valid URIs
        try {
            const url = new URL(s);
            return false;
        } catch {
            return true;
        }
    }),
);

/**
 * Generates any string that should be rejected as a resource URI.
 */
const invalidResourceUriArb = fc.oneof(
    relativeUriArb,
    uriWithFragmentArb,
    malformedStringArb,
);

/**
 * Generates arrays of resource URIs (for allowedResources lists).
 */
const allowedResourcesArb = fc.array(validAbsoluteUriArb, {minLength: 0, maxLength: 10});

// ── Property 1: Resource URI format validation ──────────────────────────

/**
 * Feature: resource-indicator-support, Property 1: Resource URI format validation
 *
 * For any string input, `isValidResourceUri()` returns true iff the string is an
 * absolute URI (has scheme + authority, no fragment). All other strings are rejected.
 *
 * **Validates: Requirements 1.3, 2.2, 3.2, 5.1, 5.2**
 */
describe('Feature: resource-indicator-support, Property 1: Resource URI format validation', () => {
    it('returns true for valid absolute URIs without fragment', () => {
        fc.assert(
            fc.property(validAbsoluteUriArb, (uri) => {
                const result = ResourceIndicatorValidator.isValidResourceUri(uri);
                expect(result).toBe(true);
            }),
            {numRuns: 100},
        );
    });

    it('returns false for relative URIs (missing scheme or authority)', () => {
        fc.assert(
            fc.property(relativeUriArb, (uri) => {
                const result = ResourceIndicatorValidator.isValidResourceUri(uri);
                expect(result).toBe(false);
            }),
            {numRuns: 100},
        );
    });

    it('returns false for URIs with fragment component', () => {
        fc.assert(
            fc.property(uriWithFragmentArb, (uri) => {
                const result = ResourceIndicatorValidator.isValidResourceUri(uri);
                expect(result).toBe(false);
            }),
            {numRuns: 100},
        );
    });

    it('returns false for malformed strings', () => {
        fc.assert(
            fc.property(malformedStringArb, (uri) => {
                const result = ResourceIndicatorValidator.isValidResourceUri(uri);
                expect(result).toBe(false);
            }),
            {numRuns: 100},
        );
    });

    it('returns false for any invalid resource URI', () => {
        fc.assert(
            fc.property(invalidResourceUriArb, (uri) => {
                const result = ResourceIndicatorValidator.isValidResourceUri(uri);
                expect(result).toBe(false);
            }),
            {numRuns: 100},
        );
    });
});

// ── Property 2: Allowlist exact string matching ─────────────────────────

/**
 * Feature: resource-indicator-support, Property 2: Allowlist exact string matching
 *
 * For any resource string and any allowedResources array, `validateResource()` accepts
 * iff allowedResources is non-null, non-empty, and contains a character-for-character
 * identical entry. When allowedResources is null or empty, any resource is rejected
 * with `invalid_target`.
 *
 * **Validates: Requirements 2.3, 3.3, 5.3, 5.4**
 */
describe('Feature: resource-indicator-support, Property 2: Allowlist exact string matching', () => {
    it('accepts resource when it exactly matches an entry in allowedResources', () => {
        fc.assert(
            fc.property(
                validAbsoluteUriArb,
                allowedResourcesArb,
                (resource, existingResources) => {
                    // Ensure the resource is in the allowed list
                    const allowedResources = [...existingResources, resource];
                    
                    // Should not throw
                    expect(() => {
                        ResourceIndicatorValidator.validateResource(resource, allowedResources);
                    }).not.toThrow();
                },
            ),
            {numRuns: 100},
        );
    });

    it('rejects resource when allowedResources is null', () => {
        fc.assert(
            fc.property(validAbsoluteUriArb, (resource) => {
                expect(() => {
                    ResourceIndicatorValidator.validateResource(resource, null);
                }).toThrow(OAuthException);
                
                try {
                    ResourceIndicatorValidator.validateResource(resource, null);
                } catch (e) {
                    expect((e as OAuthException).errorCode).toBe('invalid_target');
                }
            }),
            {numRuns: 100},
        );
    });

    it('rejects resource when allowedResources is empty', () => {
        fc.assert(
            fc.property(validAbsoluteUriArb, (resource) => {
                expect(() => {
                    ResourceIndicatorValidator.validateResource(resource, []);
                }).toThrow(OAuthException);
                
                try {
                    ResourceIndicatorValidator.validateResource(resource, []);
                } catch (e) {
                    expect((e as OAuthException).errorCode).toBe('invalid_target');
                }
            }),
            {numRuns: 100},
        );
    });

    it('rejects resource when it is not in allowedResources', () => {
        fc.assert(
            fc.property(
                validAbsoluteUriArb,
                allowedResourcesArb.filter(arr => arr.length > 0),
                (resource, allowedResources) => {
                    // Ensure the resource is NOT in the allowed list
                    const filteredResources = allowedResources.filter(r => r !== resource);
                    
                    if (filteredResources.length === 0) {
                        // Skip if filtering resulted in empty array
                        return;
                    }
                    
                    expect(() => {
                        ResourceIndicatorValidator.validateResource(resource, filteredResources);
                    }).toThrow(OAuthException);
                    
                    try {
                        ResourceIndicatorValidator.validateResource(resource, filteredResources);
                    } catch (e) {
                        expect((e as OAuthException).errorCode).toBe('invalid_target');
                    }
                },
            ),
            {numRuns: 100},
        );
    });

    it('rejects resource with case-sensitive matching (no case normalization)', () => {
        fc.assert(
            fc.property(
                validAbsoluteUriArb.filter(uri => uri.toLowerCase() !== uri.toUpperCase()),
                (resource) => {
                    // Create allowedResources with different case
                    const allowedResources = [resource.toUpperCase()];
                    
                    // If the uppercase version is different, it should be rejected
                    if (resource !== resource.toUpperCase()) {
                        expect(() => {
                            ResourceIndicatorValidator.validateResource(resource, allowedResources);
                        }).toThrow(OAuthException);
                    }
                },
            ),
            {numRuns: 100},
        );
    });
});
