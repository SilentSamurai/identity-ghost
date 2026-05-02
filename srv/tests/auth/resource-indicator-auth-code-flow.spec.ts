import {SharedTestFixture} from '../shared-test.fixture';
import {TokenFixture} from '../token.fixture';
import {ClientEntityClient} from '../api-client/client-entity-client';
import {TenantClient} from '../api-client/tenant-client';

/**
 * Integration tests for Resource Indicator Auth Code Flow (RFC 8707).
 *
 * Validates end-to-end auth code flow with resource indicator:
 * - Login with resource → auth code created with resource stored
 * - Auth code exchange → token aud contains resource URI and default audience
 * - Auth code exchange with different resource in token request → auth code's resource takes precedence
 * - Consent flow with resource → auth code created with resource stored
 * - Silent-auth with resource → auth code created with resource stored
 *
 * Requirements: 2.5, 3.5, 4.1, 4.2, 6.2, 6.3, 6.4, 7.1, 7.2, 7.3, 7.4
 */
describe('Resource Indicator Auth Code Flow', () => {
    let app: SharedTestFixture;
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
        const tokenFixture = new TokenFixture(app);
        const response = await tokenFixture.fetchAccessToken(
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
                // Pre-grant consent so login returns auth code
                await preGrantConsent(clientId);

                const loginResponse = await app.getHttpServer()
                    .post('/api/oauth/login')
                    .send({
                        email: 'admin@auth.server.com',
                        password: 'admin9000',
                        client_id: clientId,
                        code_challenge: CODE_CHALLENGE,
                        code_challenge_method: 'plain',
                        resource: VALID_RESOURCE,
                    })
                    .set('Accept', 'application/json');

                expect(loginResponse.status).toEqual(201);
                expect(loginResponse.body.authentication_code).toBeDefined();

                const code = loginResponse.body.authentication_code;

                // Exchange the code and verify the resource is in the token
                const tokenResponse = await app.getHttpServer()
                    .post('/api/oauth/token')
                    .send({
                        grant_type: 'authorization_code',
                        code: code,
                        code_verifier: CODE_VERIFIER,
                        client_id: clientId,
                    })
                    .set('Accept', 'application/json');

                expect(tokenResponse.status).toEqual(200);

                const jwt = app.jwtService().decode(tokenResponse.body.access_token, {json: true}) as any;
                expect(jwt.aud).toContain(VALID_RESOURCE);
            } finally {
                await clientApi.deleteClient(clientId).catch(() => {
                });
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
                // Pre-grant consent
                await preGrantConsent(clientId);

                // Login with resource
                const loginResponse = await app.getHttpServer()
                    .post('/api/oauth/login')
                    .send({
                        email: 'admin@auth.server.com',
                        password: 'admin9000',
                        client_id: clientId,
                        code_challenge: CODE_CHALLENGE,
                        code_challenge_method: 'plain',
                        resource: VALID_RESOURCE,
                    })
                    .set('Accept', 'application/json');

                expect(loginResponse.status).toEqual(201);
                const code = loginResponse.body.authentication_code;

                // Exchange code
                const tokenResponse = await app.getHttpServer()
                    .post('/api/oauth/token')
                    .send({
                        grant_type: 'authorization_code',
                        code: code,
                        code_verifier: CODE_VERIFIER,
                        client_id: clientId,
                    })
                    .set('Accept', 'application/json');

                expect(tokenResponse.status).toEqual(200);

                const jwt = app.jwtService().decode(tokenResponse.body.access_token, {json: true}) as any;

                // Verify audience contains both resource and default
                expect(jwt.aud).toBeDefined();
                expect(Array.isArray(jwt.aud)).toBe(true);
                expect(jwt.aud.length).toBe(2);
                expect(jwt.aud).toContain(VALID_RESOURCE);
                expect(jwt.aud).toContain('auth.server.com');
            } finally {
                await clientApi.deleteClient(clientId).catch(() => {
                });
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
                // Pre-grant consent
                await preGrantConsent(clientId);

                // Login with first resource
                const loginResponse = await app.getHttpServer()
                    .post('/api/oauth/login')
                    .send({
                        email: 'admin@auth.server.com',
                        password: 'admin9000',
                        client_id: clientId,
                        code_challenge: CODE_CHALLENGE,
                        code_challenge_method: 'plain',
                        resource: VALID_RESOURCE,
                    })
                    .set('Accept', 'application/json');

                expect(loginResponse.status).toEqual(201);
                const code = loginResponse.body.authentication_code;

                // Exchange code with DIFFERENT resource in request
                const tokenResponse = await app.getHttpServer()
                    .post('/api/oauth/token')
                    .send({
                        grant_type: 'authorization_code',
                        code: code,
                        code_verifier: CODE_VERIFIER,
                        client_id: clientId,
                        resource: VALID_RESOURCE_2, // This should be ignored
                    })
                    .set('Accept', 'application/json');

                expect(tokenResponse.status).toEqual(200);

                const jwt = app.jwtService().decode(tokenResponse.body.access_token, {json: true}) as any;

                // Token should have the auth code's resource, not the token request's
                expect(jwt.aud).toContain(VALID_RESOURCE);
                expect(jwt.aud).not.toContain(VALID_RESOURCE_2);
            } finally {
                await clientApi.deleteClient(clientId).catch(() => {
                });
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
                const consentResponse = await app.getHttpServer()
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
                        resource: VALID_RESOURCE,
                    })
                    .set('Accept', 'application/json');

                expect(consentResponse.status).toEqual(201);
                expect(consentResponse.body.authentication_code).toBeDefined();

                const code = consentResponse.body.authentication_code;

                // Exchange and verify
                const tokenResponse = await app.getHttpServer()
                    .post('/api/oauth/token')
                    .send({
                        grant_type: 'authorization_code',
                        code: code,
                        code_verifier: CODE_VERIFIER,
                        client_id: clientId,
                        redirect_uri: REDIRECT_URI,
                    })
                    .set('Accept', 'application/json');

                expect(tokenResponse.status).toEqual(200);

                const jwt = app.jwtService().decode(tokenResponse.body.access_token, {json: true}) as any;
                expect(jwt.aud).toContain(VALID_RESOURCE);
            } finally {
                await clientApi.deleteClient(clientId).catch(() => {
                });
            }
        });
    });

    // ─── Silent Auth with Resource ────────────────────────────────────────

    describe('silent-auth with resource', () => {
        it('should create auth code with resource stored via silent-auth (Req 7.4)', async () => {
            const client = await clientApi.createClient(testTenantId, 'Silent Auth Resource Client', {
                redirectUris: [REDIRECT_URI],
                allowedScopes: 'openid profile email',
                isPublic: true,
                allowedResources: [VALID_RESOURCE],
            });
            const clientId = client.client.clientId;

            try {
                // Pre-grant consent so silent-auth can issue a code
                await preGrantConsent(clientId);

                // We need the user's id and tenant id for silent-auth
                // First do a login to create a session
                const loginResponse = await app.getHttpServer()
                    .post('/api/oauth/login')
                    .send({
                        email: 'admin@auth.server.com',
                        password: 'admin9000',
                        client_id: clientId,
                        code_challenge: CODE_CHALLENGE,
                        code_challenge_method: 'plain',
                    })
                    .set('Accept', 'application/json');

                expect(loginResponse.status).toEqual(201);
                const firstCode = loginResponse.body.authentication_code;

                // Exchange the first code to get user info from the token
                const firstTokenResponse = await app.getHttpServer()
                    .post('/api/oauth/token')
                    .send({
                        grant_type: 'authorization_code',
                        code: firstCode,
                        code_verifier: CODE_VERIFIER,
                        client_id: clientId,
                    })
                    .set('Accept', 'application/json');

                expect(firstTokenResponse.status).toEqual(200);
                const firstJwt = app.jwtService().decode(firstTokenResponse.body.access_token, {json: true}) as any;

                // Now use silent-auth with the correct parameters
                const silentAuthResponse = await app.getHttpServer()
                    .post('/api/oauth/silent-auth')
                    .send({
                        client_id: clientId,
                        user_id: firstJwt.sub,
                        tenant_id: firstJwt.tenant_id,
                        code_challenge: CODE_CHALLENGE,
                        code_challenge_method: 'plain',
                        resource: VALID_RESOURCE,
                    })
                    .set('Accept', 'application/json');

                expect(silentAuthResponse.status).toEqual(201);
                expect(silentAuthResponse.body.authentication_code).toBeDefined();

                const code = silentAuthResponse.body.authentication_code;

                // Exchange and verify
                const tokenResponse = await app.getHttpServer()
                    .post('/api/oauth/token')
                    .send({
                        grant_type: 'authorization_code',
                        code: code,
                        code_verifier: CODE_VERIFIER,
                        client_id: clientId,
                    })
                    .set('Accept', 'application/json');

                expect(tokenResponse.status).toEqual(200);

                const jwt = app.jwtService().decode(tokenResponse.body.access_token, {json: true}) as any;
                expect(jwt.aud).toContain(VALID_RESOURCE);
            } finally {
                await clientApi.deleteClient(clientId).catch(() => {
                });
            }
        });
    });
});
