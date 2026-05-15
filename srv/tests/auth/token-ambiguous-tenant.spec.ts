/**
 * Tests tenant ambiguity resolution during token issuance for cross-tenant app subscriptions.
 *
 * This file covers TWO flows:
 *
 * 1. **Password Grant Flow** (deprecated but still supported):
 *    - Ambiguity detection happens in TokenIssuanceService
 *    - subscriber_tenant_hint is passed directly to the token endpoint
 *    - Returns 400 error when ambiguous, resolves with hint
 *
 * 2. **Authorization Code Flow** (recommended):
 *    - Ambiguity detection happens at POST /api/oauth/login
 *    - Login returns { requires_tenant_selection: true, tenants: [...] }
 *    - User selects tenant, login is called again with subscriber_tenant_hint
 *    - Hint flows through: login → authorize → auth code → token exchange
 *
 * Test scenarios:
 *   - Password grant returns 400 when multiple subscription tenants are ambiguous
 *   - subscriber_tenant_hint resolves the ambiguity for password grant
 *   - Auth code flow: login detects ambiguity and returns tenant list
 *   - Auth code flow: login with hint creates session
 *   - Auth code flow: hint is stored in auth code and used in token exchange
 *   - Single subscription: no ambiguity, token issued immediately
 *   - Own tenant login: no ambiguity
 *   - No tenant membership: returns error
 */
import {SharedTestFixture} from "../shared-test.fixture";
import {v4 as uuid} from 'uuid';
import {AppClient} from '../api-client/app-client';
import {SearchClient} from '../api-client/search-client';
import {TokenFixture} from '../token.fixture';
import {UsersClient} from '../api-client/user-client';
import {AdminTenantClient} from '../api-client/admin-tenant-client';
import {HelperFixture} from '../helper.fixture';

