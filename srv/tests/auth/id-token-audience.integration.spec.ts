import {SharedTestFixture} from "../shared-test.fixture";
import {TokenFixture} from "../token.fixture";
import {expect2xx} from "../api-client/client";
import {ClientEntityClient} from "../api-client/client-entity-client";
import {TenantClient} from "../api-client/tenant-client";
import {AdminTenantClient} from "../api-client/admin-tenant-client";
import * as jwt from "jsonwebtoken";

/**
 * Integration tests for ID Token Audience Validation.
 *
 * These tests verify:
 * 1. Existing aud/azp claim construction (Requirements 1, 2, 3)
 * 2. id_token_hint validation on the authorize endpoint (Requirement 5)
 * 3. Discovery document audience metadata (Requirement 6)
 *
 * Feature: id-token-audience-validation
 */
describe('ID Token Audience Validation Integration', () => {
    let app: SharedTestFixture;
    let tokenFixture: TokenFixture;
    let clientApi: ClientEntityClient;
    let adminAccessToken: string;

    const clientId = 'idtoken-aud-test.local';
    const verifier = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopq';
    const challenge = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopq';
    const email = 'admin@idtoken-aud-test.local';
    const password = 'admin9000';

    // Test tenant and client for id_token_hint tests
    let testTenant: { id: string; domain: string; clientId: string };
    let testClientWithResources: { id: string; clientId: string };
    const REDIRECT_URI = 'https://id-token-audience-test.example.com/callback';
    const ALLOWED_RESOURCES = ['https://api.example.com'];

    /** Helper: login → get auth code (handles consent for third-party clients) */
    async function loginForCode(opts?: {
        scope?: string;
        nonce?: string;
        client_id?: string;
        resource?: string;
    }): Promise<string> {
        const effectiveClientId = opts?.client_id || clientId;
        const body: any = {
            email,
            password,
            client_id: effectiveClientId,
            code_challenge: challenge,
            code_challenge_method: 'plain',
        };
        if (opts?.scope !== undefined) body.scope = opts.scope;
        if (opts?.nonce !== undefined) body.nonce = opts.nonce;
        if (opts?.resource !== undefined) body.resource = opts.resource;

        const res = await app.getHttpServer()
            .post('/api/oauth/login')
            .send(body)
            .set('Accept', 'application/json');

        expect2xx(res);

        // If consent is required (third-party client), approve it
        if (res.body.requires_consent) {
            const consentRes = await app.getHttpServer()
                .post('/api/oauth/consent')
                .send({
                    email,
                    password,
                    client_id: effectiveClientId,
                    code_challenge: challenge,
                    code_challenge_method: 'plain',
                    approved_scopes: res.body.requested_scopes,
                    consent_action: 'approve',
                    scope: opts?.scope,
                    resource: opts?.resource,
                })
                .set('Accept', 'application/json');

            expect2xx(consentRes);
            expect(consentRes.body.authentication_code).toBeDefined();
            return consentRes.body.authentication_code;
        }

        expect(res.body.authentication_code).toBeDefined();
        return res.body.authentication_code;
    }

    /** Helper: exchange auth code → token response */
    async function exchangeCode(code: string, client_id?: string): Promise<any> {
        const res = await app.getHttpServer()
            .post('/api/oauth/token')
            .send({
                grant_type: 'authorization_code',
                code,
                code_verifier: verifier,
                client_id: client_id || clientId,
            })
            .set('Accept', 'application/json');

        expect2xx(res);
        return res.body;
    }

    /** Helper: password grant → token response */
    async function passwordGrant(clientId: string, scope?: string): Promise<any> {
        const body: any = {
            grant_type: 'password',
            username: email,
            password,
            client_id: clientId,
        };
        if (scope) body.scope = scope;

        const res = await app.getHttpServer()
            .post('/api/oauth/token')
            .send(body)
            .set('Accept', 'application/json');

        expect2xx(res);
        return res.body;
    }

    /** Helper: send GET /api/oauth/authorize with the given query params, no redirect following. */
    function authorize(params: Record<string, string | number>) {
        const query = new URLSearchParams(
            Object.entries(params).map(([k, v]) => [k, String(v)]),
        ).toString();
        return app.getHttpServer()
            .get(`/api/oauth/authorize?${query}`)
            .redirects(0);
    }

    beforeAll(async () => {
        app = new SharedTestFixture();
        tokenFixture = new TokenFixture(app);

        const {accessToken} = await tokenFixture.fetchAccessToken(
            'admin@auth.server.com',
            'admin9000',
            'auth.server.com',
        );
        adminAccessToken = accessToken;

        clientApi = new ClientEntityClient(app, adminAccessToken);
        const adminTenantClient = new AdminTenantClient(app, adminAccessToken);

        const tenantClient = new TenantClient(app, adminAccessToken);
        const domain = `id-token-aud-${Date.now()}.com`;
        testTenant = await tenantClient.createTenant('id-tkn-aud-test', domain);

        // Add the admin user to the test tenant so login succeeds
        await adminTenantClient.addMembers(testTenant.id, [email]);

        // Create client with allowedResources for resource parameter tests
        const created = await clientApi.createClient(testTenant.id, 'ID Token Audience Test Client', {
            redirectUris: [REDIRECT_URI],
            allowedScopes: 'openid profile email',
            isPublic: true,
            allowedResources: ALLOWED_RESOURCES,
        });
        testClientWithResources = {id: created.client.id, clientId: created.client.clientId};
    });

    afterAll(async () => {
        await clientApi.deleteClient(testClientWithResources.clientId).catch(() => {
        });
        await app.close();
    });

    // ── 5.1: Existing aud/azp claim construction ─────────────────────────────

    describe('5.1 existing aud/azp claim construction (Requirements 1, 2, 3)', () => {
        it('should set aud as [clientId] and azp as clientId for password grant (Req 1.1, 2.1)', async () => {
            const tokenResponse = await passwordGrant(clientId, 'openid profile email');

            expect(tokenResponse.id_token).toBeDefined();
            const idTokenPayload = jwt.decode(tokenResponse.id_token) as any;

            // aud is a single-element array containing clientId
            expect(Array.isArray(idTokenPayload.aud)).toBe(true);
            expect(idTokenPayload.aud).toEqual([clientId]);

            // azp equals clientId
            expect(idTokenPayload.azp).toEqual(clientId);
        });

        it('should set aud as [clientId] and azp as clientId for authorization_code grant (Req 1.2, 2.2)', async () => {
            const code = await loginForCode({scope: 'openid profile email'});
            const tokenResponse = await exchangeCode(code);

            expect(tokenResponse.id_token).toBeDefined();
            const idTokenPayload = jwt.decode(tokenResponse.id_token) as any;

            // aud is a single-element array containing clientId
            expect(Array.isArray(idTokenPayload.aud)).toBe(true);
            expect(idTokenPayload.aud).toEqual([clientId]);

            // azp equals clientId
            expect(idTokenPayload.azp).toEqual(clientId);
        });

        it('should keep ID token aud as [clientId] when resource parameter is used (Req 3.1, 3.2)', async () => {
            // Login with resource parameter
            const code = await loginForCode({
                scope: 'openid profile email',
                client_id: testClientWithResources.clientId,
                resource: 'https://api.example.com',
            });
            const tokenResponse = await exchangeCode(code, testClientWithResources.clientId);

            expect(tokenResponse.id_token).toBeDefined();
            expect(tokenResponse.access_token).toBeDefined();

            const idTokenPayload = jwt.decode(tokenResponse.id_token) as any;
            const accessTokenPayload = jwt.decode(tokenResponse.access_token) as any;

            // ID token aud remains [clientId] only
            expect(Array.isArray(idTokenPayload.aud)).toBe(true);
            expect(idTokenPayload.aud).toEqual([testClientWithResources.clientId]);
            expect(idTokenPayload.azp).toEqual(testClientWithResources.clientId);

            // Access token aud includes the resource
            expect(Array.isArray(accessTokenPayload.aud)).toBe(true);
            expect(accessTokenPayload.aud).toContain('https://api.example.com');
        });
    });

    // ── 5.2: id_token_hint validation on authorize endpoint ──────────────────

    describe('5.2 id_token_hint validation on authorize endpoint (Requirements 5.1, 5.2, 5.3, 5.4)', () => {
        let validIdTokenHint: string;

        beforeAll(async () => {
            // Get an ID token to use as id_token_hint
            const code = await loginForCode({
                scope: 'openid profile email',
                client_id: testClientWithResources.clientId,
            });
            const tokenResponse = await exchangeCode(code, testClientWithResources.clientId);
            validIdTokenHint = tokenResponse.id_token;
            expect(validIdTokenHint).toBeDefined();
        });

        it('should accept authorize request with valid id_token_hint for same client_id (Req 5.1)', async () => {
            const res = await authorize({
                response_type: 'code',
                client_id: testClientWithResources.clientId,
                redirect_uri: REDIRECT_URI,
                scope: 'openid',
                state: 'test-state-hint-valid',
                id_token_hint: validIdTokenHint,
            });

            // Should redirect to /authorize (login page) without error
            expect(res.status).toEqual(302);
            const location = new URL(res.headers.location, 'http://localhost');
            expect(location.pathname).toEqual('/authorize');
            expect(location.searchParams.get('error')).toBeNull();
        });

        it('should reject authorize request with id_token_hint issued for different client_id (Req 5.2)', async () => {
            // Get an ID token issued for idtoken-aud-test.local (the default client for this test)
            const code = await loginForCode({scope: 'openid profile email'});
            const tokenResponse = await exchangeCode(code);
            const hintForDefaultClient = tokenResponse.id_token;

            // Use that hint on an authorize request for testClientWithResources — different client
            const res = await authorize({
                response_type: 'code',
                client_id: testClientWithResources.clientId,
                redirect_uri: REDIRECT_URI,
                scope: 'openid',
                state: 'test-state-hint-wrong-client',
                id_token_hint: hintForDefaultClient,
            });

            // Should redirect with invalid_request error
            expect(res.status).toEqual(302);
            const location = new URL(res.headers.location);
            expect(location.searchParams.get('error')).toEqual('invalid_request');
            expect(location.searchParams.get('error_description')).toBeDefined();
        });

        it('should reject authorize request with malformed (non-JWT) id_token_hint (Req 5.3)', async () => {
            const res = await authorize({
                response_type: 'code',
                client_id: testClientWithResources.clientId,
                redirect_uri: REDIRECT_URI,
                scope: 'openid',
                state: 'test-state-hint-malformed',
                id_token_hint: 'not-a-valid-jwt-token',
            });

            // Should redirect with invalid_request error
            expect(res.status).toEqual(302);
            const location = new URL(res.headers.location);
            expect(location.searchParams.get('error')).toEqual('invalid_request');
            expect(location.searchParams.get('error_description')).toBeDefined();
        });
    });

    // ── 5.3: Discovery document audience metadata ────────────────────────────

    describe('5.3 discovery document audience metadata (Requirements 6.1, 6.2)', () => {
        it('should include id_token_signing_alg_values_supported with RS256 (Req 6.1)', async () => {
            const res = await app.getHttpServer()
                .get(`/${testTenant.domain}/.well-known/openid-configuration`);

            expect(res.status).toEqual(200);
            expect(res.body.id_token_signing_alg_values_supported).toBeDefined();
            expect(Array.isArray(res.body.id_token_signing_alg_values_supported)).toBe(true);
            expect(res.body.id_token_signing_alg_values_supported).toContain('RS256');
        });

        it('should include token_endpoint (Req 6.2)', async () => {
            const res = await app.getHttpServer()
                .get(`/${testTenant.domain}/.well-known/openid-configuration`);

            expect(res.status).toEqual(200);
            expect(res.body.token_endpoint).toBeDefined();
            expect(typeof res.body.token_endpoint).toBe('string');
            expect(res.body.token_endpoint).toMatch(/^https?:\/\//);
        });
    });
});
