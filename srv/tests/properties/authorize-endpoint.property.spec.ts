import * as fc from 'fast-check';
import {SharedTestFixture} from '../shared-test.fixture';
import {TokenFixture} from '../token.fixture';
import {ClientEntityClient} from '../api-client/client-entity-client';
import {TenantClient} from '../api-client/tenant-client';

/**
 * Feature: authorize-endpoint, Property 1: Invalid response_type rejection
 *
 * For any string value that is not "code", when used as the response_type
 * parameter in an authorize request with a valid client_id, the endpoint
 * shall return an unsupported_response_type error without issuing a redirect.
 *
 * Validates: Requirements 1.3
 */
describe('Feature: authorize-endpoint, Property 1: Invalid response_type rejection', () => {
    let fixture: SharedTestFixture;
    let testClientId: string;
    let clientApi: ClientEntityClient;

    const REDIRECT_URI = 'https://prop-test-rt.example.com/callback';

    beforeAll(async () => {
        fixture = new SharedTestFixture();
        const tokenFixture = new TokenFixture(fixture);
        const {accessToken} = await tokenFixture.fetchAccessToken(
            'admin@auth.server.com',
            'admin9000',
            'auth.server.com',
        );
        clientApi = new ClientEntityClient(fixture, accessToken);

        const tenantClient = new TenantClient(fixture, accessToken);
        const tenant = await tenantClient.createTenant('prop-rt-test', 'prop-rt-test.com');

        const created = await clientApi.createClient(tenant.id, 'Property RT Client', {
            redirectUris: [REDIRECT_URI],
            allowedScopes: 'openid profile email',
            isPublic: true,
        });
        testClientId = created.client.clientId;
    });

    afterAll(async () => {
        await clientApi.deleteClient(testClientId).catch(() => {});
        await fixture.close();
    });

    // Generator: arbitrary strings that are NOT "code"
    const invalidResponseTypeArb = fc.string({minLength: 0, maxLength: 64})
        .filter(s => s !== 'code');

    it('rejects any response_type that is not "code" with unsupported_response_type and no redirect', async () => {
        await fc.assert(
            fc.asyncProperty(invalidResponseTypeArb, async (responseType) => {
                const query = new URLSearchParams({
                    response_type: responseType,
                    client_id: testClientId,
                    redirect_uri: REDIRECT_URI,
                    state: 'test',
                }).toString();

                const response = await fixture.getHttpServer()
                    .get(`/api/oauth/authorize?${query}`)
                    .redirects(0);

                // Must NOT be a 302 redirect
                expect(response.status).not.toEqual(302);
                // Must return unsupported_response_type error
                expect(response.body.error).toEqual('unsupported_response_type');
            }),
            {numRuns: 100},
        );
    }, 120_000);
});


/**
 * Feature: authorize-endpoint, Property 2: Redirect URI exact match
 *
 * For any redirect_uri string that does not exactly match one of the client's
 * registered redirectUris, the authorize endpoint shall reject the request with
 * a direct error response (not a redirect).
 *
 * Validates: Requirements 2.1, 2.2
 */
describe('Feature: authorize-endpoint, Property 2: Redirect URI exact match', () => {
    let fixture: SharedTestFixture;
    let testClientId: string;
    let clientApi: ClientEntityClient;

    const REDIRECT_URI = 'https://prop-test-rt.example.com/callback';

    beforeAll(async () => {
        fixture = new SharedTestFixture();
        const tokenFixture = new TokenFixture(fixture);
        const {accessToken} = await tokenFixture.fetchAccessToken(
            'admin@auth.server.com',
            'admin9000',
            'auth.server.com',
        );
        clientApi = new ClientEntityClient(fixture, accessToken);

        const tenantClient = new TenantClient(fixture, accessToken);
        const tenant = await tenantClient.createTenant('prop-ruri-test', 'prop-ruri-test.com');

        const created = await clientApi.createClient(tenant.id, 'Property RURI Client', {
            redirectUris: [REDIRECT_URI],
            allowedScopes: 'openid profile email',
            isPublic: true,
        });
        testClientId = created.client.clientId;
    });

    afterAll(async () => {
        await clientApi.deleteClient(testClientId).catch(() => {});
        await fixture.close();
    });

    // Generator: arbitrary URI strings that do NOT match the registered redirect URI
    const nonMatchingUriArb = fc.oneof(
        fc.webUrl().filter(url => url !== REDIRECT_URI),
        fc.string({minLength: 1, maxLength: 128}).filter(s => s !== REDIRECT_URI),
    );

    it('rejects any redirect_uri that does not exactly match a registered URI with a direct error (no redirect)', async () => {
        await fc.assert(
            fc.asyncProperty(nonMatchingUriArb, async (redirectUri) => {
                const query = new URLSearchParams({
                    response_type: 'code',
                    client_id: testClientId,
                    redirect_uri: redirectUri,
                    state: 'test',
                }).toString();

                const response = await fixture.getHttpServer()
                    .get(`/api/oauth/authorize?${query}`)
                    .redirects(0);

                // Must NOT be a 302 redirect — pre-redirect error
                expect(response.status).not.toEqual(302);
                // Must contain a standard error code
                expect(response.body.error).toBeDefined();
                expect(response.body.error).toEqual('invalid_request');
            }),
            {numRuns: 100},
        );
    }, 120_000);
});