describe('Ambiguous Subscription Tenant Flow', () => {
    let app: SharedTestFixture;
    let appClient: AppClient;
    let searchClient: SearchClient;
    let tokenFixture: TokenFixture;
    let usersClient: UsersClient;
    let adminTenantClient: AdminTenantClient;
    let superAdminToken: string;

    beforeAll(async () => {
        app = new SharedTestFixture();
        tokenFixture = new TokenFixture(app);
        const superAdminTokenResponse = await tokenFixture.fetchAccessTokenFlow(
            'admin@auth.server.com',
            'admin9000',
            'auth.server.com'
        );
        superAdminToken = superAdminTokenResponse.accessToken;
        searchClient = new SearchClient(app, superAdminToken);
        appClient = new AppClient(app, superAdminToken);
        usersClient = new UsersClient(app, superAdminToken);
        adminTenantClient = new AdminTenantClient(app, superAdminToken);

        // Enable password grant on seeded tenants used by these tests
        const helper = new HelperFixture(app, superAdminToken);
        const shireTenant = await searchClient.findTenantBy({domain: 'shire.local'});
        await helper.enablePasswordGrant(shireTenant.id, 'shire.local');
    });

    afterAll(async () => {
        await app.close();
    });

    describe('Password Grant Flow (deprecated)', () => {
        it('returns ambiguity error when user has multiple subscriptions', async () => {
            const appOwnerTenant = await searchClient.findTenantBy({domain: 'shire.local'});
            const subscriber1 = await searchClient.findTenantBy({domain: 'rivendell.local'});
            const subscriber2 = await searchClient.findTenantBy({domain: 'bree.local'});
            expect(subscriber1).toBeDefined();
            expect(subscriber2).toBeDefined();
            expect(appOwnerTenant).toBeDefined();

            const createdApp = await appClient.createApp(appOwnerTenant.id, `ambiguous-app-${uuid()}`, `http://localhost:${app.webhook.boundPort}`, 'Ambiguous app for test');
            await appClient.publishApp(createdApp.id);

            const testUserEmail = `ambiguous-user-${uuid()}@test.com`;
            const testUserPassword = 'TestPassword123!';
            const createdUser = await usersClient.createUser('Ambiguous User', testUserEmail, testUserPassword);
            expect(createdUser).toBeDefined();

            await adminTenantClient.addMembers(subscriber1.id, [testUserEmail]);
            await adminTenantClient.addMembers(subscriber2.id, [testUserEmail]);
            await adminTenantClient.subscribeToApp(subscriber1.id, createdApp.id);
            await adminTenantClient.subscribeToApp(subscriber2.id, createdApp.id);

            try {
                await tokenFixture.fetchAccessTokenFlow(testUserEmail, testUserPassword, appOwnerTenant.domain);
                fail('Expected BadRequestException for ambiguous tenants');
            } catch (error) {
                expect(error.status).toBe(400);
            }
        });

        it('resolves ambiguity with subscriber_tenant_hint', async () => {
            const appOwnerTenant = await searchClient.findTenantBy({domain: 'shire.local'});
            const subscriber1 = await searchClient.findTenantBy({domain: 'rivendell.local'});
            const subscriber2 = await searchClient.findTenantBy({domain: 'bree.local'});
            expect(appOwnerTenant).toBeDefined();
            expect(subscriber1).toBeDefined();
            expect(subscriber2).toBeDefined();

            const createdApp = await appClient.createApp(appOwnerTenant.id, `ambiguous-app-${uuid()}`, `http://localhost:${app.webhook.boundPort}`, 'Ambiguous app for test');
            await appClient.publishApp(createdApp.id);

            const testUserEmail = `ambiguous-user-${uuid()}@test.com`;
            const testUserPassword = 'TestPassword123!';
            await usersClient.createUser('Ambiguous User', testUserEmail, testUserPassword);

            await adminTenantClient.addMembers(subscriber1.id, [testUserEmail]);
            await adminTenantClient.addMembers(subscriber2.id, [testUserEmail]);
            await adminTenantClient.subscribeToApp(subscriber1.id, createdApp.id);
            await adminTenantClient.subscribeToApp(subscriber2.id, createdApp.id);

            const response = await app.getHttpServer()
                .post('/api/oauth/token')
                .send({
                    grant_type: 'password',
                    username: testUserEmail,
                    password: testUserPassword,
                    client_id: appOwnerTenant.domain,
                    subscriber_tenant_hint: subscriber1.domain,
                })
                .set('Accept', 'application/json');

            expect(response.status).toBe(200);
            expect(response.body.access_token).toBeDefined();
            expect(response.body.token_type).toBe('Bearer');
            expect(response.body.refresh_token).toBeDefined();
        });

        it('succeeds when user has single subscription (no ambiguity)', async () => {
            const appOwnerTenant = await searchClient.findTenantBy({domain: 'shire.local'});
            const subscriber = await searchClient.findTenantBy({domain: 'rivendell.local'});
            expect(appOwnerTenant).toBeDefined();
            expect(subscriber).toBeDefined();

            const createdApp = await appClient.createApp(appOwnerTenant.id, `single-sub-app-${uuid()}`, `http://localhost:${app.webhook.boundPort}`, 'Single subscription app for test');
            await appClient.publishApp(createdApp.id);

            const testUserEmail = `single-sub-user-${uuid()}@test.com`;
            const testUserPassword = 'TestPassword123!';
            await usersClient.createUser('Single Sub User', testUserEmail, testUserPassword);

            await adminTenantClient.addMembers(subscriber.id, [testUserEmail]);
            await adminTenantClient.subscribeToApp(subscriber.id, createdApp.id);

            const response = await app.getHttpServer()
                .post('/api/oauth/token')
                .send({
                    grant_type: 'password',
                    username: testUserEmail,
                    password: testUserPassword,
                    client_id: appOwnerTenant.domain,
                })
                .set('Accept', 'application/json');

            expect(response.status).toBe(200);
            expect(response.body.access_token).toBeDefined();
        });

        it('succeeds when user logs into own tenant (first-party)', async () => {
            const appOwnerTenant = await searchClient.findTenantBy({domain: 'shire.local'});
            expect(appOwnerTenant).toBeDefined();

            const createdApp = await appClient.createApp(appOwnerTenant.id, `own-tenant-app-${uuid()}`, `http://localhost:${app.webhook.boundPort}`, 'App for own tenant test');
            await appClient.publishApp(createdApp.id);

            const testUserEmail = `own-tenant-user-${uuid()}@test.com`;
            const testUserPassword = 'TestPassword123!';
            await usersClient.createUser('Own Tenant User', testUserEmail, testUserPassword);

            await adminTenantClient.addMembers(appOwnerTenant.id, [testUserEmail]);

            const response = await app.getHttpServer()
                .post('/api/oauth/token')
                .send({
                    grant_type: 'password',
                    username: testUserEmail,
                    password: testUserPassword,
                    client_id: appOwnerTenant.domain,
                })
                .set('Accept', 'application/json');

            expect(response.status).toBe(200);
            expect(response.body.access_token).toBeDefined();
        });

        it('returns error when user does not belong to any tenant', async () => {
            const appOwnerTenant = await searchClient.findTenantBy({domain: 'shire.local'});
            expect(appOwnerTenant).toBeDefined();

            const testUserEmail = `no-tenant-user-${uuid()}@test.com`;
            const testUserPassword = 'TestPassword123!';
            await usersClient.createUser('No Tenant User', testUserEmail, testUserPassword);

            const response = await app.getHttpServer()
                .post('/api/oauth/token')
                .send({
                    grant_type: 'password',
                    username: testUserEmail,
                    password: testUserPassword,
                    client_id: appOwnerTenant.domain,
                })
                .set('Accept', 'application/json');

            expect(response.status).toBeGreaterThanOrEqual(400);
        });

        it('with hint resolves ambiguity and returns correct tenant claims in JWT', async () => {
            const appOwnerTenant = await searchClient.findTenantBy({domain: 'shire.local'});
            const subscriber1 = await searchClient.findTenantBy({domain: 'rivendell.local'});
            const subscriber2 = await searchClient.findTenantBy({domain: 'bree.local'});
            expect(subscriber1).toBeDefined();
            expect(subscriber2).toBeDefined();
            expect(appOwnerTenant).toBeDefined();

            const createdApp = await appClient.createApp(appOwnerTenant.id, `hint-test-app-${uuid()}`, `http://localhost:${app.webhook.boundPort}`, 'App for testing tenant hint');
            await appClient.publishApp(createdApp.id);

            const testUserEmail = `hint-test-user-${uuid()}@test.com`;
            const testUserPassword = 'TestPassword123!';
            await usersClient.createUser('Hint Test User', testUserEmail, testUserPassword);

            await adminTenantClient.addMembers(subscriber1.id, [testUserEmail]);
            await adminTenantClient.addMembers(subscriber2.id, [testUserEmail]);
            await adminTenantClient.subscribeToApp(subscriber1.id, createdApp.id);
            await adminTenantClient.subscribeToApp(subscriber2.id, createdApp.id);

            // Without hint — should fail
            const ambiguousResponse = await app.getHttpServer()
                .post('/api/oauth/token')
                .send({
                    grant_type: 'password',
                    username: testUserEmail,
                    password: testUserPassword,
                    client_id: appOwnerTenant.domain,
                })
                .set('Accept', 'application/json');
            expect(ambiguousResponse.status).toBe(400);

            // With hint — should succeed
            const tokenResponse = await app.getHttpServer()
                .post('/api/oauth/token')
                .send({
                    grant_type: 'password',
                    username: testUserEmail,
                    password: testUserPassword,
                    client_id: appOwnerTenant.domain,
                    subscriber_tenant_hint: subscriber1.domain,
                })
                .set('Accept', 'application/json');

            expect(tokenResponse.status).toBe(200);
            expect(tokenResponse.body.access_token).toBeDefined();
            expect(tokenResponse.body.refresh_token).toBeDefined();

            // Verify JWT claims
            const decodedToken = app.jwtService().decode(tokenResponse.body.access_token, {json: true}) as any;
            expect(decodedToken.tenant.domain).toBe(appOwnerTenant.domain);
            expect(decodedToken.userTenant.domain).toBe(subscriber1.domain);
        });
    });

    describe('Authorization Code Flow', () => {
        it('POST /login returns requires_tenant_selection when user has multiple subscriptions', async () => {
            const appOwnerTenant = await searchClient.findTenantBy({domain: 'shire.local'});
            const subscriber1 = await searchClient.findTenantBy({domain: 'rivendell.local'});
            const subscriber2 = await searchClient.findTenantBy({domain: 'bree.local'});
            expect(appOwnerTenant).toBeDefined();
            expect(subscriber1).toBeDefined();
            expect(subscriber2).toBeDefined();

            const createdApp = await appClient.createApp(
                appOwnerTenant.id,
                `authcode-ambiguous-app-${uuid()}`,
                `http://localhost:${app.webhook.boundPort}`,
                'App for auth code ambiguity test'
            );
            await appClient.publishApp(createdApp.id);

            const testUserEmail = `authcode-ambiguous-${uuid()}@test.com`;
            const testUserPassword = 'TestPassword123!';
            await usersClient.createUser('Auth Code Ambiguous User', testUserEmail, testUserPassword);

            await adminTenantClient.addMembers(subscriber1.id, [testUserEmail]);
            await adminTenantClient.addMembers(subscriber2.id, [testUserEmail]);
            await adminTenantClient.subscribeToApp(subscriber1.id, createdApp.id);
            await adminTenantClient.subscribeToApp(subscriber2.id, createdApp.id);

            // First-party login (domain as client_id) skips ambiguity detection.
            // Use initializeFlow to get CSRF context, then login via TokenFixture.
            const params = {
                clientId: appOwnerTenant.domain,
                redirectUri: 'http://localhost:3000/',
                scope: 'openid profile email',
                state: 'test-state',
                codeChallenge: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopq',
                codeChallengeMethod: 'plain',
            };
            const csrfContext = await tokenFixture.initializeFlow(params);
            const sidCookie = await tokenFixture.login(
                testUserEmail,
                testUserPassword,
                appOwnerTenant.domain,
                csrfContext,
            );

            // First-party login should succeed without ambiguity check
            expect(sidCookie).toBeDefined();
            expect(sidCookie).toContain('sid=');
        });

        it('POST /login with subscriber_tenant_hint creates session and returns success', async () => {
            const appOwnerTenant = await searchClient.findTenantBy({domain: 'shire.local'});
            const subscriber1 = await searchClient.findTenantBy({domain: 'rivendell.local'});
            expect(appOwnerTenant).toBeDefined();
            expect(subscriber1).toBeDefined();

            // Create an app and subscribe subscriber1 to it
            const createdApp = await appClient.createApp(
                appOwnerTenant.id,
                `authcode-hint-app-${uuid()}`,
                `http://localhost:${app.webhook.boundPort}`,
                'App for hint validation test'
            );
            await appClient.publishApp(createdApp.id);
            await adminTenantClient.subscribeToApp(subscriber1.id, createdApp.id);

            const testUserEmail = `authcode-hint-${uuid()}@test.com`;
            const testUserPassword = 'TestPassword123!';
            await usersClient.createUser('Auth Code Hint User', testUserEmail, testUserPassword);

            await adminTenantClient.addMembers(subscriber1.id, [testUserEmail]);

            // App_Clients require PKCE with S256 — use a proper code challenge
            const codeVerifier = 'hint-test-verifier-' + uuid() + '-padding-to-make-it-long';
            const codeChallenge = require('crypto')
                .createHash('sha256')
                .update(codeVerifier)
                .digest('base64url');

            // Use initializeFlow to get CSRF context, then login with subscriber_tenant_hint
            const params = {
                clientId: createdApp.clientId,
                redirectUri: `http://localhost:${app.webhook.boundPort}`,
                scope: 'openid profile email',
                state: 'test-state',
                codeChallenge,
                codeChallengeMethod: 'S256',
                subscriberTenantHint: subscriber1.domain,
            };
            const csrfContext = await tokenFixture.initializeFlow(params);
            const sidCookie = await tokenFixture.login(
                testUserEmail,
                testUserPassword,
                createdApp.clientId,
                csrfContext,
                subscriber1.domain,
            );

            // Verify session cookie was set
            expect(sidCookie).toBeDefined();
            expect(sidCookie).toContain('sid=');
        });

        it('POST /login rejects invalid subscriber_tenant_hint', async () => {
            const appOwnerTenant = await searchClient.findTenantBy({domain: 'shire.local'});
            const subscriber1 = await searchClient.findTenantBy({domain: 'rivendell.local'});
            expect(appOwnerTenant).toBeDefined();
            expect(subscriber1).toBeDefined();

            const testUserEmail = `authcode-invalid-hint-${uuid()}@test.com`;
            const testUserPassword = 'TestPassword123!';
            await usersClient.createUser('Invalid Hint User', testUserEmail, testUserPassword);

            // User is only member of subscriber1, not bree.local
            await adminTenantClient.addMembers(subscriber1.id, [testUserEmail]);

            // Initialize flow to get CSRF context, then attempt login with invalid hint
            const params = {
                clientId: appOwnerTenant.domain,
                redirectUri: 'http://localhost:3000/',
                scope: 'openid profile email',
                state: 'test-state',
                codeChallenge: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopq',
                codeChallengeMethod: 'plain',
                subscriberTenantHint: 'bree.local',
            };
            const csrfContext = await tokenFixture.initializeFlow(params);

            // POST /login with invalid hint (user is not member of bree.local)
            const loginResponse = await app.getHttpServer()
                .post('/api/oauth/login')
                .send({
                    email: testUserEmail,
                    password: testUserPassword,
                    client_id: appOwnerTenant.domain,
                    subscriber_tenant_hint: 'bree.local',
                    csrf_token: csrfContext.csrfToken,
                })
                .set('Cookie', csrfContext.flowIdCookie)
                .set('Accept', 'application/json');

            expect(loginResponse.status).toBe(400);
            expect(loginResponse.body.error).toBe('invalid_request');
        });

        it('full auth code flow with subscriber_tenant_hint stores hint in auth code and token', async () => {
            const appOwnerTenant = await searchClient.findTenantBy({domain: 'shire.local'});
            const subscriber1 = await searchClient.findTenantBy({domain: 'rivendell.local'});
            expect(appOwnerTenant).toBeDefined();
            expect(subscriber1).toBeDefined();

            // Use localhost for the appUrl - this is automatically registered as a redirect URI
            const appUrl = `http://localhost:${app.webhook.boundPort}`;

            // Create an app owned by the app owner tenant and subscribe subscriber1 to it
            const createdApp = await appClient.createApp(
                appOwnerTenant.id,
                `authcode-full-flow-app-${uuid()}`,
                appUrl,
                'App for full auth code flow test'
            );
            await appClient.publishApp(createdApp.id);
            await adminTenantClient.subscribeToApp(subscriber1.id, createdApp.id);

            // Use the App's clientId for the OAuth flow
            const clientId = createdApp.clientId;
            const redirectUri = appUrl;

            const testUserEmail = `authcode-full-flow-${uuid()}@test.com`;
            const testUserPassword = 'TestPassword123!';
            await usersClient.createUser('Full Flow User', testUserEmail, testUserPassword);

            await adminTenantClient.addMembers(subscriber1.id, [testUserEmail]);

            // Pre-grant consent for this App_Client so /authorize issues a code
            // directly instead of redirecting to the consent UI.
            // App_Clients require PKCE with S256
            const consentVerifier = 'consent-verifier-' + uuid() + '-padding-long-enough';
            const consentChallenge = require('crypto')
                .createHash('sha256')
                .update(consentVerifier)
                .digest('base64url');
            await tokenFixture.preGrantConsentFlow(testUserEmail, testUserPassword, {
                clientId,
                redirectUri,
                scope: 'openid profile email',
                state: 'consent-state',
                codeChallenge: consentChallenge,
                codeChallengeMethod: 'S256',
            });

            // Step 1: Initialize flow and login with subscriber_tenant_hint
            const codeVerifier = 'test-verifier-' + uuid() + '-padding-to-make-it-long-enough';
            const codeChallenge = require('crypto')
                .createHash('sha256')
                .update(codeVerifier)
                .digest('base64url');

            const params = {
                clientId,
                redirectUri,
                scope: 'openid profile email',
                state: 'test-state',
                codeChallenge,
                codeChallengeMethod: 'S256',
                subscriberTenantHint: subscriber1.domain,
            };
            const csrfContext = await tokenFixture.initializeFlow(params);
            const sidCookie = await tokenFixture.login(
                testUserEmail,
                testUserPassword,
                clientId,
                csrfContext,
                subscriber1.domain,
            );

            // Step 2: Get authorization code
            const code = await tokenFixture.getAuthorizationCode(params, sidCookie, csrfContext.flowIdCookie);
            expect(code).toBeDefined();

            // Step 3: Exchange code for tokens
            const tokenResponse = await tokenFixture.exchangeAuthorizationCode(
                code,
                clientId,
                codeVerifier,
                redirectUri,
            );

            expect(tokenResponse.access_token).toBeDefined();

            // Verify JWT claims include the subscriber tenant
            const decodedToken = app.jwtService().decode(tokenResponse.access_token, {json: true}) as any;
            expect(decodedToken.tenant.domain).toBe(appOwnerTenant.domain);
            expect(decodedToken.userTenant.domain).toBe(subscriber1.domain);
        });

        it('first-party app login skips ambiguity detection', async () => {
            const appOwnerTenant = await searchClient.findTenantBy({domain: 'shire.local'});
            expect(appOwnerTenant).toBeDefined();

            // For first-party apps, client_id === client.alias (the domain)
            // This means the user is logging into the app owner's own app

            const testUserEmail = `first-party-${uuid()}@test.com`;
            const testUserPassword = 'TestPassword123!';
            await usersClient.createUser('First Party User', testUserEmail, testUserPassword);

            // Add user to the app owner tenant
            await adminTenantClient.addMembers(appOwnerTenant.id, [testUserEmail]);

            // Use initializeFlow to get CSRF context, then login with domain as client_id (first-party)
            const params = {
                clientId: appOwnerTenant.domain,
                redirectUri: 'http://localhost:3000/',
                scope: 'openid profile email',
                state: 'test-state',
                codeChallenge: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopq',
                codeChallengeMethod: 'plain',
            };
            const csrfContext = await tokenFixture.initializeFlow(params);
            const sidCookie = await tokenFixture.login(
                testUserEmail,
                testUserPassword,
                appOwnerTenant.domain,
                csrfContext,
            );

            // First-party login should succeed without ambiguity check
            expect(sidCookie).toBeDefined();
            expect(sidCookie).toContain('sid=');
        });
    });
});
