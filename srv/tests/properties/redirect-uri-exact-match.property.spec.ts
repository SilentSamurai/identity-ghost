import * as fc from 'fast-check';
import { AuthorizeService } from '../../src/auth/authorize.service';
import { Client } from '../../src/entity/client.entity';
import { OAuthException } from '../../src/exceptions/oauth-exception';

/**
 * Feature: redirect-uri-validation, Property 1: Redirect URI validation accepts iff URI is in registered set
 *
 * For any Client with a set of registered redirect URIs and for any redirect_uri string,
 * the validateRedirectUri function SHALL accept the URI if and only if it is an exact
 * member of the client's registered URI set.
 *
 * Validates: Requirements 1.1, 1.2, 2.1, 2.2
 */
describe('Feature: redirect-uri-validation, Property 1: Redirect URI validation accepts iff URI is in registered set', () => {
    // Instantiate AuthorizeService with null deps — validateRedirectUri is pure and doesn't use them
    const service = new AuthorizeService(null as any, null as any);

    // Generator: arbitrary URI-like strings for redirect URIs
    const uriArb = fc.oneof(
        fc.webUrl(),
        fc.string({ minLength: 1, maxLength: 200 }),
    );

    // Generator: a non-empty array of unique URI strings (the registered set)
    const registeredUrisArb = fc.uniqueArray(uriArb, { minLength: 1, maxLength: 10 });

    // Build a minimal Client object with the given redirectUris
    function makeClient(redirectUris: string[]): Client {
        const client = new Client();
        client.redirectUris = redirectUris;
        return client;
    }

    it('accepts a redirect_uri that is in the registered set and returns it unchanged', () => {
        fc.assert(
            fc.property(
                registeredUrisArb,
                fc.nat({ max: 9 }),
                (registeredUris, indexRaw) => {
                    // Pick a URI from the registered set using modular index
                    const chosenUri = registeredUris[indexRaw % registeredUris.length];
                    const client = makeClient(registeredUris);
                    const result = service.validateRedirectUri(client, chosenUri);
                    expect(result).toEqual(chosenUri);
                },
            ),
            { numRuns: 200 },
        );
    });

    it('rejects a redirect_uri that is NOT in the registered set with invalid_request', () => {
        fc.assert(
            fc.property(
                registeredUrisArb,
                uriArb,
                (registeredUris, candidateUri) => {
                    // Only test when the candidate is NOT in the registered set
                    fc.pre(!registeredUris.includes(candidateUri));

                    const client = makeClient(registeredUris);
                    expect(() => service.validateRedirectUri(client, candidateUri)).toThrow(OAuthException);
                    try {
                        service.validateRedirectUri(client, candidateUri);
                    } catch (e) {
                        expect((e as OAuthException).errorCode).toEqual('invalid_request');
                    }
                },
            ),
            { numRuns: 200 },
        );
    });

    it('biconditional: validateRedirectUri succeeds iff uri is in client.redirectUris', () => {
        fc.assert(
            fc.property(
                registeredUrisArb,
                uriArb,
                (registeredUris, candidateUri) => {
                    const client = makeClient(registeredUris);
                    const isInSet = registeredUris.includes(candidateUri);

                    let accepted: boolean;
                    let returnedUri: string | undefined;
                    try {
                        returnedUri = service.validateRedirectUri(client, candidateUri);
                        accepted = true;
                    } catch {
                        accepted = false;
                    }

                    // Biconditional: accepted ↔ isInSet
                    expect(accepted).toEqual(isInSet);

                    // When accepted, the returned URI must be the exact input
                    if (accepted) {
                        expect(returnedUri).toEqual(candidateUri);
                    }
                },
            ),
            { numRuns: 200 },
        );
    });
});

/**
 * Feature: redirect-uri-validation, Property 2: Omitted redirect_uri resolves correctly based on registered URI count
 *
 * For any Client with N registered redirect URIs where the redirect_uri parameter is omitted:
 * if N = 1, the validation SHALL return that single registered URI;
 * if N = 0 or N > 1, the validation SHALL reject with `invalid_request`.
 *
 * Validates: Requirements 1.3, 1.4, 1.5
 */
