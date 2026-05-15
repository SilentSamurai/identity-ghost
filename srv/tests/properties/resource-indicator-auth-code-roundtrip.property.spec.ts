import * as fc from 'fast-check';
import {SharedTestFixture} from '../shared-test.fixture';
import {TokenFixture} from '../token.fixture';
import {ClientEntityClient} from '../api-client/client-entity-client';
import {TenantClient} from '../api-client/tenant-client';

/**
 * Feature: resource-indicator-support — Property-Based Tests for Auth Code Resource Round-Trip
 *
 * These tests validate that the resource parameter is correctly persisted in auth codes
 * and retrieved without modification.
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
 * Generates valid resource URIs within the 2048 character limit.
 */
const resourceUriArb = validAbsoluteUriArb.filter(uri => uri.length <= 2048);

// ── Property 3: Auth code resource round-trip ───────────────────────────

/**
 * Feature: resource-indicator-support, Property 3: Auth code resource round-trip
 *
 * For any valid resource URI string, when an authorization code is created with that
 * resource value via the authorize endpoint, then retrieving the auth code record
 * SHALL return the exact same resource string without modification.
 *
 * **Validates: Requirements 2.5, 6.2**
 */
describe('Feature: resource-indicator-support, Property 3: Auth code resource round-trip', () => {
    let app: SharedTestFixture;
    let tokenFixture: TokenFixture;
    let clientApi: ClientEntityClient;
    let testTenantId: string;

    const REDIRECT_URI = 'https://resource-roundtrip-test.example.com/callback';
    const CODE_VERIFIER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopq';
    const CODE_CHALLENGE = CODE_VERIFIER; // plain method
    const email = 'admin@auth.server.com';
    const password = 'admin9000';

    beforeAll(async () => {
        app = new SharedTestFixture();
        tokenFixture = new TokenFixture(app);
        const response = await tokenFixture.fetchAccessTokenFlow(email, password, 'auth.server.com');
        clientApi = new ClientEntityClient(app, response.accessToken);

        const tenantClient = new TenantClient(app, response.accessToken);
        const tenant = await tenantClient.createTenant('res-roundtrip', 'res-roundtrip.com');
        testTenantId = tenant.id;
    });

    afterAll(async () => {
        await app.close();
    });

    it('auth code stores and retrieves the exact resource URI without modification', async () => {
        await fc.assert(
            fc.asyncProperty(resourceUriArb, async (resource) => {
                // Create a client with the resource in its allowedResources
                const client = await clientApi.createClient(testTenantId, 'Resource Roundtrip Client', {
                    redirectUris: [REDIRECT_URI],
                    allowedScopes: 'openid profile email',
                    isPublic: true,
                    allowedResources: [resource],
                });
                const clientId = client.client.clientId;

                try {
                    // Pre-grant consent so authorize can issue a code directly
                    await tokenFixture.preGrantConsentFlow(email, password, {
                        clientId,
                        redirectUri: REDIRECT_URI,
                        scope: 'openid profile email',
                        state: 'consent-state',
                        codeChallenge: CODE_CHALLENGE,
                        codeChallengeMethod: 'plain',
                    });

                    // Login → authorize with resource → get auth code
                    const params = {
                        clientId,
                        redirectUri: REDIRECT_URI,
                        scope: 'openid profile email',
                        state: 'resource-roundtrip',
                        codeChallenge: CODE_CHALLENGE,
                        codeChallengeMethod: 'plain',
                        resource,
                    };
                    const csrfContext = await tokenFixture.initializeFlow(params);
                    const sidCookie = await tokenFixture.login(email, password, clientId, csrfContext);
                    const code = await tokenFixture.getAuthorizationCode(params, sidCookie, csrfContext.flowIdCookie);

                    // Exchange the code for a token
                    const tokenResponse = await app.getHttpServer()
                        .post('/api/oauth/token')
                        .send({
                            grant_type: 'authorization_code',
                            code,
                            code_verifier: CODE_VERIFIER,
                            client_id: clientId,
                            redirect_uri: REDIRECT_URI,
                        })
                        .set('Accept', 'application/json');

                    // Token exchange should succeed
                    expect(tokenResponse.status).toEqual(200);
                    expect(tokenResponse.body.access_token).toBeDefined();

                    // Decode the token and verify the audience contains the resource
                    const jwt = app.jwtService().decode(tokenResponse.body.access_token, {json: true}) as any;
                    expect(jwt.aud).toBeDefined();
                    expect(Array.isArray(jwt.aud)).toBe(true);
                    expect(jwt.aud).toContain(resource);
                } finally {
                    await clientApi.deleteClient(clientId).catch(() => {
                    });
                }
            }),
            {numRuns: 10},
        );
    }, 180_000);

    it('resource URI is preserved exactly (no normalization or encoding changes)', async () => {
        // Test with specific edge case URIs that might be subject to normalization
        const edgeCaseUris = [
            'https://example.com/path/with/trailing/slash/',
            'https://example.com/path?query=value',
            'https://example.com:8080/custom-port',
            'https://subdomain.example.com',
            'https://example.com/path%20with%20spaces',
        ];

        for (const resource of edgeCaseUris) {
            const client = await clientApi.createClient(testTenantId, 'Edge Case Client', {
                redirectUris: [REDIRECT_URI],
                allowedScopes: 'openid profile email',
                isPublic: true,
                allowedResources: [resource],
            });
            const clientId = client.client.clientId;

            try {
                await tokenFixture.preGrantConsentFlow(email, password, {
                    clientId,
                    redirectUri: REDIRECT_URI,
                    scope: 'openid profile email',
                    state: 'consent-state',
                    codeChallenge: CODE_CHALLENGE,
                    codeChallengeMethod: 'plain',
                });

                const params = {
                    clientId,
                    redirectUri: REDIRECT_URI,
                    scope: 'openid profile email',
                    state: 'edge-case-roundtrip',
                    codeChallenge: CODE_CHALLENGE,
                    codeChallengeMethod: 'plain',
                    resource,
                };
                const csrfContext = await tokenFixture.initializeFlow(params);
                const sidCookie = await tokenFixture.login(email, password, clientId, csrfContext);
                const code = await tokenFixture.getAuthorizationCode(params, sidCookie, csrfContext.flowIdCookie);

                const tokenResponse = await app.getHttpServer()
                    .post('/api/oauth/token')
                    .send({
                        grant_type: 'authorization_code',
                        code,
                        code_verifier: CODE_VERIFIER,
                        client_id: clientId,
                        redirect_uri: REDIRECT_URI,
                    })
                    .set('Accept', 'application/json');

                expect(tokenResponse.status).toEqual(200);

                const jwt = app.jwtService().decode(tokenResponse.body.access_token, {json: true}) as any;
                // The resource should be preserved exactly as provided
                expect(jwt.aud).toContain(resource);
            } finally {
                await clientApi.deleteClient(clientId).catch(() => {
                });
            }
        }
    }, 120_000);
});
