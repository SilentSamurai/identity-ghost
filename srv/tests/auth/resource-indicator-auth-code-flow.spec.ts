import {SharedTestFixture} from '../shared-test.fixture';
import {TokenFixture} from '../token.fixture';
import {ClientEntityClient} from '../api-client/client-entity-client';
import {TenantClient} from '../api-client/tenant-client';

/**
 * Integration tests for Resource Indicator Auth Code Flow (RFC 8707).
 *
 * Requirements: 2.5, 3.5, 4.1, 4.2, 6.2, 6.3, 6.4, 7.1, 7.2, 7.3, 7.4
 */
describe('Resource Indicator Auth Code Flow', () => {
    let app: SharedTestFixture;
    let tokenFixture: TokenFixture;
    let clientApi: ClientEntityClient;
    let accessToken: string;
    let testTenantId: string;

    const REDIRECT_URI = 'https://auth-code-flow-test.example.com/callback';
    const VALID_RESOURCE = 'https://api.example.com';
    const VALID_RESOURCE_2 = 'https://calendar.example.com';
    const CODE_VERIFIER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopq';
    const CODE_CHALLENGE = CODE_VERIFIER; // plain method

    beforeAll(async () => {
        app = new SharedTestFixture();
        tokenFixture = new TokenFixture(app);
        const response = await tokenFixture.fetchPasswordGrantAccessToken(
            'admin@auth.server.com',
            'admin9000',
            'auth.server.com',
        );
        accessToken = response.accessToken;
        clientApi = new ClientEntityClient(app, accessToken);

        const tenantClient = new TenantClient(app, accessToken);
        const tenant = await tenantClient.createTenant('auth-code-flow', 'auth-code-flow.com');
        testTenantId = tenant.id;
    });

    afterAll(async () => {
        await app.close();
    });

    /**
     * Helper: pre-grant consent for a third-party client.
     */
    async function preGrantConsent(clientId: string): Promise<void> {
        await tokenFixture.preGrantConsent('admin@auth.server.com', 'admin9000', clientId, REDIRECT_URI);
    }

    /**
     * Helper: login → authorize with resource → return auth code.
     * Uses loginForCookie() + authorizeForCode() with resource param.
     */
    async function loginAndGetCodeWithResource(clientId: string, resource: string): Promise<string> {
        const sidCookie = await tokenFixture.loginForCookie('admin@auth.server.com', 'admin9000', clientId, REDIRECT_URI);
        return tokenFixture.authorizeForCode(sidCookie, clientId, REDIRECT_URI, {
            codeChallenge: CODE_CHALLENGE,
            codeChallengeMethod: 'plain',
            resource,
        });
    }

    // ─── Login Flow with Resource ────────────────────────────────────────

    describe('login flow with resource', () => {
        it('should create auth code with resource stored (Req 2.5, 6.2)', async () => {
            const client = await clientApi.createClient(testTenantId, 'Login Resource Client', {
                redirectUris: [REDIRECT_URI],
                allowedScopes: 'openid profile email',
                isPublic: true,
                allowedResources: [VALID_RESOURCE],
            });
            const clientId = client.client.clientId;

            try {
                // Pre-grant consent so authorize can proceed
                await preGrantConsent(clientId);

                const code = await loginAndGetCodeWithResource(clientId, VALID_RESOURCE);
                expect(code).toBeDefined();

                // Exchange the code and verify the resource is in the token
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

                const jwtPayload = app.jwtService().decode(tokenResponse.body.access_token, {json: true}) as any;
                expect(jwtPayload.aud).toContain(VALID_RESOURCE);
            } finally {
                await clientApi.deleteClient(clientId).catch(() => {});
            }
        });
    });

    // ─── Auth Code Exchange ───────────────────────────────────────────────

    describe('auth code exchange', () => {
        it('should issue token with aud containing resource and default audience (Req 4.1, 4.2)', async () => {
            const client = await clientApi.createClient(testTenantId, 'Exchange Resource Client', {
                redirectUris: [REDIRECT_URI],
                allowedScopes: 'openid profile email',
                isPublic: true,
                allowedResources: [VALID_RESOURCE],
            });
            const clientId = client.client.clientId;

            try {
                await preGrantConsent(clientId);

                const code = await loginAndGetCodeWithResource(clientId, VALID_RESOURCE);

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

                const jwtPayload = app.jwtService().decode(tokenResponse.body.access_token, {json: true}) as any;

                expect(jwtPayload.aud).toBeDefined();
                expect(Array.isArray(jwtPayload.aud)).toBe(true);
                expect(jwtPayload.aud.length).toBe(2);
                expect(jwtPayload.aud).toContain(VALID_RESOURCE);
                expect(jwtPayload.aud).toContain('auth.server.com');
            } finally {
                await clientApi.deleteClient(clientId).catch(() => {});
            }
        });

        it('should use auth code resource over token request resource (Req 3.5, 6.4)', async () => {
            const client = await clientApi.createClient(testTenantId, 'Precedence Resource Client', {
                redirectUris: [REDIRECT_URI],
                allowedScopes: 'openid profile email',
                isPublic: true,
                allowedResources: [VALID_RESOURCE, VALID_RESOURCE_2],
            });
            const clientId = client.client.clientId;

            try {
                await preGrantConsent(clientId);

                // Authorize with first resource
                const code = await loginAndGetCodeWithResource(clientId, VALID_RESOURCE);

                // Exchange code with DIFFERENT resource in request
                const tokenResponse = await app.getHttpServer()
                    .post('/api/oauth/token')
                    .send({
                        grant_type: 'authorization_code',
                        code,
                        code_verifier: CODE_VERIFIER,
                        client_id: clientId,
                        redirect_uri: REDIRECT_URI,
                        resource: VALID_RESOURCE_2, // This should be ignored
                    })
                    .set('Accept', 'application/json');

                expect(tokenResponse.status).toEqual(200);

                const jwtPayload = app.jwtService().decode(tokenResponse.body.access_token, {json: true}) as any;

                // Token should have the auth code's resource, not the token request's
                expect(jwtPayload.aud).toContain(VALID_RESOURCE);
                expect(jwtPayload.aud).not.toContain(VALID_RESOURCE_2);
            } finally {
                await clientApi.deleteClient(clientId).catch(() => {});
            }
        });
    });

    // ─── Consent Flow with Resource ───────────────────────────────────────

    describe('consent flow with resource', () => {
        it('should create auth code with resource stored via consent (Req 7.3)', async () => {
            const client = await clientApi.createClient(testTenantId, 'Consent Resource Client', {
                redirectUris: [REDIRECT_URI],
                allowedScopes: 'openid profile email',
                isPublic: true,
                allowedResources: [VALID_RESOURCE],
            });
            const clientId = client.client.clientId;

            try {
                // Pre-grant consent, then authorize with resource
                await preGrantConsent(clientId);

                const code = await loginAndGetCodeWithResource(clientId, VALID_RESOURCE);
                expect(code).toBeDefined();

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

                const jwtPayload = app.jwtService().decode(tokenResponse.body.access_token, {json: true}) as any;
                expect(jwtPayload.aud).toContain(VALID_RESOURCE);
            } finally {
                await clientApi.deleteClient(clientId).catch(() => {});
            }
        });
    });

    // ─── Silent Auth with Resource ────────────────────────────────────────

    describe('silent-auth with resource', () => {
        it('should create auth code with resource stored via authorize flow (Req 7.4)', async () => {
            const client = await clientApi.createClient(testTenantId, 'Silent Auth Resource Client', {
                redirectUris: [REDIRECT_URI],
                allowedScopes: 'openid profile email',
                isPublic: true,
                allowedResources: [VALID_RESOURCE],
            });
            const clientId = client.client.clientId;

            try {
                await preGrantConsent(clientId);

                // Authorize with resource to get a code
                const code = await loginAndGetCodeWithResource(clientId, VALID_RESOURCE);
                expect(code).toBeDefined();

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

                const jwtPayload = app.jwtService().decode(tokenResponse.body.access_token, {json: true}) as any;
                expect(jwtPayload.aud).toContain(VALID_RESOURCE);
            } finally {
                await clientApi.deleteClient(clientId).catch(() => {});
            }
        });
    });
});
