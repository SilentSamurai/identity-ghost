import * as fc from 'fast-check';
import {SharedTestFixture} from '../shared-test.fixture';
import {TokenFixture} from '../token.fixture';
import {ClientEntityClient} from '../api-client/client-entity-client';
import {TenantClient} from '../api-client/tenant-client';

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
    let tokenFixture: TokenFixture;
    let clientApi: ClientEntityClient;
    let testClientId: string;

    const REGISTERED_URI = 'https://prop-binding-test.example.com/callback';
    const email = 'admin@auth.server.com';
    const password = 'admin9000';
    const verifier = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopq';

    beforeAll(async () => {
        app = new SharedTestFixture();
        tokenFixture = new TokenFixture(app);
        const {accessToken} = await tokenFixture.fetchPasswordGrantAccessToken(email, password, 'auth.server.com');

        clientApi = new ClientEntityClient(app, accessToken);
        const tenantClient = new TenantClient(app, accessToken);
        const tenant = await tenantClient.createTenant('prop-binding', 'prop-binding.example.com');

        const created = await clientApi.createClient(tenant.id, 'Binding Prop Client', {
            redirectUris: [REGISTERED_URI],
            allowedScopes: 'openid profile email',
            isPublic: true,
        });
        testClientId = created.client.clientId;

        // Pre-grant consent so /authorize issues codes directly (third-party client).
        await tokenFixture.preGrantConsent(email, password, testClientId, REGISTERED_URI);
    });

    afterAll(async () => {
        await clientApi.deleteClient(testClientId).catch(() => {
        });
        await app.close();
    });

    /** Obtain a fresh auth code via login → authorize (cookie flow), bound to REGISTERED_URI. */
    async function loginForCode(): Promise<string> {
        return tokenFixture.fetchAuthCode(email, password, testClientId, REGISTERED_URI, {
            codeChallenge: verifier,
            codeChallengeMethod: 'plain',
        });
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

        return {status: res.status, body: res.body};
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
            {numRuns: 10},
        );
    }, 180_000);
});


/**
 * Feature: redirect-uri-validation, Property 5: Null stored redirect_uri bypasses binding check
 *
 * For any AuthCode record with a null redirect_uri, the token exchange SHALL accept
 * the request regardless of whether a redirect_uri parameter is present or absent
 * in the Token_Request.
 *
 * **Validates: Requirements 4.5**
 *
 * Note: The HTTP /authorize flow always validates and stores a redirect_uri against the
 * client's registered URIs (rejecting clients that have none). To create an AuthCode with
 * a null redirect_uri we seed one directly via the test-utils controller. This still
 * exercises the token-endpoint binding code-path, which is what Property 5 is about.
 */
describe('Feature: redirect-uri-validation, Property 5: Null stored redirect_uri bypasses binding check', () => {
    let app: SharedTestFixture;
    let tokenFixture: TokenFixture;
    let clientApi: ClientEntityClient;
    let testClientId: string;
    let userId: string;
    let tenantId: string;

    const REGISTERED_URI = 'https://prop-null-binding-test.example.com/callback';
    const email = 'admin@auth.server.com';
    const password = 'admin9000';
    const verifier = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopq';
    const challenge = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopq';

    beforeAll(async () => {
        app = new SharedTestFixture();
        tokenFixture = new TokenFixture(app);
        const {accessToken} = await tokenFixture.fetchPasswordGrantAccessToken(email, password, 'auth.server.com');

        clientApi = new ClientEntityClient(app, accessToken);
        const tenantClient = new TenantClient(app, accessToken);
        const tenant = await tenantClient.createTenant('prop-null-bind', 'prop-null-bind.example.com');
        tenantId = tenant.id;

        const created = await clientApi.createClient(tenant.id, 'Null Binding Prop Client', {
            redirectUris: [REGISTERED_URI],
            allowedScopes: 'openid profile email',
            isPublic: true,
        });
        testClientId = created.client.clientId;

        // Look up the admin user's id so we can seed auth codes with a valid FK.
        const userRes = await app.getHttpServer().get(`/api/test-utils/users/by-email/${encodeURIComponent(email)}`);
        expect(userRes.status).toBe(200);
        userId = userRes.body.id;
    });

    afterAll(async () => {
        await clientApi.deleteClient(testClientId).catch(() => {
        });
        await app.close();
    });

    /** Seed an auth code with null redirect_uri via the test-utils controller. */
    async function seedCodeWithoutRedirectUri(): Promise<string> {
        const res = await app.getHttpServer()
            .post('/api/test-utils/auth-codes')
            .send({
                userId,
                tenantId,
                clientId: testClientId,
                codeChallenge: challenge,
                method: 'plain',
                redirectUri: null,
                scope: 'openid profile email',
            })
            .set('Accept', 'application/json');
        expect(res.status).toBeGreaterThanOrEqual(200);
        expect(res.status).toBeLessThan(300);
        return res.body.code;
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

        return {status: res.status, body: res.body};
    }

    /**
     * Property 5: When auth code has null redirect_uri, token exchange always succeeds
     * regardless of the redirect_uri value in the request.
     */
    it('token exchange succeeds with any redirect_uri when stored redirect_uri is null', async () => {
        await fc.assert(
            fc.asyncProperty(
                // Generate either an arbitrary URL string or undefined
                fc.option(fc.webUrl(), {nil: undefined}),
                async (requestRedirectUri) => {
                    const code = await seedCodeWithoutRedirectUri();
                    const result = await exchangeCode(code, requestRedirectUri ?? undefined);

                    expect(result.status).toBeGreaterThanOrEqual(200);
                    expect(result.status).toBeLessThan(300);
                    expect(result.body.access_token).toBeDefined();
                },
            ),
            {numRuns: 20},
        );
    }, 180_000);
});