/**
 * Feature: authorize-endpoint, Property 3: State parameter round-trip
 *
 * For any valid authorization request containing an arbitrary state string,
 * the redirect response shall include the state parameter with the exact
 * same value, unmodified.
 *
 * Validates: Requirements 3.2
 */
describe('Feature: authorize-endpoint, Property 3: State parameter round-trip', () => {
    let fixture: SharedTestFixture;
    let testClientId: string;
    let clientApi: ClientEntityClient;

    const REDIRECT_URI = 'https://prop-test-state.example.com/callback';

    beforeAll(async () => {
        fixture = new SharedTestFixture();
        const tokenFixture = new TokenFixture(fixture);
        const {accessToken} = await tokenFixture.fetchAccessToken(
            'admin@auth.server.com',
            'admin9000',
            'auth.server.com',
        );
        clientApi = new ClientEntityClient(fixture, accessToken);

        const tenantClient = new TenantClient(fixture, accessToken);
        const tenant = await tenantClient.createTenant('prop-state-test', 'prop-state-test.com');

        const created = await clientApi.createClient(tenant.id, 'Property State Client', {
            redirectUris: [REDIRECT_URI],
            allowedScopes: 'openid profile email',
            isPublic: true,
        });
        testClientId = created.client.clientId;
    });

    afterAll(async () => {
        await clientApi.deleteClient(testClientId).catch(() => {});
        await fixture.close();
    });

    // Generator: arbitrary non-empty state strings
    const stateArb = fc.string({minLength: 1, maxLength: 256});

    it('preserves the exact state value in the success redirect', async () => {
        await fc.assert(
            fc.asyncProperty(stateArb, async (state) => {
                const query = new URLSearchParams({
                    response_type: 'code',
                    client_id: testClientId,
                    redirect_uri: REDIRECT_URI,
                    state,
                }).toString();

                const response = await fixture.getHttpServer()
                    .get(`/api/oauth/authorize?${query}`)
                    .redirects(0);

                // Should be a 302 redirect to the login UI
                expect(response.status).toEqual(302);

                const locationHeader = response.headers['location'] as string;
                expect(locationHeader).toBeDefined();

                // Parse the redirect URL and verify state round-trips exactly
                const redirectUrl = new URL(locationHeader, 'http://localhost');
                expect(redirectUrl.searchParams.get('state')).toEqual(state);
            }),
            {numRuns: 100},
        );
    }, 120_000);
});


/**
 * Feature: authorize-endpoint, Property 5: Scope excludes role names
 *
 * For any scope string processed by the authorize endpoint, the effective scope
 * shall never contain internal role enum values (SUPER_ADMIN, TENANT_ADMIN,
 * TENANT_VIEWER). Scopes contain only OIDC values.
 *
 * Validates: Requirements 6.3
 */
