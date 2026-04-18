import * as fc from 'fast-check';
import { SharedTestFixture } from '../shared-test.fixture';
import { TokenFixture } from '../token.fixture';
import { ClientEntityClient } from '../api-client/client-entity-client';
import { TenantClient } from '../api-client/tenant-client';
import { expect2xx } from '../api-client/client';

/**
 * Feature: redirect-uri-validation, Properties 4 & 5: Token exchange redirect_uri binding
 */

/**
 * Feature: redirect-uri-validation, Property 4: Token exchange binding accepts iff request URI matches stored URI
 *
 * For any AuthCode record with a non-null redirect_uri, the token exchange SHALL succeed
 * if and only if the Token_Request includes a redirect_uri parameter whose value is
 * byte-for-byte equal to the stored value.
 *
 * **Validates: Requirements 4.1, 4.2, 4.3, 4.4**
 */
describe('Feature: redirect-uri-validation, Property 4: Token exchange binding accepts iff request URI matches stored URI', () => {
    let app: SharedTestFixture;
    let clientApi: ClientEntityClient;
    let testClientId: string;

    const REGISTERED_URI = 'https://prop-binding-test.example.com/callback';
    const email = 'admin@auth.server.com';
    const password = 'admin9000';
    const verifier = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopq';
    const challenge = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopq';

    beforeAll(async () => {
        app = new SharedTestFixture();
        const tokenFixture = new TokenFixture(app);
        const { accessToken } = await tokenFixture.fetchAccessToken(email, password, 'auth.server.com');

        clientApi = new ClientEntityClient(app, accessToken);
        const tenantClient = new TenantClient(app, accessToken);
        const tenant = await tenantClient.createTenant('prop-binding', 'prop-binding.example.com');

        const created = await clientApi.createClient(tenant.id, 'Binding Prop Client', {
            redirectUris: [REGISTERED_URI],
            allowedScopes: 'openid profile email',
            isPublic: true,
        });
        testClientId = created.client.clientId;

        // Pre-grant consent so login returns auth codes instead of requires_consent
        await app.getHttpServer()
            .post('/api/oauth/consent')
            .send({
                email,
                password,
                client_id: testClientId,
                code_challenge: challenge,
                code_challenge_method: 'plain',
                approved_scopes: ['openid', 'profile', 'email'],
                consent_action: 'approve',
                scope: 'openid profile email',
                redirect_uri: REGISTERED_URI,
            })
            .set('Accept', 'application/json');
    });

    afterAll(async () => {
        await clientApi.deleteClient(testClientId).catch(() => {});
        await app.close();
    });

    /** Login and get an auth code with the registered redirect_uri */
    async function loginForCode(): Promise<string> {
        const res = await app.getHttpServer()
            .post('/api/oauth/login')
            .send({
                email,
                password,
                client_id: testClientId,
                code_challenge: challenge,
                code_challenge_method: 'plain',
                scope: 'openid profile email',
                redirect_uri: REGISTERED_URI,
            })
            .set('Accept', 'application/json');

        expect2xx(res);
        return res.body.authentication_code;
    }

    /** Exchange an auth code for tokens, optionally with a redirect_uri */
    async function exchangeCode(code: string, redirectUri?: string): Promise<{ status: number; body: any }> {
        const payload: any = {
            grant_type: 'authorization_code',
            code,
            code_verifier: verifier,
            client_id: testClientId,
        };
        if (redirectUri !== undefined) {
            payload.redirect_uri = redirectUri;
        }

        const res = await app.getHttpServer()
            .post('/api/oauth/token')
            .send(payload)
            .set('Accept', 'application/json');

        return { status: res.status, body: res.body };
    }

    /**
     * Property 4: Token exchange succeeds iff request URI exactly matches stored URI.
     *
     * When an auth code was created with a redirect_uri (non-null stored value),
     * token exchange with the exact same URI succeeds, while exchange with any
     * different URI (or omitted URI) is rejected with invalid_grant.
     */
    it('token exchange succeeds iff request redirect_uri exactly matches stored redirect_uri', async () => {
        await fc.assert(
            fc.asyncProperty(
                // Generate an arbitrary URL that is guaranteed to differ from REGISTERED_URI
                fc.webUrl().filter(url => url !== REGISTERED_URI),
                async (mismatchUri) => {
                    // --- Exact match case: should succeed ---
                    const codeMatch = await loginForCode();
                    const matchResult = await exchangeCode(codeMatch, REGISTERED_URI);
                    expect(matchResult.status).toBeGreaterThanOrEqual(200);
                    expect(matchResult.status).toBeLessThan(300);
                    expect(matchResult.body.access_token).toBeDefined();

                    // --- Mismatch case: should fail with invalid_grant ---
                    const codeMismatch = await loginForCode();
                    const mismatchResult = await exchangeCode(codeMismatch, mismatchUri);
                    expect(mismatchResult.status).toBe(400);
                    expect(mismatchResult.body.error).toBe('invalid_grant');

                    // --- Omitted case: should fail with invalid_grant ---
                    const codeOmitted = await loginForCode();
                    const omittedResult = await exchangeCode(codeOmitted, undefined);
                    expect(omittedResult.status).toBe(400);
                    expect(omittedResult.body.error).toBe('invalid_grant');
                },
            ),
            { numRuns: 20 },
        );
    }, 120_000);
});


