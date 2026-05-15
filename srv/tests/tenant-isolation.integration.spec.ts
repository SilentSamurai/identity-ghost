import {createPublicKey} from "crypto";
import * as jwt from "jsonwebtoken";
import {SharedTestFixture} from "./shared-test.fixture";
import {TokenFixture} from "./token.fixture";
import {expect2xx} from "./api-client/client";
import {ClientEntityClient} from "./api-client/client-entity-client";

/**
 * Integration tests for multi-tenant token isolation.
 *
 * Validates that tokens issued for one tenant cannot be used to access
 * another tenant's resources. Tests cover:
 * - Token acceptance within issuing tenant context
 * - Cross-tenant token rejection
 * - kid-to-JWKS mapping per tenant
 * - kid disjointness across tenants
 * - Cryptographic isolation (wrong tenant's key fails verification)
 * - tenant_id claim presence and correctness
 * - JWKS tenant scoping
 * - Tampered token rejection
 *
 * Requirements: 1.1, 1.2, 1.3, 2.1, 2.2, 2.4, 3.1, 3.2, 4.1, 4.2, 4.3, 4.4,
 *               5.1, 5.2, 5.3, 7.1, 7.2, 7.3, 7.4
 */
describe('Tenant isolation', () => {
    let app: SharedTestFixture;
    let adminAccessToken: string;
    let tokenFixture: TokenFixture;

    // Tenant A
    let tenantA: { id: string; domain: string; clientId: string; clientSecret: string };
    // Tenant B
    let tenantB: { id: string; domain: string; clientId: string; clientSecret: string };

    beforeAll(async () => {
        app = new SharedTestFixture();
        tokenFixture = new TokenFixture(app);

        // Obtain super-admin access token
        const response = await tokenFixture.fetchAccessTokenFlow(
            "admin@auth.server.com",
            "admin9000",
            "auth.server.com",
        );
        adminAccessToken = response.accessToken;

        // Create two isolated test tenants with unique timestamped domains
        const ts = Date.now().toString(36);
        const domainA = `isolation-a-${ts}.com`;
        const domainB = `isolation-b-${ts}.com`;

        const resA = await app.getHttpServer()
            .post('/api/tenant/create')
            .send({name: "isolation-tenant-a", domain: domainA})
            .set('Authorization', `Bearer ${adminAccessToken}`)
            .set('Accept', 'application/json');
        expect2xx(resA);

        const resB = await app.getHttpServer()
            .post('/api/tenant/create')
            .send({name: "isolation-tenant-b", domain: domainB})
            .set('Authorization', `Bearer ${adminAccessToken}`)
            .set('Accept', 'application/json');
        expect2xx(resB);

        // Create confidential clients with client_credentials grant for both tenants
        const clientEntityClient = new ClientEntityClient(app, adminAccessToken);

        const clientA = await clientEntityClient.createClient(resA.body.id, 'isolation-client-a', {
            grantTypes: 'client_credentials',
            allowedScopes: 'openid profile email',
            isPublic: false,
        });
        const clientB = await clientEntityClient.createClient(resB.body.id, 'isolation-client-b', {
            grantTypes: 'client_credentials',
            allowedScopes: 'openid profile email',
            isPublic: false,
        });

        tenantA = {
            id: resA.body.id,
            domain: domainA,
            clientId: clientA.client.clientId,
            clientSecret: clientA.clientSecret,
        };
        tenantB = {
            id: resB.body.id,
            domain: domainB,
            clientId: clientB.client.clientId,
            clientSecret: clientB.clientSecret,
        };
    });

    afterAll(async () => {
        await app.close();
    });

    // ─── Helper functions ───

    /** Decode a JWT header (base64url decode the first segment) */
    function decodeJwtHeader(token: string): { kid?: string; alg?: string; [key: string]: any } {
        const headerSegment = token.split('.')[0];
        const decoded = Buffer.from(headerSegment, 'base64url').toString('utf-8');
        return JSON.parse(decoded);
    }

    /** Fetch JWKS for a tenant domain */
    async function fetchJwks(domain: string): Promise<{ keys: any[] }> {
        const res = await app.getHttpServer()
            .get(`/${domain}/.well-known/jwks.json`);
        expect(res.status).toEqual(200);
        return res.body;
    }

    /** Verify a JWT using a JWK from the JWKS response */
    function verifyWithJwk(token: string, jwk: any): any {
        const keyObject = createPublicKey({
            key: {kty: 'RSA', n: jwk.n, e: jwk.e},
            format: 'jwk',
        });
        const pem = keyObject.export({type: 'spki', format: 'pem'}) as string;
        return jwt.verify(token, pem, {algorithms: ['RS256']});
    }

    /** Obtain a client_credentials token for a tenant */
    async function getClientCredentialsToken(clientId: string, clientSecret: string): Promise<string> {
        const res = await app.getHttpServer()
            .post('/api/oauth/token')
            .send({
                grant_type: 'client_credentials',
                client_id: clientId,
                client_secret: clientSecret,
            })
            .set('Accept', 'application/json');
        expect2xx(res);
        return res.body.access_token;
    }

    // ─── 4.2: Token accepted for issuing tenant ───

    it('should accept a token when used within its issuing tenant context', async () => {
        const tokenA = await getClientCredentialsToken(tenantA.clientId, tenantA.clientSecret);

        // Use the token as a Bearer on a protected endpoint scoped to Tenant A
        const res = await app.getHttpServer()
            .get('/api/tenant/my/info')
            .set('Authorization', `Bearer ${tokenA}`)
            .set('Accept', 'application/json');

        expect(res.status).toEqual(200);
        expect(res.body.id).toEqual(tenantA.id);
        expect(res.body.domain).toEqual(tenantA.domain);
    });

    // ─── 4.3: Token rejected for different tenant ───

    it('should reject a token when verified with a different tenant\'s credentials', async () => {
        const tokenA = await getClientCredentialsToken(tenantA.clientId, tenantA.clientSecret);

        // Attempt to verify Tenant A's token using Tenant B's client credentials
        // via the verify endpoint. The token's tenant context does not match
        // the client's tenant, so the request is rejected.
        const res = await app.getHttpServer()
            .post('/api/oauth/verify')
            .send({
                access_token: tokenA,
                client_id: tenantB.clientId,
                client_secret: tenantB.clientSecret,
            })
            .set('Accept', 'application/json');

        // The verify endpoint rejects cross-tenant token verification
        expect(res.status).toBeGreaterThanOrEqual(400);
    });

    // ─── 4.4: kid in JWT header matches tenant's current key from JWKS ───

    it('should have JWT kid matching the tenant\'s current key in JWKS for both tenants', async () => {
        const tokenA = await getClientCredentialsToken(tenantA.clientId, tenantA.clientSecret);
        const tokenB = await getClientCredentialsToken(tenantB.clientId, tenantB.clientSecret);

        const headerA = decodeJwtHeader(tokenA);
        const headerB = decodeJwtHeader(tokenB);

        const jwksA = await fetchJwks(tenantA.domain);
        const jwksB = await fetchJwks(tenantB.domain);

        // Each token's kid should match exactly one kid in the corresponding tenant's JWKS
        const matchingKeysA = jwksA.keys.filter((k: any) => k.kid === headerA.kid);
        expect(matchingKeysA.length).toEqual(1);

        const matchingKeysB = jwksB.keys.filter((k: any) => k.kid === headerB.kid);
        expect(matchingKeysB.length).toEqual(1);
    });

    // ─── 4.5: kid values are disjoint across tenants ───

    it('should have completely disjoint kid values across tenants', async () => {
        const jwksA = await fetchJwks(tenantA.domain);
        const jwksB = await fetchJwks(tenantB.domain);

        const kidsA = new Set(jwksA.keys.map((k: any) => k.kid));
        const kidsB = new Set(jwksB.keys.map((k: any) => k.kid));

        // No kid should appear in both sets
        for (const kid of kidsA) {
            expect(kidsB.has(kid)).toBe(false);
        }
        for (const kid of kidsB) {
            expect(kidsA.has(kid)).toBe(false);
        }
    });

    // ─── 4.6: JWT kid appears in issuing tenant's JWKS but NOT in other tenant's JWKS ───

    it('should have JWT kid present in issuing tenant\'s JWKS and absent from other tenant\'s JWKS', async () => {
        const tokenA = await getClientCredentialsToken(tenantA.clientId, tenantA.clientSecret);
        const headerA = decodeJwtHeader(tokenA);

        const jwksA = await fetchJwks(tenantA.domain);
        const jwksB = await fetchJwks(tenantB.domain);

        // kid should be present in Tenant A's JWKS
        const kidsA = jwksA.keys.map((k: any) => k.kid);
        expect(kidsA).toContain(headerA.kid);

        // kid should be absent from Tenant B's JWKS
        const kidsB = jwksB.keys.map((k: any) => k.kid);
        expect(kidsB).not.toContain(headerA.kid);
    });

    // ─── 4.7: Token signature fails with wrong tenant's public key ───

    it('should fail signature verification when using wrong tenant\'s public key', async () => {
        const tokenA = await getClientCredentialsToken(tenantA.clientId, tenantA.clientSecret);

        // Fetch Tenant B's public key from JWKS
        const jwksB = await fetchJwks(tenantB.domain);
        expect(jwksB.keys.length).toBeGreaterThanOrEqual(1);
        const jwkB = jwksB.keys[0];

        // Attempt to verify Tenant A's token with Tenant B's public key
        expect(() => verifyWithJwk(tokenA, jwkB)).toThrow();
    });

    // ─── 4.8: Technical token (client_credentials) has correct kid and tenant_id ───

    it('should have correct kid and tenant_id in a client_credentials token', async () => {
        const tokenA = await getClientCredentialsToken(tenantA.clientId, tenantA.clientSecret);

        // Decode JWT header — verify kid matches Tenant A's current key from JWKS
        const header = decodeJwtHeader(tokenA);
        const jwksA = await fetchJwks(tenantA.domain);
        const matchingKeys = jwksA.keys.filter((k: any) => k.kid === header.kid);
        expect(matchingKeys.length).toEqual(1);

        // Decode JWT payload — verify tenant_id matches Tenant A's UUID
        const payload = app.jwtService().decode(tokenA) as any;
        expect(payload.tenant_id).toEqual(tenantA.id);
    });

    // ─── 4.9: tenant_id claim present in access token ───

    it('should include tenant_id claim matching the issuing tenant UUID', async () => {
        const tokenA = await getClientCredentialsToken(tenantA.clientId, tenantA.clientSecret);

        const payload = app.jwtService().decode(tokenA) as any;
        expect(payload.tenant_id).toBeDefined();
        expect(payload.tenant_id).toEqual(tenantA.id);
    });

    // ─── 4.10: JWKS returns only requested tenant's keys ───

    it('should return only the requested tenant\'s keys in JWKS', async () => {
        const jwksA = await fetchJwks(tenantA.domain);
        const jwksB = await fetchJwks(tenantB.domain);

        // Collect all kid values from both tenants
        const kidsA = new Set(jwksA.keys.map((k: any) => k.kid));
        const kidsB = new Set(jwksB.keys.map((k: any) => k.kid));

        // Verify Tenant A's JWKS contains at least one key
        expect(kidsA.size).toBeGreaterThanOrEqual(1);

        // Verify no kid from Tenant B appears in Tenant A's JWKS
        for (const kid of kidsB) {
            expect(kidsA.has(kid)).toBe(false);
        }

        // Verify no kid from Tenant A appears in Tenant B's JWKS
        for (const kid of kidsA) {
            expect(kidsB.has(kid)).toBe(false);
        }
    });

    // ─── 4.11: JWKS returns 404 for unknown domain ───

    it('should return 404 for JWKS request with unknown domain', async () => {
        const res = await app.getHttpServer()
            .get(`/nonexistent-${Date.now()}.com/.well-known/jwks.json`);

        expect(res.status).toEqual(404);
        // No message field — prevents information leakage
        expect(res.body).not.toHaveProperty('message');
    });

    // ─── 4.12: kid-to-tenant validation rejects tampered tokens ───

    it('should reject a tampered token with mismatched kid and tenant_id', async () => {
        // Issue a token for Tenant B
        const tokenB = await getClientCredentialsToken(tenantB.clientId, tenantB.clientSecret);
        const headerB = decodeJwtHeader(tokenB);
        const payloadB = app.jwtService().decode(tokenB) as any;

        // Tamper with the token: change tenant_id to Tenant A's ID
        // while keeping Tenant B's kid in the header.
        // We do this by modifying the payload and re-encoding (unsigned).
        const tamperedPayload = {...payloadB, tenant_id: tenantA.id};
        const tamperedPayloadB64 = Buffer.from(JSON.stringify(tamperedPayload))
            .toString('base64url');

        // Reconstruct the token with original header, tampered payload, original signature
        const parts = tokenB.split('.');
        const tamperedToken = `${parts[0]}.${tamperedPayloadB64}.${parts[2]}`;

        // Attempt to validate the tampered token via the verify endpoint
        // The hardened getPublicKeyByKid(kid, tenant_id) will look for
        // Tenant B's kid with Tenant A's tenant_id — no match → rejection
        const res = await app.getHttpServer()
            .post('/api/oauth/verify')
            .send({
                access_token: tamperedToken,
                client_id: tenantA.clientId,
                client_secret: tenantA.clientSecret,
            })
            .set('Accept', 'application/json');

        expect(res.status).toEqual(401);
    });
});