describe('Feature: authorize-endpoint, Property 5: Scope excludes role names', () => {
    let fixture: SharedTestFixture;
    let testClientId: string;
    let clientApi: ClientEntityClient;

    const REDIRECT_URI = 'https://prop-test-scope-roles.example.com/callback';
    const ROLE_ENUMS = ['SUPER_ADMIN', 'TENANT_ADMIN', 'TENANT_VIEWER'] as const;

    beforeAll(async () => {
        fixture = new SharedTestFixture();
        const tokenFixture = new TokenFixture(fixture);
        const {accessToken} = await tokenFixture.fetchAccessToken(
            'admin@auth.server.com',
            'admin9000',
            'auth.server.com',
        );
        clientApi = new ClientEntityClient(fixture, accessToken);

        const tenantClient = new TenantClient(fixture, accessToken);
        const tenant = await tenantClient.createTenant('prop-scope-role-test', 'prop-scope-role-test.com');

        const created = await clientApi.createClient(tenant.id, 'Property Scope Role Client', {
            redirectUris: [REDIRECT_URI],
            allowedScopes: 'openid profile email',
            isPublic: true,
        });
        testClientId = created.client.clientId;
    });

    afterAll(async () => {
        await clientApi.deleteClient(testClientId).catch(() => {});
        await fixture.close();
    });

    // Generator: mix valid OIDC scopes with at least one role enum value
    const validOidcScopes = ['openid', 'profile', 'email'];
    const scopeWithRolesArb = fc.tuple(
        fc.subarray(validOidcScopes, {minLength: 1}),
        fc.subarray([...ROLE_ENUMS], {minLength: 1}),
    ).map(([oidc, roles]) => [...oidc, ...roles].join(' '));

    it('never includes role enum values in the effective scope', async () => {
        await fc.assert(
            fc.asyncProperty(scopeWithRolesArb, async (scopeString) => {
                const query = new URLSearchParams({
                    response_type: 'code',
                    client_id: testClientId,
                    redirect_uri: REDIRECT_URI,
                    scope: scopeString,
                    state: 'test-state',
                }).toString();

                const response = await fixture.getHttpServer()
                    .get(`/api/oauth/authorize?${query}`)
                    .redirects(0);

                // Should be a 302 redirect to the login UI
                expect(response.status).toEqual(302);

                const locationHeader = response.headers['location'] as string;
                expect(locationHeader).toBeDefined();

                // Parse the effective scope from the redirect URL
                const redirectUrl = new URL(locationHeader, 'http://localhost');
                const effectiveScope = redirectUrl.searchParams.get('scope') || '';
                const scopeTokens = effectiveScope.split(/\s+/).filter(s => s.length > 0);

                // Assert no role enum values appear in the effective scope
                for (const role of ROLE_ENUMS) {
                    expect(scopeTokens).not.toContain(role);
                }
            }),
            {numRuns: 100},
        );
    }, 120_000);
});


/**
 * Feature: authorize-endpoint, Property 6: Post-redirect errors include error, error_description, and state
 *
 * For any validation failure that occurs after a valid redirect_uri has been
 * established, the redirect response shall include error, error_description,
 * and state as query parameters on the redirect URI.
 *
 * Validates: Requirements 8.1
 */
describe('Feature: authorize-endpoint, Property 6: Post-redirect errors include error, error_description, and state', () => {
    let fixture: SharedTestFixture;
    let clientApi: ClientEntityClient;
    let pkceRequiredClientId: string;

    const REDIRECT_URI = 'https://prop-test-post-err.example.com/callback';

    beforeAll(async () => {
        fixture = new SharedTestFixture();
        const tokenFixture = new TokenFixture(fixture);
        const {accessToken} = await tokenFixture.fetchAccessToken(
            'admin@auth.server.com',
            'admin9000',
            'auth.server.com',
        );
        clientApi = new ClientEntityClient(fixture, accessToken);

        const tenantClient = new TenantClient(fixture, accessToken);
        const tenant = await tenantClient.createTenant('prop-post-err-test', 'prop-post-err-test.com');

        // Client with requirePkce=true for PKCE violation scenarios
        const pkceClient = await clientApi.createClient(tenant.id, 'Property PostErr PKCE Client', {
            redirectUris: [REDIRECT_URI],
            allowedScopes: 'openid profile email',
            isPublic: true,
            requirePkce: true,
        });
        pkceRequiredClientId = pkceClient.client.clientId;
    });

    afterAll(async () => {
        await clientApi.deleteClient(pkceRequiredClientId).catch(() => {});
        await fixture.close();
    });

    // Generator: arbitrary non-empty state strings
    const stateArb = fc.string({minLength: 1, maxLength: 256});

    it('PKCE missing code_challenge: redirect includes error, error_description, and the exact state', async () => {
        await fc.assert(
            fc.asyncProperty(stateArb, async (state) => {
                // Valid request to pkce-required client WITHOUT code_challenge
                const query = new URLSearchParams({
                    response_type: 'code',
                    client_id: pkceRequiredClientId,
                    redirect_uri: REDIRECT_URI,
                    state,
                }).toString();

                const response = await fixture.getHttpServer()
                    .get(`/api/oauth/authorize?${query}`)
                    .redirects(0);

                // Must be a 302 redirect (post-redirect error)
                expect(response.status).toEqual(302);

                const locationHeader = response.headers['location'] as string;
                expect(locationHeader).toBeDefined();

                const redirectUrl = new URL(locationHeader, 'http://localhost');

                // All three query params must be present
                expect(redirectUrl.searchParams.has('error')).toBe(true);
                expect(redirectUrl.searchParams.has('error_description')).toBe(true);
                expect(redirectUrl.searchParams.has('state')).toBe(true);

                // State must round-trip exactly
                expect(redirectUrl.searchParams.get('state')).toEqual(state);
            }),
            {numRuns: 100},
        );
    }, 120_000);

    it('PKCE plain method violation: redirect includes error, error_description, and the exact state', async () => {
        await fc.assert(
            fc.asyncProperty(stateArb, async (state) => {
                // Valid request to pkce-required client with code_challenge but method=plain
                const query = new URLSearchParams({
                    response_type: 'code',
                    client_id: pkceRequiredClientId,
                    redirect_uri: REDIRECT_URI,
                    state,
                    code_challenge: 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk',
                    code_challenge_method: 'plain',
                }).toString();

                const response = await fixture.getHttpServer()
                    .get(`/api/oauth/authorize?${query}`)
                    .redirects(0);

                // Must be a 302 redirect (post-redirect error)
                expect(response.status).toEqual(302);

                const locationHeader = response.headers['location'] as string;
                expect(locationHeader).toBeDefined();

                const redirectUrl = new URL(locationHeader, 'http://localhost');

                // All three query params must be present
                expect(redirectUrl.searchParams.has('error')).toBe(true);
                expect(redirectUrl.searchParams.has('error_description')).toBe(true);
                expect(redirectUrl.searchParams.has('state')).toBe(true);

                // State must round-trip exactly
                expect(redirectUrl.searchParams.get('state')).toEqual(state);
            }),
            {numRuns: 100},
        );
    }, 120_000);
});