/**
 * Feature: redirect-uri-validation, Property 5: Null stored redirect_uri bypasses binding check
 *
 * For any AuthCode record with a null redirect_uri, the token exchange SHALL accept
 * the request regardless of whether a redirect_uri parameter is present or absent
 * in the Token_Request.
 *
 * **Validates: Requirements 4.5**
 */
describe('Feature: redirect-uri-validation, Property 5: Null stored redirect_uri bypasses binding check', () => {
    let app: SharedTestFixture;
    let clientApi: ClientEntityClient;
    let testClientId: string;

    const REGISTERED_URI = 'https://prop-null-binding-test.example.com/callback';
    const email = 'admin@auth.server.com';
    const password = 'admin9000';
    const verifier = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopq';
    const challenge = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopq';

    beforeAll(async () => {
        app = new SharedTestFixture();
        const tokenFixture = new TokenFixture(app);
        const { accessToken } = await tokenFixture.fetchAccessToken(email, password, 'auth.server.com');

        clientApi = new ClientEntityClient(app, accessToken);
        const tenantClient = new TenantClient(app, accessToken);
        const tenant = await tenantClient.createTenant('prop-null-bind', 'prop-null-bind.example.com');

        const created = await clientApi.createClient(tenant.id, 'Null Binding Prop Client', {
            redirectUris: [REGISTERED_URI],
            allowedScopes: 'openid profile email',
            isPublic: true,
        });
        testClientId = created.client.clientId;

        // Pre-grant consent so login returns auth codes instead of requires_consent
        await app.getHttpServer()
            .post('/api/oauth/consent')
            .send({
                email,
                password,
                client_id: testClientId,
                code_challenge: challenge,
                code_challenge_method: 'plain',
                approved_scopes: ['openid', 'profile', 'email'],
                consent_action: 'approve',
                scope: 'openid profile email',
                redirect_uri: REGISTERED_URI,
            })
            .set('Accept', 'application/json');
    });

    afterAll(async () => {
        await clientApi.deleteClient(testClientId).catch(() => {});
        await app.close();
    });

    /** Login WITHOUT redirect_uri so null is stored in the auth code */
    async function loginForCodeWithoutRedirectUri(): Promise<string> {
        const res = await app.getHttpServer()
            .post('/api/oauth/login')
            .send({
                email,
                password,
                client_id: testClientId,
                code_challenge: challenge,
                code_challenge_method: 'plain',
                scope: 'openid profile email',
            })
            .set('Accept', 'application/json');

        expect2xx(res);
        return res.body.authentication_code;
    }

    /** Exchange an auth code for tokens, optionally with a redirect_uri */
    async function exchangeCode(code: string, redirectUri?: string): Promise<{ status: number; body: any }> {
        const payload: any = {
            grant_type: 'authorization_code',
            code,
            code_verifier: verifier,
            client_id: testClientId,
        };
        if (redirectUri !== undefined) {
            payload.redirect_uri = redirectUri;
        }

        const res = await app.getHttpServer()
            .post('/api/oauth/token')
            .send(payload)
            .set('Accept', 'application/json');

        return { status: res.status, body: res.body };
    }

    /**
     * Property 5: When auth code has null redirect_uri, token exchange always succeeds
     * regardless of the redirect_uri value in the request.
     *
     * We generate arbitrary URI strings (and undefined) and verify that token exchange
     * succeeds for all of them when the stored redirect_uri is null.
     */
    it('token exchange succeeds with any redirect_uri when stored redirect_uri is null', async () => {
        await fc.assert(
            fc.asyncProperty(
                // Generate either an arbitrary URL string or undefined
                fc.option(fc.webUrl(), { nil: undefined }),
                async (requestRedirectUri) => {
                    const code = await loginForCodeWithoutRedirectUri();
                    const result = await exchangeCode(code, requestRedirectUri ?? undefined);

                    expect(result.status).toBeGreaterThanOrEqual(200);
                    expect(result.status).toBeLessThan(300);
                    expect(result.body.access_token).toBeDefined();
                },
            ),
            { numRuns: 20 },
        );
    }, 120_000);
});
