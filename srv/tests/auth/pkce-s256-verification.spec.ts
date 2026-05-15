import {SharedTestFixture} from '../shared-test.fixture';
import {TokenFixture} from '../token.fixture';
import {ClientEntityClient} from '../api-client/client-entity-client';
import {TenantClient} from '../api-client/tenant-client';
import {CryptUtil} from '../../src/util/crypt.util';

/**
 * Integration test: S256 end-to-end verification
 *
 * Validates the full PKCE round-trip through the authorize and token endpoints:
 * - Authorize with S256 challenge, exchange with correct verifier → success
 * - Authorize with S256 challenge, exchange with wrong verifier → invalid_grant
 * - Authorize with plain challenge, exchange with matching verifier → success
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
    let isolatedRedirectUri: string;

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
        const tokenResponse = await tokenFixture.fetchAccessTokenFlow(email, password, 'auth.server.com');
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

        isolatedRedirectUri = 'https://pkce-verify-test.example.com/callback';

        // Create a fresh public client with no PKCE history
        const created = await clientApi.createClient(testTenantId, 'PKCE Verification Test Client', {
            isPublic: true,
            requirePkce: false,
            allowedScopes: 'openid profile email',
            redirectUris: [isolatedRedirectUri],
        });
        isolatedClientId = created.client.clientId;

        // Pre-grant consent so authorize can issue codes without redirecting to consent UI
        await tokenFixture.preGrantConsentFlow(email, password, {
            clientId: isolatedClientId,
            redirectUri: isolatedRedirectUri,
            scope: 'openid profile email',
            state: 'consent-state',
            codeChallenge: verifier,
            codeChallengeMethod: 'plain',
        });
    });

    afterAll(async () => {
        if (isolatedClientId) {
            await clientApi.deleteClient(isolatedClientId).catch(() => {
            });
        }
        await app.close();
    });

    /** Helper: authorize and obtain an auth code with a given challenge and method */
    async function authorizeWithChallenge(challenge: string, method: string): Promise<string> {
        return tokenFixture.fetchAuthCodeWithConsentFlow(email, password, {
            clientId: isolatedClientId,
            redirectUri: isolatedRedirectUri,
            scope: 'openid profile email',
            state: 'test-state',
            codeChallenge: challenge,
            codeChallengeMethod: method,
        });
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
                redirect_uri: isolatedRedirectUri,
            })
            .set('Accept', 'application/json');
    }

    it('succeeds when S256 challenge is verified with the correct verifier', async () => {
        const code = await authorizeWithChallenge(s256Challenge, 'S256');
        const response = await exchangeToken(code, verifier);

        expect(response.status).toEqual(200);
        expect(response.body.access_token).toBeDefined();
        expect(response.body.token_type).toEqual('Bearer');
    });

    it('fails with invalid_grant when S256 challenge is verified with a wrong verifier', async () => {
        const code = await authorizeWithChallenge(s256Challenge, 'S256');
        const response = await exchangeToken(code, wrongVerifier);

        expect(response.status).toEqual(400);
        expect(response.body.error).toEqual('invalid_grant');
    });

    it('succeeds when plain challenge is verified with the matching verifier', async () => {
        // Use a separate fresh client to avoid the downgrade block from S256 tests above
        const freshCreated = await clientApi.createClient(testTenantId, 'PKCE Plain Verification Client', {
            isPublic: true,
            requirePkce: false,
            allowedScopes: 'openid profile email',
            redirectUris: [isolatedRedirectUri],
        });
        const freshClientId = freshCreated.client.clientId;

        try {
            await tokenFixture.preGrantConsentFlow(email, password, {
                clientId: freshClientId,
                redirectUri: isolatedRedirectUri,
                scope: 'openid profile email',
                state: 'consent-state',
                codeChallenge: verifier,
                codeChallengeMethod: 'plain',
            });

            const code = await tokenFixture.fetchAuthCodeWithConsentFlow(email, password, {
                clientId: freshClientId,
                redirectUri: isolatedRedirectUri,
                scope: 'openid profile email',
                state: 'test-state',
                codeChallenge: verifier,
                codeChallengeMethod: 'plain',
            });

            const tokenResponse = await app.getHttpServer()
                .post('/api/oauth/token')
                .send({
                    grant_type: 'authorization_code',
                    code,
                    client_id: freshClientId,
                    code_verifier: verifier,
                    redirect_uri: isolatedRedirectUri,
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