describe('Feature: redirect-uri-validation, Property 2: Omitted redirect_uri resolves correctly based on registered URI count', () => {
    const service = new AuthorizeService(null as any, null as any);

    // Generator: arbitrary URI-like strings
    const uriArb = fc.oneof(
        fc.webUrl(),
        fc.string({ minLength: 1, maxLength: 200 }),
    );

    function makeClient(redirectUris: string[]): Client {
        const client = new Client();
        client.redirectUris = redirectUris;
        return client;
    }

    it('returns the single registered URI when client has exactly one and redirect_uri is omitted', () => {
        fc.assert(
            fc.property(
                uriArb,
                (singleUri) => {
                    const client = makeClient([singleUri]);
                    const result = service.validateRedirectUri(client, undefined);
                    expect(result).toEqual(singleUri);
                },
            ),
            { numRuns: 200 },
        );
    });

    it('throws invalid_request when client has zero registered URIs and redirect_uri is omitted', () => {
        const client = makeClient([]);
        expect(() => service.validateRedirectUri(client, undefined)).toThrow(OAuthException);
        try {
            service.validateRedirectUri(client, undefined);
        } catch (e) {
            expect((e as OAuthException).errorCode).toEqual('invalid_request');
        }
    });

    it('throws invalid_request when client has more than one registered URI and redirect_uri is omitted', () => {
        fc.assert(
            fc.property(
                fc.uniqueArray(uriArb, { minLength: 2, maxLength: 10 }),
                (registeredUris) => {
                    const client = makeClient(registeredUris);
                    expect(() => service.validateRedirectUri(client, undefined)).toThrow(OAuthException);
                    try {
                        service.validateRedirectUri(client, undefined);
                    } catch (e) {
                        expect((e as OAuthException).errorCode).toEqual('invalid_request');
                    }
                },
            ),
            { numRuns: 200 },
        );
    });

    it('biconditional: omitted redirect_uri succeeds iff client has exactly one registered URI', () => {
        fc.assert(
            fc.property(
                fc.uniqueArray(uriArb, { minLength: 0, maxLength: 10 }),
                (registeredUris) => {
                    const client = makeClient(registeredUris);
                    const hasExactlyOne = registeredUris.length === 1;

                    let accepted: boolean;
                    let returnedUri: string | undefined;
                    try {
                        returnedUri = service.validateRedirectUri(client, undefined);
                        accepted = true;
                    } catch {
                        accepted = false;
                    }

                    // Biconditional: accepted ↔ exactly one registered URI
                    expect(accepted).toEqual(hasExactlyOne);

                    // When accepted, the returned URI must be the single registered URI
                    if (accepted) {
                        expect(returnedUri).toEqual(registeredUris[0]);
                    }
                },
            ),
            { numRuns: 200 },
        );
    });
});

/**
 * Feature: redirect-uri-validation, Property 7: No URI normalization — textually different URIs are always non-matching
 *
 * For any registered redirect URI and for any transformation that changes the string
 * representation while preserving semantic equivalence (case change, trailing slash
 * addition/removal, percent-encoding variation, query parameter reordering), the
 * transformed URI SHALL be rejected as non-matching.
 *
 * Validates: Requirements 6.1, 6.2
 */
