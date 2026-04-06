import {SharedTestFixture} from "../shared-test.fixture";
import {TokenFixture} from "../token.fixture";

/**
 * Integration tests for refresh token scope down-scoping.
 *
 * Validates:
 *   - Narrowing scope succeeds
 *   - Broadening scope returns invalid_scope
 *   - Omitting scope uses the record's scope
 *   - Requirements: 8.1, 8.2, 8.3
 */
describe('Refresh Token Scope Down-Scoping', () => {
    let app: SharedTestFixture;
    let tokenFixture: TokenFixture;

    beforeAll(async () => {
        app = new SharedTestFixture();
        tokenFixture = new TokenFixture(app);
    });

    afterAll(async () => {
        await app.close();
    });

    /** Helper: get fresh tokens and tenant credentials */
    async function getFreshTokensAndCreds() {
        const result = await tokenFixture.fetchAccessToken(
            'admin@auth.server.com',
            'admin9000',
            'auth.server.com',
        );

        const creds = await app.getHttpServer()
            .get('/api/tenant/my/credentials')
            .set('Authorization', `Bearer ${result.accessToken}`);

        expect(creds.status).toEqual(200);

        return {
            accessToken: result.accessToken,
            refreshToken: result.refreshToken,
            clientId: creds.body.clientId,
            clientSecret: creds.body.clientSecret,
        };
    }

    /** Helper: perform a refresh token grant with optional scope */
    function refreshGrant(
        refreshToken: string,
        clientId: string,
        clientSecret: string,
        scope?: string,
    ) {
        const body: any = {
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
            client_id: clientId,
            client_secret: clientSecret,
        };
        if (scope !== undefined) body.scope = scope;

        return app.getHttpServer()
            .post('/api/oauth/token')
            .send(body)
            .set('Accept', 'application/json');
    }

    it('omitting scope preserves the original scope', async () => {
        const {refreshToken, clientId, clientSecret} = await getFreshTokensAndCreds();

        const response = await refreshGrant(refreshToken, clientId, clientSecret);

        expect(response.status).toEqual(201);
        expect(response.body.scope).toBeDefined();
        // Default scopes should be present (openid profile email)
        const scopes = response.body.scope.split(' ');
        expect(scopes).toContain('openid');
    });

    it('narrowing scope to a subset succeeds', async () => {
        const {refreshToken, clientId, clientSecret} = await getFreshTokensAndCreds();

        // Request only 'openid' — a subset of the default 'openid profile email'
        const response = await refreshGrant(refreshToken, clientId, clientSecret, 'openid');

        expect(response.status).toEqual(201);
        expect(response.body.scope).toBeDefined();
        expect(response.body.scope).toEqual('openid');
    });

    it('narrowing to two scopes succeeds', async () => {
        const {refreshToken, clientId, clientSecret} = await getFreshTokensAndCreds();

        const response = await refreshGrant(refreshToken, clientId, clientSecret, 'openid email');

        expect(response.status).toEqual(201);
        expect(response.body.scope).toBeDefined();
        const grantedScopes = response.body.scope.split(' ').sort();
        expect(grantedScopes).toEqual(['email', 'openid']);
    });

    it('broadening scope returns invalid_scope', async () => {
        const {refreshToken, clientId, clientSecret} = await getFreshTokensAndCreds();

        // Request a scope that was never granted
        const response = await refreshGrant(
            refreshToken,
            clientId,
            clientSecret,
            'openid profile email admin.write',
        );

        expect(response.status).toEqual(400);
        expect(response.body.error).toEqual('invalid_scope');
    });

    it('requesting a completely unknown scope returns invalid_scope', async () => {
        const {refreshToken, clientId, clientSecret} = await getFreshTokensAndCreds();

        const response = await refreshGrant(
            refreshToken,
            clientId,
            clientSecret,
            'nonexistent_scope',
        );

        expect(response.status).toEqual(400);
        expect(response.body.error).toEqual('invalid_scope');
    });

    it('down-scoped token preserves the narrowed scope on subsequent rotation', async () => {
        const {refreshToken, clientId, clientSecret} = await getFreshTokensAndCreds();

        // First refresh: narrow to 'openid'
        const firstRefresh = await refreshGrant(refreshToken, clientId, clientSecret, 'openid');
        expect(firstRefresh.status).toEqual(201);
        expect(firstRefresh.body.scope).toEqual('openid');

        const narrowedToken = firstRefresh.body.refresh_token;

        // Second refresh: omit scope — should use the narrowed scope from the record
        const secondRefresh = await refreshGrant(narrowedToken, clientId, clientSecret);
        expect(secondRefresh.status).toEqual(201);
        expect(secondRefresh.body.scope).toEqual('openid');
    });

    it('cannot re-broaden scope after down-scoping', async () => {
        const {refreshToken, clientId, clientSecret} = await getFreshTokensAndCreds();

        // First refresh: narrow to 'openid'
        const firstRefresh = await refreshGrant(refreshToken, clientId, clientSecret, 'openid');
        expect(firstRefresh.status).toEqual(201);
        const narrowedToken = firstRefresh.body.refresh_token;

        // Second refresh: try to broaden back to 'openid profile'
        const secondRefresh = await refreshGrant(narrowedToken, clientId, clientSecret, 'openid profile');
        expect(secondRefresh.status).toEqual(400);
        expect(secondRefresh.body.error).toEqual('invalid_scope');
    });
});
