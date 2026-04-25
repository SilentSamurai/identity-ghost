import {SharedTestFixture} from '../shared-test.fixture';
import {TokenFixture} from '../token.fixture';
import {ClientEntityClient} from '../api-client/client-entity-client';
import {TenantClient} from '../api-client/tenant-client';
import {CryptUtil} from '../../src/util/crypt.util';

/**
 * Integration test: S256 end-to-end verification
 *
 * Validates the full PKCE round-trip through the login and token endpoints:
 * - Login with S256 challenge, exchange with correct verifier → success
 * - Login with S256 challenge, exchange with wrong verifier → invalid_grant
 * - Login with plain challenge, exchange with matching verifier → success
 *
 * Uses an isolated client per test suite to avoid mutating the shared
 * auth.server.com default client's pkceMethodUsed field.
 *
 * Validates: Requirements 2.1, 2.2, 2.3
 */
describe('S256 end-to-end verification', () => {
    let app: SharedTestFixture;
    let tokenFixture: TokenFixture;
    let clientApi: ClientEntityClient;
    let testTenantId: string;

    // The isolated client used for all tests in this suite
    let isolatedClientId: string;

    const email = 'admin@auth.server.com';
    const password = 'admin9000';

    // Valid PKCE verifier (43-128 chars, unreserved charset)
    const verifier = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopq';
    const wrongVerifier = 'ZYXWVUTSRQPONMLKJIHGFEDCBAzyxwvutsrqponmlkj';

    // Compute S256 challenge from the verifier
    const s256Challenge = CryptUtil.generateCodeChallenge(verifier, 'S256');

    beforeAll(async () => {
        app = new SharedTestFixture();
        tokenFixture = new TokenFixture(app);

        // Obtain an admin token to create test resources
        const tokenResponse = await tokenFixture.fetchAccessToken(email, password, 'auth.server.com');
        const accessToken = tokenResponse.accessToken;

        clientApi = new ClientEntityClient(app, accessToken);
        const tenantApi = new TenantClient(app, accessToken);

        // Create an isolated tenant + client so pkceMethodUsed mutations don't bleed
        const uniqueSuffix = String(Date.now()).slice(-8);
        const tenant = await tenantApi.createTenant(
            `pkce-verify-${uniqueSuffix}`,
            `pkce-verify-${uniqueSuffix}.com`,
        );
        testTenantId = tenant.id;

        // Create a fresh public client with no PKCE history
        const created = await clientApi.createClient(testTenantId, 'PKCE Verification Test Client', {
            isPublic: true,
            requirePkce: false,
        });
        isolatedClientId = created.client.clientId;

        // Pre-grant consent so login can proceed past the consent check
        await app.getHttpServer()
            .post('/api/oauth/consent')
            .send({
                email,
                password,
                client_id: isolatedClientId,
                code_challenge: s256Challenge,
                code_challenge_method: 'S256',
                approved_scopes: ['openid', 'profile', 'email'],
                consent_action: 'approve',
                scope: 'openid profile email',
            })
            .set('Accept', 'application/json');
    });

    afterAll(async () => {
        if (isolatedClientId) {
            await clientApi.deleteClient(isolatedClientId).catch(() => {
            });
        }
        await app.close();
    });

    /** Helper: login and obtain an auth code with a given challenge and method */
    async function loginWithChallenge(challenge: string, method: string): Promise<string> {
        const response = await app.getHttpServer()
            .post('/api/oauth/login')
            .send({
                email,
                password,
                client_id: isolatedClientId,
                code_challenge: challenge,
                code_challenge_method: method,
            })
            .set('Accept', 'application/json');

        expect(response.status).toEqual(201);
        expect(response.body.authentication_code).toBeDefined();
        return response.body.authentication_code;
    }

    /** Helper: exchange an auth code for tokens */
    async function exchangeToken(code: string, codeVerifier: string) {
        return app.getHttpServer()
            .post('/api/oauth/token')
            .send({
                grant_type: 'authorization_code',
                code,
                client_id: isolatedClientId,
                code_verifier: codeVerifier,
            })
            .set('Accept', 'application/json');
    }

    it('succeeds when S256 challenge is verified with the correct verifier', async () => {
        const code = await loginWithChallenge(s256Challenge, 'S256');
        const response = await exchangeToken(code, verifier);

        expect(response.status).toEqual(200);
        expect(response.body.access_token).toBeDefined();
        expect(response.body.token_type).toEqual('Bearer');
    });

    it('fails with invalid_grant when S256 challenge is verified with a wrong verifier', async () => {
        const code = await loginWithChallenge(s256Challenge, 'S256');
        const response = await exchangeToken(code, wrongVerifier);

        expect(response.status).toEqual(400);
        expect(response.body.error).toEqual('invalid_grant');
    });

    it('succeeds when plain challenge is verified with the matching verifier', async () => {
        // Note: after the S256 tests above set pkceMethodUsed='S256' on the isolated client,
        // this test intentionally verifies that the downgrade check fires.
        // If you need to test plain after S256, create a separate fresh client.
        // This test uses a separate fresh client to avoid the downgrade block.
        const freshCreated = await clientApi.createClient(testTenantId, 'PKCE Plain Verification Client', {
            isPublic: true,
            requirePkce: false,
        });
        const freshClientId = freshCreated.client.clientId;

        try {
            // Pre-grant consent for the fresh client
            await app.getHttpServer()
                .post('/api/oauth/consent')
                .send({
                    email,
                    password,
                    client_id: freshClientId,
                    code_challenge: verifier,
                    code_challenge_method: 'plain',
                    approved_scopes: ['openid', 'profile', 'email'],
                    consent_action: 'approve',
                    scope: 'openid profile email',
                })
                .set('Accept', 'application/json');

            const loginResponse = await app.getHttpServer()
                .post('/api/oauth/login')
                .send({
                    email,
                    password,
                    client_id: freshClientId,
                    code_challenge: verifier,
                    code_challenge_method: 'plain',
                })
                .set('Accept', 'application/json');

            expect(loginResponse.status).toEqual(201);
            expect(loginResponse.body.authentication_code).toBeDefined();

            const tokenResponse = await app.getHttpServer()
                .post('/api/oauth/token')
                .send({
                    grant_type: 'authorization_code',
                    code: loginResponse.body.authentication_code,
                    client_id: freshClientId,
                    code_verifier: verifier,
                })
                .set('Accept', 'application/json');

            expect(tokenResponse.status).toEqual(200);
            expect(tokenResponse.body.access_token).toBeDefined();
            expect(tokenResponse.body.token_type).toEqual('Bearer');
        } finally {
            await clientApi.deleteClient(freshClientId).catch(() => {
            });
        }
    });
});
