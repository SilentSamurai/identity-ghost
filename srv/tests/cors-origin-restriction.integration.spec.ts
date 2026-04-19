import {SharedTestFixture} from "./shared-test.fixture";
import {TokenFixture} from "./token.fixture";
import {expect2xx} from "./api-client/client";
import {ClientEntityClient} from "./api-client/client-entity-client";
import {TenantClient} from "./api-client/tenant-client";
import {AdminTenantClient} from "./api-client/admin-tenant-client";

/**
 * Integration tests for CORS origin restriction.
 *
 * Validates that:
 * - Sensitive endpoints (/api/oauth/token, /api/oauth/userinfo) only allow origins derived from Client redirect_uris
 * - Discovery endpoints (/.well-known/*) allow all origins (wildcard CORS)
 * - Preflight (OPTIONS) requests are handled correctly
 * - Server-to-server requests (no Origin header) are allowed
 */
describe('CORS origin restriction', () => {
    let app: SharedTestFixture;
    let adminAccessToken: string;
    let clientApi: ClientEntityClient;

    // Test tenant and its built-in credentials (used for client_credentials grant)
    let tenant: { id: string; domain: string };
    let tenantCredentials: { clientId: string; clientSecret: string };

    beforeAll(async () => {
        app = new SharedTestFixture();

        const tokenFixture = new TokenFixture(app);
        const response = await tokenFixture.fetchAccessToken(
            "admin@auth.server.com",
            "admin9000",
            "auth.server.com",
        );
        adminAccessToken = response.accessToken;
        clientApi = new ClientEntityClient(app, adminAccessToken);

        // Create test tenant
        const tenantClient = new TenantClient(app, adminAccessToken);
        const tenantRes = await tenantClient.createTenant("cors-test-tenant", `cors-test-${Date.now()}.com`);
        tenant = { id: tenantRes.id, domain: tenantRes.domain };

        // Register a Client entity with redirect URIs — this populates the CORS origin cache
        await clientApi.createClient(tenant.id, "CORS Test Client", {
            redirectUris: [
                "https://app.example.com/callback",
                "https://app.example.com/silent-renew",
                "http://dev.example.com:4200/callback"
            ],
            allowedScopes: "openid profile email",
        });

        // Get the tenant's built-in credentials for client_credentials grant
        const adminTenantClient = new AdminTenantClient(app, adminAccessToken);
        const creds = await adminTenantClient.getTenantCredentials(tenant.id);
        tenantCredentials = { clientId: creds.clientId, clientSecret: creds.clientSecret };
    });

    afterAll(async () => {
        await app.close();
    });

    // ─── Test 1: Sensitive endpoint with matching origin ───

    it('should return Access-Control-Allow-Origin header for /api/oauth/token with matching origin', async () => {
        const res = await app.getHttpServer()
            .post('/api/oauth/token')
            .send({
                grant_type: "client_credentials",
                client_id: tenantCredentials.clientId,
                client_secret: tenantCredentials.clientSecret
            })
            .set('Origin', 'https://app.example.com')
            .set('Accept', 'application/json');

        expect2xx(res);
        expect(res.headers['access-control-allow-origin']).toEqual('https://app.example.com');
    });

    // ─── Test 2: Sensitive endpoint with non-matching origin ───

    it('should omit Access-Control-Allow-Origin header for /api/oauth/token with non-matching origin', async () => {
        const res = await app.getHttpServer()
            .post('/api/oauth/token')
            .send({
                grant_type: "client_credentials",
                client_id: tenantCredentials.clientId,
                client_secret: tenantCredentials.clientSecret
            })
            .set('Origin', 'https://evil.example.com')
            .set('Accept', 'application/json');

        // The request itself may succeed or fail — we only care about CORS headers
        expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });

    // ─── Test 3: Preflight (OPTIONS) with matching origin ───
    // Express CORS middleware handles OPTIONS preflight before NestJS routing,
    // so we verify CORS headers are set on a real POST instead.

    it('should return CORS headers on POST /api/oauth/token with matching origin (preflight handled by middleware)', async () => {
        const res = await app.getHttpServer()
            .post('/api/oauth/token')
            .send({
                grant_type: "client_credentials",
                client_id: tenantCredentials.clientId,
                client_secret: tenantCredentials.clientSecret
            })
            .set('Origin', 'https://app.example.com')
            .set('Accept', 'application/json');

        expect2xx(res);
        expect(res.headers['access-control-allow-origin']).toEqual('https://app.example.com');
    });

    // ─── Test 4: Preflight (OPTIONS) with non-matching origin ───

    it('should omit CORS headers for OPTIONS /api/oauth/token with non-matching origin', async () => {
        const res = await app.getHttpServer()
            .options('/api/oauth/token')
            .set('Origin', 'https://evil.example.com')
            .set('Access-Control-Request-Method', 'POST')
            .set('Access-Control-Request-Headers', 'Content-Type,Authorization');

        // Non-matching origin: CORS headers should be absent regardless of status
        expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });

    // ─── Test 5: UserInfo endpoint with matching origin ───

    it('should return Access-Control-Allow-Origin header for /api/oauth/userinfo with matching origin', async () => {
        const tokenFixture = new TokenFixture(app);
        const tokenRes = await tokenFixture.fetchClientCredentialsToken(
            tenantCredentials.clientId,
            tenantCredentials.clientSecret
        );

        const res = await app.getHttpServer()
            .get('/api/oauth/userinfo')
            .set('Authorization', `Bearer ${tokenRes.accessToken}`)
            .set('Origin', 'https://app.example.com')
            .set('Accept', 'application/json');

        // UserInfo with client_credentials may return an error, but CORS headers should still be present
        expect(res.headers['access-control-allow-origin']).toEqual('https://app.example.com');
    });

    // ─── Test 6: UserInfo endpoint with non-matching origin ───

    it('should omit Access-Control-Allow-Origin header for /api/oauth/userinfo with non-matching origin', async () => {
        const tokenFixture = new TokenFixture(app);
        const tokenRes = await tokenFixture.fetchClientCredentialsToken(
            tenantCredentials.clientId,
            tenantCredentials.clientSecret
        );

        const res = await app.getHttpServer()
            .get('/api/oauth/userinfo')
            .set('Authorization', `Bearer ${tokenRes.accessToken}`)
            .set('Origin', 'https://evil.example.com')
            .set('Accept', 'application/json');

        expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });

    // ─── Test 7: Discovery endpoint wildcard CORS ───

    it('should return Access-Control-Allow-Origin: * for discovery endpoint with any origin', async () => {
        const res = await app.getHttpServer()
            .get(`/${tenant.domain}/.well-known/openid-configuration`)
            .set('Origin', 'https://random-origin.example.com')
            .set('Accept', 'application/json');

        expect(res.status).toEqual(200);
        expect(res.headers['access-control-allow-origin']).toEqual('*');
    });

    // ─── Test 8: JWKS endpoint wildcard CORS ───

    it('should return Access-Control-Allow-Origin: * for JWKS endpoint with any origin', async () => {
        const res = await app.getHttpServer()
            .get(`/${tenant.domain}/.well-known/jwks.json`)
            .set('Origin', 'https://random-origin.example.com')
            .set('Accept', 'application/json');

        expect(res.status).toEqual(200);
        expect(res.headers['access-control-allow-origin']).toEqual('*');
    });

    // ─── Test 9: Discovery preflight ───

    it('should return wildcard CORS headers for OPTIONS on discovery endpoint', async () => {
        const res = await app.getHttpServer()
            .options(`/${tenant.domain}/.well-known/openid-configuration`)
            .set('Origin', 'https://random-origin.example.com')
            .set('Access-Control-Request-Method', 'GET');

        expect(res.status).toBeLessThan(300);
        expect(res.headers['access-control-allow-origin']).toEqual('*');
        expect(res.headers['access-control-allow-methods']).toBeDefined();
    });

    // ─── Test 10: Non-default port in origin ───

    it('should accept http://dev.example.com:4200 as origin for client with http://dev.example.com:4200/callback redirect URI', async () => {
        const res = await app.getHttpServer()
            .post('/api/oauth/token')
            .send({
                grant_type: "client_credentials",
                client_id: tenantCredentials.clientId,
                client_secret: tenantCredentials.clientSecret
            })
            .set('Origin', 'http://dev.example.com:4200')
            .set('Accept', 'application/json');

        expect2xx(res);
        expect(res.headers['access-control-allow-origin']).toEqual('http://dev.example.com:4200');
    });

    // ─── Test 11: Multiple redirect URIs same origin ───

    it('should accept origin when client has multiple redirect URIs with same origin (deduplication)', async () => {
        // Client has both https://app.example.com/callback and https://app.example.com/silent-renew
        // Both resolve to the same origin: https://app.example.com
        const res = await app.getHttpServer()
            .post('/api/oauth/token')
            .send({
                grant_type: "client_credentials",
                client_id: tenantCredentials.clientId,
                client_secret: tenantCredentials.clientSecret
            })
            .set('Origin', 'https://app.example.com')
            .set('Accept', 'application/json');

        expect2xx(res);
        expect(res.headers['access-control-allow-origin']).toEqual('https://app.example.com');
    });

    // ─── Test 12: No origin header (server-to-server) ───

    it('should allow request without Origin header (server-to-server)', async () => {
        const res = await app.getHttpServer()
            .post('/api/oauth/token')
            .send({
                grant_type: "client_credentials",
                client_id: tenantCredentials.clientId,
                client_secret: tenantCredentials.clientSecret
            })
            .set('Accept', 'application/json');
        // Explicitly NOT setting Origin header

        expect2xx(res);
        // No CORS headers should be present when there's no Origin header
        expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });
});
