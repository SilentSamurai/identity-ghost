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
    let tokenFixture: TokenFixture;
    let clientApi: ClientEntityClient;
    let testTenantId: string;

    const REDIRECT_URI = 'https://precedence-test.example.com/callback';
    const CODE_VERIFIER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopq';
    const CODE_CHALLENGE = CODE_VERIFIER; // plain method
    const email = 'admin@auth.server.com';
    const password = 'admin9000';

    beforeAll(async () => {
        app = new SharedTestFixture();
        tokenFixture = new TokenFixture(app);
        const response = await tokenFixture.fetchAccessToken(email, password, 'auth.server.com');
        clientApi = new ClientEntityClient(app, response.accessToken);

        const tenantClient = new TenantClient(app, response.accessToken);
        const tenant = await tenantClient.createTenant('precedence-test', 'precedence-test.com');
        testTenantId = tenant.id;
    });

    afterAll(async () => {
        await app.close();
    });

    /**
     * Helper: login → authorize with resource → return auth code.
     */
    async function loginAndGetCodeWithResource(clientId: string, resource?: string): Promise<string> {
        const sidCookie = await tokenFixture.loginForCookie(email, password, clientId);
        return tokenFixture.authorizeForCode(sidCookie, clientId, REDIRECT_URI, {
            codeChallenge: CODE_CHALLENGE,
            codeChallengeMethod: 'plain',
            resource,
        });
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
                    // Pre-grant consent so authorize can issue a code
                    await tokenFixture.preGrantConsent(email, password, clientId, REDIRECT_URI);

                    // Authorize with authCodeResource
                    const code = await loginAndGetCodeWithResource(clientId, authCodeResource);

                    // Exchange the code, but provide a DIFFERENT resource in the token request
                    const tokenResponse = await app.getHttpServer()
                        .post('/api/oauth/token')
                        .send({
                            grant_type: 'authorization_code',
                            code,
                            code_verifier: CODE_VERIFIER,
                            client_id: clientId,
                            redirect_uri: REDIRECT_URI,
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
                    await clientApi.deleteClient(clientId).catch(() => {
                    });
                }
            }),
            {numRuns: 10},
        );
    }, 180_000);

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
            await tokenFixture.preGrantConsent(email, password, clientId, REDIRECT_URI);

            const code = await loginAndGetCodeWithResource(clientId, authCodeResource);

            // Exchange with a different resource in the request
            const tokenResponse = await app.getHttpServer()
                .post('/api/oauth/token')
                .send({
                    grant_type: 'authorization_code',
                    code,
                    code_verifier: CODE_VERIFIER,
                    client_id: clientId,
                    redirect_uri: REDIRECT_URI,
                    resource: tokenRequestResource,
                })
                .set('Accept', 'application/json');

            expect(tokenResponse.status).toEqual(200);

            const jwt = app.jwtService().decode(tokenResponse.body.access_token, {json: true}) as any;

            // Verify the stored resource is used
            expect(jwt.aud).toContain(authCodeResource);
            expect(jwt.aud).not.toContain(tokenRequestResource);
        } finally {
            await clientApi.deleteClient(clientId).catch(() => {
            });
        }
    });

    it('auth code without resource: token request resource is also ignored (auth code resource is source of truth)', async () => {
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
            await tokenFixture.preGrantConsent(email, password, clientId, REDIRECT_URI);

            // Authorize WITHOUT a resource → stored resource on auth code is null
            const code = await loginAndGetCodeWithResource(clientId, undefined);

            // Exchange with a resource in the token request
            // Per the design, the auth code's stored resource (null) takes precedence,
            // so the token request's resource should be ignored
            const tokenResponse = await app.getHttpServer()
                .post('/api/oauth/token')
                .send({
                    grant_type: 'authorization_code',
                    code,
                    code_verifier: CODE_VERIFIER,
                    client_id: clientId,
                    redirect_uri: REDIRECT_URI,
                    resource,
                })
                .set('Accept', 'application/json');

            expect(tokenResponse.status).toEqual(200);

            const jwt = app.jwtService().decode(tokenResponse.body.access_token, {json: true}) as any;

            // When auth code has no resource, the token should have only the default audience
            expect(jwt.aud).toBeDefined();
            expect(Array.isArray(jwt.aud)).toBe(true);
            // The token request's resource must not leak into aud
            expect(jwt.aud).not.toContain(resource);
        } finally {
            await clientApi.deleteClient(clientId).catch(() => {
            });
        }
    });
});
