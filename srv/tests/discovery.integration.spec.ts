import {createHash} from "crypto";
import {SharedTestFixture} from "./shared-test.fixture";
import {TokenFixture} from "./token.fixture";
import {expect2xx} from "./api-client/client";

/**
 * Integration tests for the OIDC Discovery endpoint: GET /:tenantDomain/.well-known/openid-configuration
 *
 * Validates OpenID Connect Discovery 1.0 §4 compliance, metadata completeness,
 * cache headers (RFC 7234), conditional requests (RFC 7232), and tenant isolation.
 */
describe('OIDC Discovery endpoint', () => {
    let app: SharedTestFixture;
    let adminAccessToken: string;

    // Tenant A — primary test tenant
    let tenantA: { id: string; domain: string; clientId: string };
    // Tenant B — used for tenant isolation tests
    let tenantB: { id: string; domain: string; clientId: string };

    beforeAll(async () => {
        app = new SharedTestFixture();

        const tokenFixture = new TokenFixture(app);
        const response = await tokenFixture.fetchAccessToken(
            "admin@auth.server.com",
            "admin9000",
            "auth.server.com",
        );
        adminAccessToken = response.accessToken;

        // Create two tenants with unique domains
        const domainA = `discovery-a-${Date.now()}.com`;
        const domainB = `discovery-b-${Date.now()}.com`;

        const resA = await app.getHttpServer()
            .post('/api/tenant/create')
            .send({name: "discovery-tenant-a", domain: domainA})
            .set('Authorization', `Bearer ${adminAccessToken}`)
            .set('Accept', 'application/json');
        expect2xx(resA);
        tenantA = {id: resA.body.id, domain: domainA, clientId: resA.body.clientId};

        const resB = await app.getHttpServer()
            .post('/api/tenant/create')
            .send({name: "discovery-tenant-b", domain: domainB})
            .set('Authorization', `Bearer ${adminAccessToken}`)
            .set('Accept', 'application/json');
        expect2xx(resB);
        tenantB = {id: resB.body.id, domain: domainB, clientId: resB.body.clientId};
    });

    afterAll(async () => {
        await app.close();
    });

    // ─── Requirement 1.1: 200 with Content-Type application/json ───

    it('should return 200 with Content-Type application/json for valid tenant', async () => {
        const res = await app.getHttpServer()
            .get(`/${tenantA.domain}/.well-known/openid-configuration`)
            .set('Accept', 'application/json');

        expect(res.status).toEqual(200);
        expect(res.headers['content-type']).toMatch(/application\/json/);
    });

    // ─── Requirement 1.2: 404 for unknown tenant domain ───

    it('should return 404 for unknown tenant domain', async () => {
        const res = await app.getHttpServer()
            .get(`/nonexistent-domain-${Date.now()}.com/.well-known/openid-configuration`);

        expect(res.status).toEqual(404);
        expect(res.body).toHaveProperty('error', 'not_found');
        // Must not reveal whether the domain is valid (no message field)
        expect(res.body).not.toHaveProperty('message');
    });

    // ─── Requirement 1.3: GET-only endpoint ───

    it('should reject POST requests (GET-only endpoint)', async () => {
        const res = await app.getHttpServer()
            .post(`/${tenantA.domain}/.well-known/openid-configuration`);

        // POST should not return 200 — NestJS returns 404 for undefined routes
        expect(res.status).not.toEqual(200);
    });

    // ─── Requirement 2.1–2.13: All required metadata fields present ───

    it('should contain all 13 required OIDC metadata fields with correct types', async () => {
        const res = await app.getHttpServer()
            .get(`/${tenantA.domain}/.well-known/openid-configuration`);
        expect(res.status).toEqual(200);

        const doc = res.body;

        // String fields (endpoints and issuer)
        expect(typeof doc.issuer).toBe('string');
        expect(typeof doc.authorization_endpoint).toBe('string');
        expect(typeof doc.token_endpoint).toBe('string');
        expect(typeof doc.userinfo_endpoint).toBe('string');
        expect(typeof doc.jwks_uri).toBe('string');
        expect(typeof doc.introspection_endpoint).toBe('string');
        expect(typeof doc.revocation_endpoint).toBe('string');

        // Array fields (capabilities)
        expect(Array.isArray(doc.scopes_supported)).toBe(true);
        expect(Array.isArray(doc.response_types_supported)).toBe(true);
        expect(Array.isArray(doc.grant_types_supported)).toBe(true);
        expect(Array.isArray(doc.subject_types_supported)).toBe(true);
        expect(Array.isArray(doc.id_token_signing_alg_values_supported)).toBe(true);
        expect(Array.isArray(doc.token_endpoint_auth_methods_supported)).toBe(true);
    });

    // ─── Requirement 2.8–2.13: Static field values match requirements exactly ───

    it('should have correct static field values', async () => {
        const res = await app.getHttpServer()
            .get(`/${tenantA.domain}/.well-known/openid-configuration`);
        expect(res.status).toEqual(200);

        const doc = res.body;

        expect(doc.scopes_supported).toEqual(["openid", "profile", "email"]);
        expect(doc.response_types_supported).toEqual(["code"]);
        expect(doc.grant_types_supported).toEqual(["authorization_code", "client_credentials", "refresh_token"]);
        expect(doc.subject_types_supported).toEqual(["public"]);
        expect(doc.id_token_signing_alg_values_supported).toEqual(["RS256"]);
        expect(doc.token_endpoint_auth_methods_supported).toEqual(["client_secret_basic", "client_secret_post"]);
    });

    // ─── Requirement 2.2–2.7: All endpoint URLs are absolute ───

    it('should have absolute endpoint URLs (start with http:// or https://)', async () => {
        const res = await app.getHttpServer()
            .get(`/${tenantA.domain}/.well-known/openid-configuration`);
        expect(res.status).toEqual(200);

        const doc = res.body;
        const endpointFields = [
            'issuer',
            'authorization_endpoint',
            'token_endpoint',
            'userinfo_endpoint',
            'jwks_uri',
            'introspection_endpoint',
            'revocation_endpoint',
        ];

        for (const field of endpointFields) {
            expect(doc[field]).toMatch(/^https?:\/\//);
        }
    });

    // ─── Requirement 2.5: jwks_uri contains tenant domain ───

    it('should have jwks_uri containing tenant domain and ending with /.well-known/jwks.json', async () => {
        const res = await app.getHttpServer()
            .get(`/${tenantA.domain}/.well-known/openid-configuration`);
        expect(res.status).toEqual(200);

        const doc = res.body;

        expect(doc.jwks_uri).toContain(tenantA.domain);
        expect(doc.jwks_uri).toMatch(/\/\.well-known\/jwks\.json$/);
    });

    // ─── Requirement 2: Tenant isolation — different jwks_uri, same other fields ───

    it('should produce different jwks_uri but identical other fields for different tenants', async () => {
        const resA = await app.getHttpServer()
            .get(`/${tenantA.domain}/.well-known/openid-configuration`);
        expect(resA.status).toEqual(200);
        const docA = resA.body;

        const resB = await app.getHttpServer()
            .get(`/${tenantB.domain}/.well-known/openid-configuration`);
        expect(resB.status).toEqual(200);
        const docB = resB.body;

        // jwks_uri must be different (tenant-scoped)
        expect(docA.jwks_uri).not.toEqual(docB.jwks_uri);
        expect(docA.jwks_uri).toContain(tenantA.domain);
        expect(docB.jwks_uri).toContain(tenantB.domain);

        // All other fields must be identical
        expect(docA.issuer).toEqual(docB.issuer);
        expect(docA.authorization_endpoint).toEqual(docB.authorization_endpoint);
        expect(docA.token_endpoint).toEqual(docB.token_endpoint);
        expect(docA.userinfo_endpoint).toEqual(docB.userinfo_endpoint);
        expect(docA.introspection_endpoint).toEqual(docB.introspection_endpoint);
        expect(docA.revocation_endpoint).toEqual(docB.revocation_endpoint);
        expect(docA.scopes_supported).toEqual(docB.scopes_supported);
        expect(docA.response_types_supported).toEqual(docB.response_types_supported);
        expect(docA.grant_types_supported).toEqual(docB.grant_types_supported);
        expect(docA.subject_types_supported).toEqual(docB.subject_types_supported);
        expect(docA.id_token_signing_alg_values_supported).toEqual(docB.id_token_signing_alg_values_supported);
        expect(docA.token_endpoint_auth_methods_supported).toEqual(docB.token_endpoint_auth_methods_supported);
    });

    // ─── Requirement 3.1, 3.2: Public access without authentication ───

    it('should return 200 without Authorization header (public endpoint)', async () => {
        const res = await app.getHttpServer()
            .get(`/${tenantA.domain}/.well-known/openid-configuration`)
            // Explicitly do NOT set Authorization header
            .set('Accept', 'application/json');

        expect(res.status).toEqual(200);
        expect(res.body).toBeDefined();
    });

    // ─── Requirement 4.1: Cache-Control header ───

    it('should return Cache-Control containing max-age=3600', async () => {
        const res = await app.getHttpServer()
            .get(`/${tenantA.domain}/.well-known/openid-configuration`);
        expect(res.status).toEqual(200);

        const cacheControl = res.headers['cache-control'];
        expect(cacheControl).toBeDefined();
        expect(cacheControl).toContain('max-age=3600');
    });

    // ─── Requirement 4.2: ETag is SHA-256 hex digest of body in double quotes ───

    it('should return ETag as SHA-256 hex digest of body in double quotes', async () => {
        const res = await app.getHttpServer()
            .get(`/${tenantA.domain}/.well-known/openid-configuration`);
        expect(res.status).toEqual(200);

        const etag = res.headers['etag'];
        expect(etag).toBeDefined();

        // ETag must be in double quotes
        expect(etag).toMatch(/^"[a-f0-9]{64}"$/);

        // Verify it matches SHA-256 of the response body
        const bodyText = JSON.stringify(res.body);
        const expectedHash = createHash('sha256').update(bodyText).digest('hex');
        expect(etag).toEqual(`"${expectedHash}"`);
    });

    // ─── Requirement 4.3: 304 on matching If-None-Match ───

    it('should return 304 with no body when If-None-Match matches ETag', async () => {
        // First request to get the ETag
        const res1 = await app.getHttpServer()
            .get(`/${tenantA.domain}/.well-known/openid-configuration`);
        expect(res1.status).toEqual(200);
        const etag = res1.headers['etag'];
        expect(etag).toBeDefined();

        // Second request with If-None-Match
        const res2 = await app.getHttpServer()
            .get(`/${tenantA.domain}/.well-known/openid-configuration`)
            .set('If-None-Match', etag);

        expect(res2.status).toEqual(304);
        // 304 should have no body
        expect(res2.text).toBeFalsy();
    });

    // ─── Requirement 4.3: 200 on non-matching If-None-Match ───

    it('should return 200 with full body when If-None-Match does not match', async () => {
        const res = await app.getHttpServer()
            .get(`/${tenantA.domain}/.well-known/openid-configuration`)
            .set('If-None-Match', '"non-matching-etag-value"');

        expect(res.status).toEqual(200);
        expect(res.body).toBeDefined();
        expect(res.body.issuer).toBeDefined();
    });

    // ─── Requirement 6.1: Issuer is prefix of all endpoint URLs ───

    it('should have issuer as prefix of every endpoint URL', async () => {
        const res = await app.getHttpServer()
            .get(`/${tenantA.domain}/.well-known/openid-configuration`);
        expect(res.status).toEqual(200);

        const doc = res.body;
        const issuer = doc.issuer;

        const endpointFields = [
            'authorization_endpoint',
            'token_endpoint',
            'userinfo_endpoint',
            'jwks_uri',
            'introspection_endpoint',
            'revocation_endpoint',
        ];

        for (const field of endpointFields) {
            expect(doc[field]).toMatch(new RegExp(`^${issuer.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
        }
    });

    // ─── Requirement 6.2: Super tenant returns valid metadata ───

    it('should serve discovery document for the super tenant (auth.server.com)', async () => {
        const res = await app.getHttpServer()
            .get('/auth.server.com/.well-known/openid-configuration');
        expect(res.status).toEqual(200);

        const doc = res.body;
        expect(doc.issuer).toBeDefined();
        expect(doc.jwks_uri).toContain('auth.server.com');
        expect(doc.scopes_supported).toEqual(["openid", "profile", "email"]);
    });
});