describe('Feature: redirect-uri-validation, Property 7: No URI normalization — textually different URIs are always non-matching', () => {
    const service = new AuthorizeService(null as any, null as any);

    function makeClient(redirectUris: string[]): Client {
        const client = new Client();
        client.redirectUris = redirectUris;
        return client;
    }

    // --- Semantic-preserving transformations ---

    /** Change scheme and/or host to uppercase (semantically equivalent per RFC 3986 §3.1, §3.2.2) */
    function applyCaseChange(uri: string): string {
        try {
            const url = new URL(uri);
            // Uppercase the scheme portion and host
            return uri.replace(url.protocol, url.protocol.toUpperCase())
                      .replace(url.hostname, url.hostname.toUpperCase());
        } catch {
            // Fallback: just uppercase the whole thing
            return uri.toUpperCase();
        }
    }

    /** Toggle trailing slash on the path */
    function toggleTrailingSlash(uri: string): string {
        try {
            const url = new URL(uri);
            if (url.pathname.endsWith('/') && url.pathname.length > 1) {
                url.pathname = url.pathname.slice(0, -1);
            } else {
                url.pathname = url.pathname + '/';
            }
            return url.toString();
        } catch {
            return uri.endsWith('/') ? uri.slice(0, -1) : uri + '/';
        }
    }

    /** Percent-encode a character that doesn't need encoding (e.g., 'a' → '%61') */
    function addUnnecessaryPercentEncoding(uri: string): string {
        // Find the first lowercase letter in the path portion and percent-encode it
        try {
            const url = new URL(uri);
            const path = url.pathname;
            for (let i = 0; i < path.length; i++) {
                const ch = path[i];
                if (/[a-z]/.test(ch)) {
                    const encoded = '%' + ch.charCodeAt(0).toString(16).toUpperCase();
                    url.pathname = path.substring(0, i) + encoded + path.substring(i + 1);
                    return url.toString();
                }
            }
            // No lowercase letter in path — encode in the host
            const host = url.hostname;
            for (let i = 0; i < host.length; i++) {
                const ch = host[i];
                if (/[a-z]/.test(ch)) {
                    const encoded = '%' + ch.charCodeAt(0).toString(16).toUpperCase();
                    // Manually replace in the full URI string since URL object normalizes host
                    return uri.replace(host, host.substring(0, i) + encoded + host.substring(i + 1));
                }
            }
        } catch {
            // Non-URL string: encode first lowercase letter
            for (let i = 0; i < uri.length; i++) {
                const ch = uri[i];
                if (/[a-z]/.test(ch)) {
                    const encoded = '%' + ch.charCodeAt(0).toString(16).toUpperCase();
                    return uri.substring(0, i) + encoded + uri.substring(i + 1);
                }
            }
        }
        // Last resort: just append a percent-encoded 'a'
        return uri + '%61';
    }

    /** Reorder query parameters (semantically equivalent for most servers) */
    function reorderQueryParams(uri: string): string {
        try {
            const url = new URL(uri);
            const params = Array.from(url.searchParams.entries());
            if (params.length < 2) {
                // Can't reorder with fewer than 2 params — add a no-op reversal marker
                return uri;
            }
            // Reverse the parameter order
            url.search = '';
            for (const [key, value] of params.reverse()) {
                url.searchParams.append(key, value);
            }
            return url.toString();
        } catch {
            return uri;
        }
    }

    // Transformation descriptor: name + function
    const transformations: Array<{ name: string; fn: (uri: string) => string }> = [
        { name: 'case change', fn: applyCaseChange },
        { name: 'trailing slash toggle', fn: toggleTrailingSlash },
        { name: 'unnecessary percent-encoding', fn: addUnnecessaryPercentEncoding },
        { name: 'query param reorder', fn: reorderQueryParams },
    ];

    // Generator: well-formed web URLs that give transformations something to work with
    const baseUriArb = fc.oneof(
        fc.webUrl(),
        fc.webUrl().map(url => url + '?foo=1&bar=2'),           // URL with query params
        fc.webUrl().map(url => url + '/somepath'),               // URL with a path segment
        fc.webUrl().map(url => url + '/path?a=1&b=2&c=3'),      // URL with path + query
    );

    // Generator: pick a transformation index
    const transformIndexArb = fc.nat({ max: transformations.length - 1 });

    it('rejects semantically equivalent but textually different URIs (all transformations)', () => {
        fc.assert(
            fc.property(
                baseUriArb,
                transformIndexArb,
                (registeredUri, transformIdx) => {
                    const transformation = transformations[transformIdx];
                    const transformedUri = transformation.fn(registeredUri);

                    // Only test when the transformation actually changed the string
                    fc.pre(transformedUri !== registeredUri);

                    const client = makeClient([registeredUri]);

                    // The transformed URI must be rejected — no normalization
                    expect(() => service.validateRedirectUri(client, transformedUri)).toThrow(OAuthException);
                    try {
                        service.validateRedirectUri(client, transformedUri);
                    } catch (e) {
                        expect((e as OAuthException).errorCode).toEqual('invalid_request');
                    }
                },
            ),
            { numRuns: 200 },
        );
    });

    it('case-changed URIs are always rejected', () => {
        fc.assert(
            fc.property(
                baseUriArb,
                (registeredUri) => {
                    const transformed = applyCaseChange(registeredUri);
                    fc.pre(transformed !== registeredUri);

                    const client = makeClient([registeredUri]);
                    expect(() => service.validateRedirectUri(client, transformed)).toThrow(OAuthException);
                },
            ),
            { numRuns: 200 },
        );
    });

    it('trailing slash toggled URIs are always rejected', () => {
        fc.assert(
            fc.property(
                baseUriArb,
                (registeredUri) => {
                    const transformed = toggleTrailingSlash(registeredUri);
                    fc.pre(transformed !== registeredUri);

                    const client = makeClient([registeredUri]);
                    expect(() => service.validateRedirectUri(client, transformed)).toThrow(OAuthException);
                },
            ),
            { numRuns: 200 },
        );
    });

    it('percent-encoding variation URIs are always rejected', () => {
        fc.assert(
            fc.property(
                baseUriArb,
                (registeredUri) => {
                    const transformed = addUnnecessaryPercentEncoding(registeredUri);
                    fc.pre(transformed !== registeredUri);

                    const client = makeClient([registeredUri]);
                    expect(() => service.validateRedirectUri(client, transformed)).toThrow(OAuthException);
                },
            ),
            { numRuns: 200 },
        );
    });

    it('query parameter reordered URIs are always rejected', () => {
        fc.assert(
            fc.property(
                // Use URIs that have at least 2 query params so reordering is meaningful
                fc.webUrl().map(url => url + '?alpha=1&beta=2'),
                (registeredUri) => {
                    const transformed = reorderQueryParams(registeredUri);
                    fc.pre(transformed !== registeredUri);

                    const client = makeClient([registeredUri]);
                    expect(() => service.validateRedirectUri(client, transformed)).toThrow(OAuthException);
                },
            ),
            { numRuns: 200 },
        );
    });
});
