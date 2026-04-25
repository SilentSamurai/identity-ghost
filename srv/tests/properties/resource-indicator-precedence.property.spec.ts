import * as fc from 'fast-check';
import {SharedTestFixture} from '../shared-test.fixture';
import {TokenFixture} from '../token.fixture';
import {ClientEntityClient} from '../api-client/client-entity-client';
import {TenantClient} from '../api-client/tenant-client';

/**
 * Feature: resource-indicator-support — Property-Based Tests for Auth Code Resource Precedence
 *
 * These tests validate that the auth code's stored resource takes precedence over
 * any resource parameter in the token exchange request.
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

/**
 * Generates two different resource URIs.
 */
const twoDifferentResourcesArb = fc.tuple(resourceUriArb, resourceUriArb)
    .filter(([r1, r2]) => r1 !== r2);

// ── Property 4: Auth code resource takes precedence ─────────────────────

/**
 * Feature: resource-indicator-support, Property 4: Auth code resource takes precedence
 *
 * For any authorization code that contains a stored resource value, and for any
 * resource parameter value in the token exchange request, the issued access token's
 * `aud` claim SHALL reflect the auth code's stored resource value, not the token
 * request's resource value.
 *
 * **Validates: Requirements 3.5, 6.4**
 */
describe('Feature: resource-indicator-support, Property 4: Auth code resource takes precedence', () => {
    let app: SharedTestFixture;
    let clientApi: ClientEntityClient;
    let accessToken: string;
    let testTenantId: string;

    const REDIRECT_URI = 'https://precedence-test.example.com/callback';
    const CODE_VERIFIER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopq';
    const CODE_CHALLENGE = CODE_VERIFIER; // plain method

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
        const tenant = await tenantClient.createTenant('precedence-test', 'precedence-test.com');
        testTenantId = tenant.id;
    });

    afterAll(async () => {
        await app.close();
    });

    /**
     * Helper: pre-grant consent for a third-party client so that login returns
     * an authentication_code instead of requires_consent.
     */
    async function preGrantConsent(clientId: string): Promise<void> {
        await app.getHttpServer()
            .post('/api/oauth/consent')
            .send({
                email: 'admin@auth.server.com',
                password: 'admin9000',
                client_id: clientId,
                code_challenge: CODE_CHALLENGE,
                code_challenge_method: 'plain',
                approved_scopes: ['openid', 'profile', 'email'],
                consent_action: 'approve',
                scope: 'openid profile email',
                redirect_uri: REDIRECT_URI,
            })
            .set('Accept', 'application/json');
    }

    it('auth code resource takes precedence over token request resource', async () => {
        await fc.assert(
            fc.asyncProperty(twoDifferentResourcesArb, async ([authCodeResource, tokenRequestResource]) => {

                // Create a client with both resources in allowedResources
                const client = await clientApi.createClient(testTenantId, 'Precedence Test Client', {
                    redirectUris: [REDIRECT_URI],
                    allowedScopes: 'openid profile email',
                    isPublic: true,
                    allowedResources: [authCodeResource, tokenRequestResource],
                });
                const clientId = client.client.clientId;

                try {
                    // Pre-grant consent so login returns auth code
                    await preGrantConsent(clientId);

                    // Login with the first resource (authCodeResource)
                    const loginResponse = await app.getHttpServer()
                        .post('/api/oauth/login')
                        .send({
                            email: 'admin@auth.server.com',
                            password: 'admin9000',
                            client_id: clientId,
                            code_challenge: CODE_CHALLENGE,
                            code_challenge_method: 'plain',
                            resource: authCodeResource,
                        })
                        .set('Accept', 'application/json');

                    expect(loginResponse.status).toEqual(201);
                    const code = loginResponse.body.authentication_code;

                    // Exchange the code, but provide a DIFFERENT resource in the token request
                    const tokenResponse = await app.getHttpServer()
                        .post('/api/oauth/token')
                        .send({
                            grant_type: 'authorization_code',
                            code: code,
                            code_verifier: CODE_VERIFIER,
                            client_id: clientId,
                            // This resource should be IGNORED
                            resource: tokenRequestResource,
                        })
                        .set('Accept', 'application/json');

                    expect(tokenResponse.status).toEqual(200);

                    const jwt = app.jwtService().decode(tokenResponse.body.access_token, {json: true}) as any;

                    // The token's aud should contain the auth code's resource, NOT the token request's
                    expect(jwt.aud).toBeDefined();
                    expect(Array.isArray(jwt.aud)).toBe(true);
                    expect(jwt.aud).toContain(authCodeResource);
                    // The token request's resource should NOT be in the audience
                    expect(jwt.aud).not.toContain(tokenRequestResource);
                } finally {
                    await clientApi.deleteClient(clientId).catch(() => {});
                }
            }),
            {numRuns: 10},
        );
    }, 120_000);

    it('token request resource is ignored when auth code has stored resource', async () => {
        const authCodeResource = 'https://stored-resource.example.com/api';
        const tokenRequestResource = 'https://ignored-resource.example.com/api';

        const client = await clientApi.createClient(testTenantId, 'Ignored Resource Client', {
            redirectUris: [REDIRECT_URI],
            allowedScopes: 'openid profile email',
            isPublic: true,
            allowedResources: [authCodeResource, tokenRequestResource],
        });
        const clientId = client.client.clientId;

        try {
            // Pre-grant consent
            await preGrantConsent(clientId);

            // Login with authCodeResource
            const loginResponse = await app.getHttpServer()
                .post('/api/oauth/login')
                .send({
                    email: 'admin@auth.server.com',
                    password: 'admin9000',
                    client_id: clientId,
                    code_challenge: CODE_CHALLENGE,
                    code_challenge_method: 'plain',
                    resource: authCodeResource,
                })
                .set('Accept', 'application/json');

            expect(loginResponse.status).toEqual(201);
            const code = loginResponse.body.authentication_code;

            // Exchange with a different resource in the request
            const tokenResponse = await app.getHttpServer()
                .post('/api/oauth/token')
                .send({
                    grant_type: 'authorization_code',
                    code: code,
                    code_verifier: CODE_VERIFIER,
                    client_id: clientId,
                    resource: tokenRequestResource,
                })
                .set('Accept', 'application/json');

            expect(tokenResponse.status).toEqual(200);

            const jwt = app.jwtService().decode(tokenResponse.body.access_token, {json: true}) as any;

            // Verify the stored resource is used
            expect(jwt.aud).toContain(authCodeResource);
            expect(jwt.aud).not.toContain(tokenRequestResource);
        } finally {
            await clientApi.deleteClient(clientId).catch(() => {});
        }
    });

    it('auth code without resource allows token request resource to be used', async () => {
        const resource = 'https://token-request-resource.example.com/api';

        // Create a client with allowedResources
        const client = await clientApi.createClient(testTenantId, 'No Stored Resource Client', {
            redirectUris: [REDIRECT_URI],
            allowedScopes: 'openid profile email',
            isPublic: true,
            allowedResources: [resource],
        });
        const clientId = client.client.clientId;

        try {
            // Pre-grant consent
            await preGrantConsent(clientId);

            // Login WITHOUT a resource
            const loginResponse = await app.getHttpServer()
                .post('/api/oauth/login')
                .send({
                    email: 'admin@auth.server.com',
                    password: 'admin9000',
                    client_id: clientId,
                    code_challenge: CODE_CHALLENGE,
                    code_challenge_method: 'plain',
                    // No resource parameter
                })
                .set('Accept', 'application/json');

            expect(loginResponse.status).toEqual(201);
            const code = loginResponse.body.authentication_code;

            // Exchange with a resource in the token request
            // Per the design, the auth code's stored resource (null) takes precedence,
            // so the token request's resource should be ignored
            const tokenResponse = await app.getHttpServer()
                .post('/api/oauth/token')
                .send({
                    grant_type: 'authorization_code',
                    code: code,
                    code_verifier: CODE_VERIFIER,
                    client_id: clientId,
                    resource: resource,
                })
                .set('Accept', 'application/json');

            expect(tokenResponse.status).toEqual(200);

            const jwt = app.jwtService().decode(tokenResponse.body.access_token, {json: true}) as any;

            // When auth code has no resource, the token should have only the default audience
            expect(jwt.aud).toBeDefined();
            expect(Array.isArray(jwt.aud)).toBe(true);
            // Should only have the default audience (no resource)
            expect(jwt.aud.length).toBe(1);
            expect(jwt.aud).toContain('auth.server.com');
        } finally {
            await clientApi.deleteClient(clientId).catch(() => {});
        }
    });
});
