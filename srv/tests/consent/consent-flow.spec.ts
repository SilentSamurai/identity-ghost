/**
 * Integration tests for the consent flow.
 *
 * Tests the full consent lifecycle through the HTTP stack:
 * - POST /api/oauth/login returns requires_consent for third-party clients with no prior consent
 * - POST /api/oauth/login proceeds to auth code when consent already covers requested scopes
 * - POST /api/oauth/login skips consent for first-party (tenant-domain) client_id
 * - POST /api/oauth/login skips consent for first-party (tenant-clientId) client_id
 * - Consent check uses resolved scopes (intersection with client.allowedScopes), not raw scopes
 * - POST /api/oauth/consent (approve) creates consent record and returns auth code
 * - POST /api/oauth/consent (deny) returns access_denied error
 * - POST /api/oauth/consent re-authenticates the user (rejects bad credentials)
 * - POST /api/oauth/consent validates approved_scopes against client.allowedScopes
 *
 * Requirements: 2.1, 2.2, 3.1, 3.2, 3.3, 5.1, 6.1, 6.2, 6.3, 6.4
 */
import { SharedTestFixture } from '../shared-test.fixture';
import { TokenFixture } from '../token.fixture';
import { ClientEntityClient } from '../api-client/client-entity-client';
import { TenantClient } from '../api-client/tenant-client';

const CODE_CHALLENGE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopq';
const CODE_VERIFIER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopq';
const REDIRECT_URI = 'https://consent-flow-test.example.com/callback';

