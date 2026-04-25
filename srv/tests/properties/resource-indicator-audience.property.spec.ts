import * as fc from 'fast-check';
import {SharedTestFixture} from '../shared-test.fixture';
import {TokenFixture} from '../token.fixture';
import {ClientEntityClient} from '../api-client/client-entity-client';
import {TenantClient} from '../api-client/tenant-client';

/**
 * Feature: resource-indicator-support — Property-Based Tests for Audience Construction
 *
 * These tests validate that the audience claim is correctly constructed when a
 * resource indicator is present.
 */

// ── Arbitraries ─────────────────────────────────────────────────────────

/**
 * Generates valid absolute URIs with scheme, authority, and no fragment.
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

// ── Property 5: Audience construction with resource indicator ───────────

/**
 * Feature: resource-indicator-support, Property 5: Audience construction with resource indicator
 *
 * For any valid resource URI, when a token is issued with that resource indicator, the
 * resulting JWT's `aud` claim SHALL be a JSON array containing both the resource URI and
 * the default audience (`SUPER_TENANT_DOMAIN`), and SHALL contain exactly these two values
 * (no duplicates, no extras).
 *
 * **Validates: Requirements 4.1, 4.2, 4.4**
 */
describe('Feature: resource-indicator-support, Property 5: Audience construction with resource indicator', () => {
    let app: SharedTestFixture;
    let clientApi: ClientEntityClient;
    let accessToken: string;
    let testTenantId: string;

    const REDIRECT_URI = 'https://aud-prop-test.example.com/callback';

    beforeAll(async () => {
        app = new SharedTestFixture();
        const tokenFixture = new TokenFixture(app);
        const response = await tokenFixture.fetchAccessToken(
            'admin@auth.server.com',
            'admin9000',
            'auth.server.com',
        );
        accessToken = response.accessToken;
        clientApi = new ClientEntityClient(app, accessToken);

        const tenantClient = new TenantClient(app, accessToken);
        const tenant = await tenantClient.createTenant('aud-prop-test', 'aud-prop-test.com');
        testTenantId = tenant.id;
    });

    afterAll(async () => {
        await app.close();
    });

    it('token with resource has aud containing exactly [resource, SUPER_TENANT_DOMAIN]', async () => {
        await fc.assert(
            fc.asyncProperty(resourceUriArb, async (resource) => {
                // Create a client with the resource in its allowedResources
                const client = await clientApi.createClient(testTenantId, 'Audience Test Client', {
                    redirectUris: [REDIRECT_URI],
                    allowedScopes: 'openid profile email',
                    isPublic: true,
                    allowedResources: [resource],
                    allowPasswordGrant: true,
                });
                const clientId = client.client.clientId;

                try {
                    // Get token via password grant with resource
                    const tokenResponse = await app.getHttpServer()
                        .post('/api/oauth/token')
                        .send({
                            grant_type: 'password',
                            username: 'admin@auth.server.com',
                            password: 'admin9000',
                            client_id: clientId,
                            resource: resource,
                        })
                        .set('Accept', 'application/json');

                    expect(tokenResponse.status).toEqual(200);
                    expect(tokenResponse.body.access_token).toBeDefined();

                    // Decode the token
                    const jwt = app.jwtService().decode(tokenResponse.body.access_token, {json: true}) as any;

                    // Verify audience structure
                    expect(jwt.aud).toBeDefined();
                    expect(Array.isArray(jwt.aud)).toBe(true);
                    expect(jwt.aud.length).toBe(2);
                    expect(jwt.aud).toContain(resource);
                    // The default audience should also be present
                    expect(jwt.aud).toContain('auth.server.com');
                } finally {
                    await clientApi.deleteClient(clientId).catch(() => {});
                }
            }),
            {numRuns: 10},
        );
    }, 120_000);

    it('token without resource has aud containing only [SUPER_TENANT_DOMAIN]', async () => {
        // Create a client without allowedResources
        const client = await clientApi.createClient(testTenantId, 'No Resource Client', {
            redirectUris: [REDIRECT_URI],
            allowedScopes: 'openid profile email',
            isPublic: true,
            allowPasswordGrant: true,
        });
        const clientId = client.client.clientId;

        try {
            // Get token via password grant without resource
            const tokenResponse = await app.getHttpServer()
                .post('/api/oauth/token')
                .send({
                    grant_type: 'password',
                    username: 'admin@auth.server.com',
                    password: 'admin9000',
                    client_id: clientId,
                })
                .set('Accept', 'application/json');

            expect(tokenResponse.status).toEqual(200);

            const jwt = app.jwtService().decode(tokenResponse.body.access_token, {json: true}) as any;

            // Verify audience is just the default
            expect(jwt.aud).toBeDefined();
            expect(Array.isArray(jwt.aud)).toBe(true);
            expect(jwt.aud.length).toBe(1);
            expect(jwt.aud).toContain('auth.server.com');
        } finally {
            await clientApi.deleteClient(clientId).catch(() => {});
        }
    });

    it('aud is always a JSON array (never a bare string)', async () => {
        await fc.assert(
            fc.asyncProperty(resourceUriArb, async (resource) => {
                const client = await clientApi.createClient(testTenantId, 'Array Audience Client', {
                    redirectUris: [REDIRECT_URI],
                    allowedScopes: 'openid profile email',
                    isPublic: true,
                    allowedResources: [resource],
                    allowPasswordGrant: true,
                });
                const clientId = client.client.clientId;

                try {
                    const tokenResponse = await app.getHttpServer()
                        .post('/api/oauth/token')
                        .send({
                            grant_type: 'password',
                            username: 'admin@auth.server.com',
                            password: 'admin9000',
                            client_id: clientId,
                            resource: resource,
                        })
                        .set('Accept', 'application/json');

                    expect(tokenResponse.status).toEqual(200);

                    const jwt = app.jwtService().decode(tokenResponse.body.access_token, {json: true}) as any;

                    // aud must be an array, never a string
                    expect(Array.isArray(jwt.aud)).toBe(true);
                    expect(typeof jwt.aud).not.toBe('string');
                } finally {
                    await clientApi.deleteClient(clientId).catch(() => {});
                }
            }),
            {numRuns: 10},
        );
    }, 120_000);

    it('refresh token grant with resource produces token with correct aud', async () => {
        const resource = 'https://refresh-audience-test.example.com/api';
        
        const client = await clientApi.createClient(testTenantId, 'Refresh Token Client', {
            redirectUris: [REDIRECT_URI],
            allowedScopes: 'openid profile email',
            isPublic: true,
            allowedResources: [resource],
            allowPasswordGrant: true,
            allowRefreshToken: true,
        });
        const clientId = client.client.clientId;

        try {
            // Get initial token with resource
            const initialResponse = await app.getHttpServer()
                .post('/api/oauth/token')
                .send({
                    grant_type: 'password',
                    username: 'admin@auth.server.com',
                    password: 'admin9000',
                    client_id: clientId,
                    resource: resource,
                })
                .set('Accept', 'application/json');

            expect(initialResponse.status).toEqual(200);
            const refreshToken = initialResponse.body.refresh_token;

            // Use refresh token with same resource
            const refreshResponse = await app.getHttpServer()
                .post('/api/oauth/token')
                .send({
                    grant_type: 'refresh_token',
                    refresh_token: refreshToken,
                    client_id: clientId,
                    resource: resource,
                })
                .set('Accept', 'application/json');

            expect(refreshResponse.status).toEqual(200);

            const jwt = app.jwtService().decode(refreshResponse.body.access_token, {json: true}) as any;

            // Verify audience contains the resource
            expect(jwt.aud).toBeDefined();
            expect(Array.isArray(jwt.aud)).toBe(true);
            expect(jwt.aud).toContain(resource);
            expect(jwt.aud).toContain('auth.server.com');
        } finally {
            await clientApi.deleteClient(clientId).catch(() => {});
        }
    });
});