/**
 * Feature: authorize-endpoint, Property 7: Pre-redirect errors never redirect
 *
 * For any authorization request where the client_id is unknown or the redirect_uri
 * does not match any registered URI, the endpoint shall return a direct error response
 * to the user-agent (HTTP status, JSON body) and shall never issue a 302 redirect.
 *
 * Validates: Requirements 1.4, 8.2
 */
describe('Feature: authorize-endpoint, Property 7: Pre-redirect errors never redirect', () => {
    let fixture: SharedTestFixture;
    let testClientId: string;
    let clientApi: ClientEntityClient;

    const REDIRECT_URI = 'https://prop-test-preerr.example.com/callback';

    beforeAll(async () => {
        fixture = new SharedTestFixture();
        const tokenFixture = new TokenFixture(fixture);
        const {accessToken} = await tokenFixture.fetchAccessToken(
            'admin@auth.server.com',
            'admin9000',
            'auth.server.com',
        );
        clientApi = new ClientEntityClient(fixture, accessToken);

        const tenantClient = new TenantClient(fixture, accessToken);
        const tenant = await tenantClient.createTenant('prop-preerr-test', 'prop-preerr-test.com');

        const created = await clientApi.createClient(tenant.id, 'Property PreErr Client', {
            redirectUris: [REDIRECT_URI],
            allowedScopes: 'openid profile email',
            isPublic: true,
        });
        testClientId = created.client.clientId;
    });

    afterAll(async () => {
        await clientApi.deleteClient(testClientId).catch(() => {});
        await fixture.close();
    });

    // Generator: unknown client_id values that cannot accidentally match real clients
    const unknownClientIdArb = fc.string({minLength: 1, maxLength: 64})
        .map(s => `unknown-${s}`);

    it('unknown client_id never produces a 302 redirect', async () => {
        await fc.assert(
            fc.asyncProperty(unknownClientIdArb, async (clientId) => {
                const query = new URLSearchParams({
                    response_type: 'code',
                    client_id: clientId,
                    redirect_uri: 'https://any.example.com/callback',
                    state: 'test-state',
                }).toString();

                const response = await fixture.getHttpServer()
                    .get(`/api/oauth/authorize?${query}`)
                    .redirects(0);

                // Must NOT be a 302 redirect — pre-redirect error
                expect(response.status).not.toEqual(302);
                // Should return a JSON error body
                expect(response.body.error).toBeDefined();
            }),
            {numRuns: 100},
        );
    }, 120_000);

    // Generator: arbitrary URI strings that don't match the registered redirect URI
    const invalidRedirectUriArb = fc.oneof(
        fc.webUrl().filter(url => url !== REDIRECT_URI),
        fc.string({minLength: 1, maxLength: 128}).filter(s => s !== REDIRECT_URI),
    );

    it('invalid redirect_uri never produces a 302 redirect', async () => {
        await fc.assert(
            fc.asyncProperty(invalidRedirectUriArb, async (redirectUri) => {
                const query = new URLSearchParams({
                    response_type: 'code',
                    client_id: testClientId,
                    redirect_uri: redirectUri,
                    state: 'test-state',
                }).toString();

                const response = await fixture.getHttpServer()
                    .get(`/api/oauth/authorize?${query}`)
                    .redirects(0);

                // Must NOT be a 302 redirect — pre-redirect error
                expect(response.status).not.toEqual(302);
                // Should return a JSON error body
                expect(response.body.error).toBeDefined();
            }),
            {numRuns: 100},
        );
    }, 120_000);
});