describe('Consent Flow Integration Tests', () => {
    let app: SharedTestFixture;
    let clientApi: ClientEntityClient;
    let tenantApi: TenantClient;
    let accessToken: string;
    let testTenantId: string;
    let testTenantDomain: string;
    let testTenantClientId: string;

    // Third-party registered Client entities used across tests
    let thirdPartyClientId: string;           // allowedScopes: openid profile email
    let narrowScopesClientId: string;         // allowedScopes: openid profile (no email)

    beforeAll(async () => {
        app = new SharedTestFixture();
        const tokenFixture = new TokenFixture(app);
        const tokenResponse = await tokenFixture.fetchAccessToken(
            'admin@auth.server.com',
            'admin9000',
            'auth.server.com',
        );
        accessToken = tokenResponse.accessToken;

        clientApi = new ClientEntityClient(app, accessToken);
        tenantApi = new TenantClient(app, accessToken);

        // Create a tenant to own the third-party clients
        // Tenant name max is 20 chars; use a short prefix + last 8 digits of timestamp
        const uniqueSuffix = String(Date.now()).slice(-8);
        testTenantDomain = `cf-test-${uniqueSuffix}.com`;
        const tenant = await tenantApi.createTenant(
            `cf-test-${uniqueSuffix}`,
            testTenantDomain,
        );
        testTenantId = tenant.id;

        // Retrieve the tenant's own clientId (used for first-party login tests)
        const creds = await tenantApi.getMyCredentials();
        testTenantClientId = creds.clientId;

        // Create a third-party client with full OIDC scopes
        const fullScopesClient = await clientApi.createClient(testTenantId, 'Full Scopes App', {
            redirectUris: [REDIRECT_URI],
            allowedScopes: 'openid profile email',
            isPublic: true,
        });
        thirdPartyClientId = fullScopesClient.client.clientId;

        // Create a third-party client with only openid + profile (no email)
        const narrowClient = await clientApi.createClient(testTenantId, 'Narrow Scopes App', {
            redirectUris: [REDIRECT_URI],
            allowedScopes: 'openid profile',
            isPublic: true,
        });
        narrowScopesClientId = narrowClient.client.clientId;
    });

    afterAll(async () => {
        await clientApi.deleteClient(thirdPartyClientId).catch(() => {});
        await clientApi.deleteClient(narrowScopesClientId).catch(() => {});
        await app.close();
    });

    // ─── Helper ──────────────────────────────────────────────────────

    function loginRequest(body: {
        client_id: string;
        scope?: string;
        email?: string;
        password?: string;
    }) {
        return app.getHttpServer()
            .post('/api/oauth/login')
            .send({
                email: 'admin@auth.server.com',
                password: 'admin9000',
                code_challenge: CODE_CHALLENGE,
                code_challenge_method: 'plain',
                redirect_uri: REDIRECT_URI,
                ...body,
            })
            .set('Accept', 'application/json');
    }

    function consentRequest(body: {
        client_id: string;
        approved_scopes: string[];
        consent_action: 'approve' | 'deny';
        email?: string;
        password?: string;
        scope?: string;
    }) {
        return app.getHttpServer()
            .post('/api/oauth/consent')
            .send({
                email: 'admin@auth.server.com',
                password: 'admin9000',
                code_challenge: CODE_CHALLENGE,
                code_challenge_method: 'plain',
                redirect_uri: REDIRECT_URI,
                ...body,
            })
            .set('Accept', 'application/json');
    }

    // ─── Req 2.2: No consent record → requires_consent ───────────────

    describe('login endpoint — requires_consent for new third-party client (Req 2.2, 6.1, 6.2)', () => {
        it('should return requires_consent when no consent record exists for a registered Client', async () => {
            const response = await loginRequest({
                client_id: thirdPartyClientId,
                scope: 'openid profile',
            });

            expect(response.status).toEqual(201);
            expect(response.body.requires_consent).toBe(true);
            expect(response.body.requested_scopes).toBeDefined();
            expect(Array.isArray(response.body.requested_scopes)).toBe(true);
            expect(response.body.requested_scopes).toContain('openid');
            expect(response.body.requested_scopes).toContain('profile');
            expect(response.body.client_name).toBeDefined();
            // Must NOT return an auth code when consent is required
            expect(response.body.authentication_code).toBeUndefined();
        });

        it('should include client_name in the requires_consent response (Req 6.2)', async () => {
            // Use a fresh client so there is definitely no prior consent
            const freshClient = await clientApi.createClient(testTenantId, 'Named App For Consent', {
                redirectUris: [REDIRECT_URI],
                allowedScopes: 'openid profile email',
                isPublic: true,
            });

            try {
                const response = await loginRequest({
                    client_id: freshClient.client.clientId,
                    scope: 'openid',
                });

                expect(response.status).toEqual(201);
                expect(response.body.requires_consent).toBe(true);
                expect(response.body.client_name).toBe('Named App For Consent');
            } finally {
                await clientApi.deleteClient(freshClient.client.clientId).catch(() => {});
            }
        });
    });

    // ─── Req 2.1: Existing consent covers scopes → auth code ─────────

    describe('login endpoint — skips consent when already consented (Req 2.1, 5.1)', () => {
        it('should return auth code directly when consent already covers requested scopes', async () => {
            // Step 1: Create a fresh client
            const freshClient = await clientApi.createClient(testTenantId, 'Pre-Consented App', {
                redirectUris: [REDIRECT_URI],
                allowedScopes: 'openid profile email',
                isPublic: true,
            });
            const clientId = freshClient.client.clientId;

            try {
                // Step 2: Grant consent via the consent endpoint
                const approveResponse = await consentRequest({
                    client_id: clientId,
                    approved_scopes: ['openid', 'profile', 'email'],
                    consent_action: 'approve',
                    scope: 'openid profile email',
                });
                expect(approveResponse.status).toEqual(201);
                expect(approveResponse.body.authentication_code).toBeDefined();

                // Step 3: Login again — consent already covers the scopes
                const loginResponse = await loginRequest({
                    client_id: clientId,
                    scope: 'openid profile',
                });

                expect(loginResponse.status).toEqual(201);
                expect(loginResponse.body.authentication_code).toBeDefined();
                expect(loginResponse.body.requires_consent).toBeUndefined();
            } finally {
                await clientApi.deleteClient(clientId).catch(() => {});
            }
        });

        it('should return auth code when requesting a strict subset of previously granted scopes (Req 5.1)', async () => {
            // Create a fresh client and grant full consent
            const freshClient = await clientApi.createClient(testTenantId, 'Subset Scopes App', {
                redirectUris: [REDIRECT_URI],
                allowedScopes: 'openid profile email',
                isPublic: true,
            });
            const clientId = freshClient.client.clientId;

            try {
                // Grant consent for all scopes
                const approveResponse = await consentRequest({
                    client_id: clientId,
                    approved_scopes: ['openid', 'profile', 'email'],
                    consent_action: 'approve',
                    scope: 'openid profile email',
                });
                expect(approveResponse.body.authentication_code).toBeDefined();

                // Login requesting only a subset — should skip consent
                const loginResponse = await loginRequest({
                    client_id: clientId,
                    scope: 'openid',
                });

                expect(loginResponse.status).toEqual(201);
                expect(loginResponse.body.authentication_code).toBeDefined();
                expect(loginResponse.body.requires_consent).toBeUndefined();
            } finally {
                await clientApi.deleteClient(clientId).catch(() => {});
            }
        });
    });

    // ─── Req 6.3: First-party logins skip consent entirely ───────────

    describe('login endpoint — skips consent for first-party client_id (Req 6.3)', () => {
        it('should skip consent entirely for tenant-domain client_id', async () => {
            // auth.server.com is the default first-party tenant domain
            const response = await loginRequest({
                client_id: 'auth.server.com',
                scope: 'openid profile email',
            });

            expect(response.status).toEqual(201);
            // Should return an auth code directly — no consent required
            expect(response.body.authentication_code).toBeDefined();
            expect(response.body.requires_consent).toBeUndefined();
        });

        it('should skip consent entirely for tenant-clientId client_id', async () => {
            // testTenantClientId is the clientId of the tenant itself (first-party)
            const response = await loginRequest({
                client_id: testTenantClientId,
                scope: 'openid profile',
            });

            expect(response.status).toEqual(201);
            // Should return an auth code directly — no consent required
            expect(response.body.authentication_code).toBeDefined();
            expect(response.body.requires_consent).toBeUndefined();
        });
    });

    // ─── Req 3.1: Consent check uses resolved scopes ─────────────────

    describe('login endpoint — consent check uses resolved scopes (Req 3.1)', () => {
        it('should use intersection of requested and client.allowedScopes for consent check', async () => {
            // narrowScopesClientId only allows openid + profile (no email)
            // Requesting openid + profile + email → resolved to openid + profile
            const response = await loginRequest({
                client_id: narrowScopesClientId,
                scope: 'openid profile email',
            });

            expect(response.status).toEqual(201);
            expect(response.body.requires_consent).toBe(true);
            // requested_scopes should be the resolved set (openid + profile), not the raw request
            expect(response.body.requested_scopes).toBeDefined();
            expect(response.body.requested_scopes).toContain('openid');
            expect(response.body.requested_scopes).toContain('profile');
            // email is outside client.allowedScopes — should not appear in requested_scopes
            expect(response.body.requested_scopes).not.toContain('email');
        });

        it('should grant consent for resolved scopes and skip on subsequent login with raw broader request', async () => {
            // Create a fresh narrow-scopes client
            const freshClient = await clientApi.createClient(testTenantId, 'Resolved Scopes App', {
                redirectUris: [REDIRECT_URI],
                allowedScopes: 'openid profile',
                isPublic: true,
            });
            const clientId = freshClient.client.clientId;

            try {
                // Grant consent for the resolved scopes (openid + profile)
                const approveResponse = await consentRequest({
                    client_id: clientId,
                    approved_scopes: ['openid', 'profile'],
                    consent_action: 'approve',
                    scope: 'openid profile',
                });
                expect(approveResponse.body.authentication_code).toBeDefined();

                // Login requesting openid + profile + email (email is outside allowedScopes)
                // Resolved scopes = openid + profile → already consented → skip consent
                const loginResponse = await loginRequest({
                    client_id: clientId,
                    scope: 'openid profile email',
                });

                expect(loginResponse.status).toEqual(201);
                expect(loginResponse.body.authentication_code).toBeDefined();
                expect(loginResponse.body.requires_consent).toBeUndefined();
            } finally {
                await clientApi.deleteClient(clientId).catch(() => {});
            }
        });
    });

    // ─── Req 3.2: Consent approval creates record and returns auth code

    describe('consent endpoint — approve action (Req 3.2, 6.4)', () => {
        it('should create consent record and return authentication_code on approve', async () => {
            const freshClient = await clientApi.createClient(testTenantId, 'Approve Test App', {
                redirectUris: [REDIRECT_URI],
                allowedScopes: 'openid profile email',
                isPublic: true,
            });
            const clientId = freshClient.client.clientId;

            try {
                const response = await consentRequest({
                    client_id: clientId,
                    approved_scopes: ['openid', 'profile'],
                    consent_action: 'approve',
                    scope: 'openid profile',
                });

                expect(response.status).toEqual(201);
                expect(response.body.authentication_code).toBeDefined();
                expect(typeof response.body.authentication_code).toBe('string');
                expect(response.body.authentication_code.length).toBeGreaterThan(0);
                // Must not return an error
                expect(response.body.error).toBeUndefined();
            } finally {
                await clientApi.deleteClient(clientId).catch(() => {});
            }
        });

        it('should persist consent so subsequent login skips consent screen (Req 2.1)', async () => {
            const freshClient = await clientApi.createClient(testTenantId, 'Persist Consent App', {
                redirectUris: [REDIRECT_URI],
                allowedScopes: 'openid profile email',
                isPublic: true,
            });
            const clientId = freshClient.client.clientId;

            try {
                // Approve consent
                const approveResponse = await consentRequest({
                    client_id: clientId,
                    approved_scopes: ['openid', 'profile', 'email'],
                    consent_action: 'approve',
                    scope: 'openid profile email',
                });
                expect(approveResponse.body.authentication_code).toBeDefined();

                // Login again — consent is now stored, should skip consent
                const loginResponse = await loginRequest({
                    client_id: clientId,
                    scope: 'openid profile email',
                });

                expect(loginResponse.status).toEqual(201);
                expect(loginResponse.body.authentication_code).toBeDefined();
                expect(loginResponse.body.requires_consent).toBeUndefined();
            } finally {
                await clientApi.deleteClient(clientId).catch(() => {});
            }
        });

        it('should return auth code that can be exchanged for an access token', async () => {
            const freshClient = await clientApi.createClient(testTenantId, 'Token Exchange App', {
                redirectUris: [REDIRECT_URI],
                allowedScopes: 'openid profile email',
                isPublic: true,
            });
            const clientId = freshClient.client.clientId;

            try {
                const approveResponse = await consentRequest({
                    client_id: clientId,
                    approved_scopes: ['openid', 'profile'],
                    consent_action: 'approve',
                    scope: 'openid profile',
                });
                expect(approveResponse.body.authentication_code).toBeDefined();
                const authCode = approveResponse.body.authentication_code;

                // Exchange the auth code for an access token
                const tokenResponse = await app.getHttpServer()
                    .post('/api/oauth/token')
                    .send({
                        grant_type: 'authorization_code',
                        code: authCode,
                        client_id: clientId,
                        code_verifier: CODE_VERIFIER,
                        redirect_uri: REDIRECT_URI,
                    })
                    .set('Accept', 'application/json');

                expect(tokenResponse.status).toEqual(201);
                expect(tokenResponse.body.access_token).toBeDefined();
                expect(tokenResponse.body.token_type).toEqual('Bearer');
            } finally {
                await clientApi.deleteClient(clientId).catch(() => {});
            }
        });
    });

    // ─── Req 3.3: Consent denial returns access_denied ───────────────

    describe('consent endpoint — deny action (Req 3.3)', () => {
        it('should return access_denied error when user denies consent', async () => {
            const freshClient = await clientApi.createClient(testTenantId, 'Deny Test App', {
                redirectUris: [REDIRECT_URI],
                allowedScopes: 'openid profile email',
                isPublic: true,
            });
            const clientId = freshClient.client.clientId;

            try {
                const response = await consentRequest({
                    client_id: clientId,
                    approved_scopes: [],
                    consent_action: 'deny',
                });

                expect(response.status).toEqual(201);
                expect(response.body.error).toEqual('access_denied');
                expect(response.body.error_description).toBeDefined();
                expect(response.body.error_description).toContain('denied');
                // Must not return an auth code
                expect(response.body.authentication_code).toBeUndefined();
            } finally {
                await clientApi.deleteClient(clientId).catch(() => {});
            }
        });

        it('should not create a consent record when user denies (Req 3.3)', async () => {
            const freshClient = await clientApi.createClient(testTenantId, 'Deny No Record App', {
                redirectUris: [REDIRECT_URI],
                allowedScopes: 'openid profile email',
                isPublic: true,
            });
            const clientId = freshClient.client.clientId;

            try {
                // Deny consent
                const denyResponse = await consentRequest({
                    client_id: clientId,
                    approved_scopes: [],
                    consent_action: 'deny',
                });
                expect(denyResponse.body.error).toEqual('access_denied');

                // Login again — should still require consent (no record was created)
                const loginResponse = await loginRequest({
                    client_id: clientId,
                    scope: 'openid profile',
                });

                expect(loginResponse.status).toEqual(201);
                expect(loginResponse.body.requires_consent).toBe(true);
                expect(loginResponse.body.authentication_code).toBeUndefined();
            } finally {
                await clientApi.deleteClient(clientId).catch(() => {});
            }
        });
    });

    // ─── Req 6.4: Consent endpoint re-authenticates the user ─────────

    describe('consent endpoint — re-authentication (Req 6.4)', () => {
        it('should reject consent submission with wrong password', async () => {
            const freshClient = await clientApi.createClient(testTenantId, 'Reauth Test App', {
                redirectUris: [REDIRECT_URI],
                allowedScopes: 'openid profile email',
                isPublic: true,
            });
            const clientId = freshClient.client.clientId;

            try {
                const response = await consentRequest({
                    client_id: clientId,
                    approved_scopes: ['openid', 'profile'],
                    consent_action: 'approve',
                    email: 'admin@auth.server.com',
                    password: 'wrong-password-xyz',
                });

                // Should fail authentication — 4xx error
                expect(response.status).toBeGreaterThanOrEqual(400);
                expect(response.status).toBeLessThan(500);
                expect(response.body.authentication_code).toBeUndefined();
            } finally {
                await clientApi.deleteClient(clientId).catch(() => {});
            }
        });

        it('should reject consent submission with unknown email', async () => {
            const freshClient = await clientApi.createClient(testTenantId, 'Reauth Unknown Email App', {
                redirectUris: [REDIRECT_URI],
                allowedScopes: 'openid profile email',
                isPublic: true,
            });
            const clientId = freshClient.client.clientId;

            try {
                const response = await consentRequest({
                    client_id: clientId,
                    approved_scopes: ['openid'],
                    consent_action: 'approve',
                    email: 'nonexistent@example.com',
                    password: 'admin9000',
                });

                expect(response.status).toBeGreaterThanOrEqual(400);
                expect(response.status).toBeLessThan(500);
                expect(response.body.authentication_code).toBeUndefined();
            } finally {
                await clientApi.deleteClient(clientId).catch(() => {});
            }
        });
    });

    // ─── Req 6.4: Consent endpoint validates approved_scopes ─────────

    describe('consent endpoint — scope validation against client.allowedScopes (Req 6.4)', () => {
        it('should reject approved_scopes that exceed client.allowedScopes', async () => {
            // narrowScopesClientId only allows openid + profile
            // Attempting to approve email (not in allowedScopes) should fail or be silently dropped
            const response = await consentRequest({
                client_id: narrowScopesClientId,
                approved_scopes: ['openid', 'profile', 'email'],
                consent_action: 'approve',
                scope: 'openid profile email',
            });

            // Either the request is rejected (4xx) or email is silently dropped
            // and the auth code is issued for the valid intersection only.
            // The key invariant: if a code is returned, email must NOT be in the granted scopes.
            if (response.status >= 400) {
                expect(response.body.error).toBeDefined();
                expect(response.body.authentication_code).toBeUndefined();
            } else {
                // Code was issued — verify it can be exchanged and email is not in the token scopes
                expect(response.body.authentication_code).toBeDefined();
                const authCode = response.body.authentication_code;

                const tokenResponse = await app.getHttpServer()
                    .post('/api/oauth/token')
                    .send({
                        grant_type: 'authorization_code',
                        code: authCode,
                        client_id: narrowScopesClientId,
                        code_verifier: CODE_VERIFIER,
                        redirect_uri: REDIRECT_URI,
                    })
                    .set('Accept', 'application/json');

                expect(tokenResponse.status).toEqual(201);
                const decoded = app.jwtService().decode(tokenResponse.body.access_token, { json: true }) as any;
                // email scope must not be present — it was outside client.allowedScopes
                if (decoded?.scopes) {
                    expect(decoded.scopes).not.toContain('email');
                }
            }
        });

        it('should accept approved_scopes that are a subset of client.allowedScopes', async () => {
            const freshClient = await clientApi.createClient(testTenantId, 'Valid Scopes App', {
                redirectUris: [REDIRECT_URI],
                allowedScopes: 'openid profile email',
                isPublic: true,
            });
            const clientId = freshClient.client.clientId;

            try {
                // Approve only openid — a valid subset of allowedScopes
                const response = await consentRequest({
                    client_id: clientId,
                    approved_scopes: ['openid'],
                    consent_action: 'approve',
                    scope: 'openid',
                });

                expect(response.status).toEqual(201);
                expect(response.body.authentication_code).toBeDefined();
                expect(response.body.error).toBeUndefined();
            } finally {
                await clientApi.deleteClient(clientId).catch(() => {});
            }
        });

        it('should reject consent for an unknown client_id', async () => {
            const response = await consentRequest({
                client_id: 'totally-unknown-client-id-xyz',
                approved_scopes: ['openid'],
                consent_action: 'approve',
            });

            expect(response.status).toBeGreaterThanOrEqual(400);
            expect(response.status).toBeLessThan(500);
            expect(response.body.error).toBeDefined();
            expect(response.body.authentication_code).toBeUndefined();
        });
    });

    // ─── Req 3.1: New scopes trigger re-consent ───────────────────────

    describe('login endpoint — new scopes trigger re-consent (Req 3.1)', () => {
        it('should require consent again when client requests scopes beyond what was previously granted', async () => {
            const freshClient = await clientApi.createClient(testTenantId, 'Incremental Scopes App', {
                redirectUris: [REDIRECT_URI],
                allowedScopes: 'openid profile email',
                isPublic: true,
            });
            const clientId = freshClient.client.clientId;

            try {
                // Step 1: Grant consent for openid only
                const firstApprove = await consentRequest({
                    client_id: clientId,
                    approved_scopes: ['openid'],
                    consent_action: 'approve',
                    scope: 'openid',
                });
                expect(firstApprove.body.authentication_code).toBeDefined();

                // Step 2: Login requesting openid + profile — profile is new, consent required
                const loginResponse = await loginRequest({
                    client_id: clientId,
                    scope: 'openid profile',
                });

                expect(loginResponse.status).toEqual(201);
                expect(loginResponse.body.requires_consent).toBe(true);
                expect(loginResponse.body.requested_scopes).toContain('profile');
                expect(loginResponse.body.authentication_code).toBeUndefined();
            } finally {
                await clientApi.deleteClient(clientId).catch(() => {});
            }
        });
    });
});