/**
 * Feature: authorize-endpoint, Property 8: Error codes are standard OAuth 2.0 codes
 *
 * For any error response from the authorize endpoint (whether direct or via redirect),
 * the error value shall be one of the standard OAuth 2.0 error codes: invalid_request,
 * unauthorized_client, access_denied, unsupported_response_type, invalid_scope,
 * server_error, or temporarily_unavailable.
 *
 * Validates: Requirements 8.3
 */
describe('Feature: authorize-endpoint, Property 8: Error codes are standard OAuth 2.0 codes', () => {
    let fixture: SharedTestFixture;
    let testClientId: string;
    let clientApi: ClientEntityClient;

    const REDIRECT_URI = 'https://prop-test-errcodes.example.com/callback';

    const STANDARD_ERROR_CODES = [
        'invalid_request',
        'unauthorized_client',
        'access_denied',
        'unsupported_response_type',
        'invalid_scope',
        'server_error',
        'temporarily_unavailable',
    ];

    beforeAll(async () => {
        fixture = new SharedTestFixture();
        const tokenFixture = new TokenFixture(fixture);
        const {accessToken} = await tokenFixture.fetchAccessToken(
            'admin@auth.server.com',
            'admin9000',
            'auth.server.com',
        );
        clientApi = new ClientEntityClient(fixture, accessToken);

        const tenantClient = new TenantClient(fixture, accessToken);
        const tenant = await tenantClient.createTenant('prop-errcodes-test', 'prop-errcodes-test.com');

        const created = await clientApi.createClient(tenant.id, 'Property ErrCodes Client', {
            redirectUris: [REDIRECT_URI],
            allowedScopes: 'openid profile email',
            isPublic: true,
        });
        testClientId = created.client.clientId;
    });

    afterAll(async () => {
        await clientApi.deleteClient(testClientId).catch(() => {});
        await fixture.close();
    });

    /**
     * Helper: extract the error code from either a JSON body (pre-redirect)
     * or the Location header's error query param (post-redirect).
     */
    function extractErrorCode(response: any): string | null {
        if (response.status === 302) {
            const location = response.headers['location'] as string;
            if (!location) return null;
            const url = new URL(location, 'http://localhost');
            return url.searchParams.get('error');
        }
        // Pre-redirect JSON error
        return response.body?.error ?? null;
    }

    // Generator: various invalid request combinations that trigger errors
    const invalidRequestArb = fc.oneof(
        // 1. Invalid response_type (arbitrary string ≠ "code") with valid client
        fc.string({minLength: 1, maxLength: 64}).filter(s => s !== 'code').map(rt => ({
            response_type: rt,
            client_id: '__VALID_CLIENT__',
            redirect_uri: REDIRECT_URI,
            state: 'test-state',
        })),
        // 2. Unknown client_id (prefixed with "unknown-")
        fc.string({minLength: 1, maxLength: 64}).map(s => ({
            response_type: 'code',
            client_id: `unknown-${s}`,
            redirect_uri: REDIRECT_URI,
            state: 'test-state',
        })),
        // 3. Invalid redirect_uri with valid client
        fc.webUrl().filter(url => url !== REDIRECT_URI).map(uri => ({
            response_type: 'code',
            client_id: '__VALID_CLIENT__',
            redirect_uri: uri,
            state: 'test-state',
        })),
    );

    it('all error codes are from the standard OAuth 2.0 set', async () => {
        await fc.assert(
            fc.asyncProperty(invalidRequestArb, async (params) => {
                // Replace placeholder with actual test client ID
                const requestParams = {
                    ...params,
                    client_id: params.client_id === '__VALID_CLIENT__' ? testClientId : params.client_id,
                };

                const query = new URLSearchParams(requestParams).toString();

                const response = await fixture.getHttpServer()
                    .get(`/api/oauth/authorize?${query}`)
                    .redirects(0);

                const errorCode = extractErrorCode(response);

                // An error code must be present
                expect(errorCode).not.toBeNull();
                // The error code must be from the standard set
                expect(STANDARD_ERROR_CODES).toContain(errorCode);
            }),
            {numRuns: 100},
        );
    }, 120_000);
});
