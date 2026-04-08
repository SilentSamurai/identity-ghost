import {createPublicKey} from "crypto";
import * as jwt from "jsonwebtoken";
import {SharedTestFixture} from "./shared-test.fixture";
import {TokenFixture} from "./token.fixture";
import {AdminTenantClient} from "./api-client/admin-tenant-client";
import {expect2xx} from "./api-client/client";

/**
 * Integration tests for token kid (Key ID) in JWT headers.
 *
 * Validates:
 * - Property 4: All signed JWTs include kid (non-empty string) and alg: RS256 in JOSE header
 * - Property 5: JWT kid matches exactly one kid in the JWKS keys array; JWT verifiable with matching JWK
 * - Property 10: Token signed with previous key still verifiable; deactivated key causes verification failure
 */
describe('Token kid integration', () => {
    let app: SharedTestFixture;
    let adminAccessToken: string;
    let tokenFixture: TokenFixture;
    let adminTenantClient: AdminTenantClient;

    beforeAll(async () => {
        app = new SharedTestFixture();
        tokenFixture = new TokenFixture(app);

        const response = await tokenFixture.fetchAccessToken(
            "admin@auth.server.com",
            "admin9000",
            "auth.server.com",
        );
        adminAccessToken = response.accessToken;
        adminTenantClient = new AdminTenantClient(app, adminAccessToken);
    });

    afterAll(async () => {
        await app.close();
    });

    /** Helper: create a tenant with a unique domain */
    async function createTenant(suffix: string): Promise<{ id: string; domain: string; clientId: string }> {
        const ts = Date.now().toString(36);
        const domain = `tkid-${suffix}-${ts}.com`;
        const name = `tkid-${suffix}`.substring(0, 20);

        // Retry on SQLite transient errors (concurrent writes)
        for (let attempt = 0; attempt < 3; attempt++) {
            const res = await app.getHttpServer()
                .post('/api/tenant/create')
                .send({name, domain})
                .set('Authorization', `Bearer ${adminAccessToken}`)
                .set('Accept', 'application/json');
            if (res.status >= 200 && res.status < 300) {
                return {id: res.body.id, domain, clientId: res.body.clientId};
            }
            if (attempt < 2) {
                await new Promise(r => setTimeout(r, 500));
            } else {
                expect2xx(res);
            }
        }
        throw new Error('unreachable');
    }

    /** Helper: fetch JWKS for a tenant domain */
    async function fetchJwks(domain: string): Promise<{ keys: any[] }> {
        const res = await app.getHttpServer()
            .get(`/${domain}/.well-known/jwks.json`);
        expect(res.status).toEqual(200);
        return res.body;
    }

    /** Helper: rotate keys for a tenant via admin API */
    async function rotateKeys(tenantId: string): Promise<void> {
        const res = await app.getHttpServer()
            .put(`/api/admin/tenant/${tenantId}/keys`)
            .set('Authorization', `Bearer ${adminAccessToken}`)
            .set('Accept', 'application/json');
        expect2xx(res);
    }

    /** Helper: decode a JWT header (base64url decode the first segment) */
    function decodeJwtHeader(token: string): { kid?: string; alg?: string; [key: string]: any } {
        const headerSegment = token.split('.')[0];
        const decoded = Buffer.from(headerSegment, 'base64url').toString('utf-8');
        return JSON.parse(decoded);
    }

    /** Helper: verify a JWT using a JWK from the JWKS response */
    function verifyWithJwk(token: string, jwk: any): any {
        const keyObject = createPublicKey({
            key: {kty: 'RSA', n: jwk.n, e: jwk.e},
            format: 'jwk',
        });
        const pem = keyObject.export({type: 'spki', format: 'pem'}) as string;
        return jwt.verify(token, pem, {algorithms: ['RS256']});
    }

    // ─── Property 4: All signed JWTs include kid and alg: RS256 in JOSE header ───

    it('should include kid (non-empty string) and alg RS256 in access token header', async () => {
        const tenant = await createTenant('p4');
        const creds = await adminTenantClient.getTenantCredentials(tenant.id);

        // Client credentials token (technical token) — simplest way to get a signed JWT
        const ccRes = await app.getHttpServer()
            .post('/api/oauth/token')
            .send({
                grant_type: 'client_credentials',
                client_id: creds.clientId,
                client_secret: creds.clientSecret,
            })
            .set('Accept', 'application/json');
        expect2xx(ccRes);

        const ccTokenHeader = decodeJwtHeader(ccRes.body.access_token);
        expect(ccTokenHeader.kid).toBeDefined();
        expect(typeof ccTokenHeader.kid).toBe('string');
        expect(ccTokenHeader.kid.length).toBeGreaterThan(0);
        expect(ccTokenHeader.alg).toEqual('RS256');
    });

    it('should include kid and alg RS256 in password-grant access token and ID token headers', async () => {
        // Use the super tenant which already has a user (admin)
        const passwordRes = await app.getHttpServer()
            .post('/api/oauth/token')
            .send({
                grant_type: 'password',
                username: 'admin@auth.server.com',
                password: 'admin9000',
                client_id: 'auth.server.com',
            })
            .set('Accept', 'application/json');
        expect2xx(passwordRes);

        const accessTokenHeader = decodeJwtHeader(passwordRes.body.access_token);
        expect(accessTokenHeader.kid).toBeDefined();
        expect(typeof accessTokenHeader.kid).toBe('string');
        expect(accessTokenHeader.kid.length).toBeGreaterThan(0);
        expect(accessTokenHeader.alg).toEqual('RS256');

        // ID token (present when openid scope is granted — default scopes include openid)
        if (passwordRes.body.id_token) {
            const idTokenHeader = decodeJwtHeader(passwordRes.body.id_token);
            expect(idTokenHeader.kid).toBeDefined();
            expect(typeof idTokenHeader.kid).toBe('string');
            expect(idTokenHeader.kid.length).toBeGreaterThan(0);
            expect(idTokenHeader.alg).toEqual('RS256');
        }
    });

    // ─── Property 5: JWT kid matches exactly one kid in JWKS keys array ───

    it('should have JWT kid matching exactly one kid in the JWKS keys array', async () => {
        const tenant = await createTenant('p5-match');
        const creds = await adminTenantClient.getTenantCredentials(tenant.id);

        // Get a client_credentials token
        const ccRes = await app.getHttpServer()
            .post('/api/oauth/token')
            .send({
                grant_type: 'client_credentials',
                client_id: creds.clientId,
                client_secret: creds.clientSecret,
            })
            .set('Accept', 'application/json');
        expect2xx(ccRes);

        const tokenHeader = decodeJwtHeader(ccRes.body.access_token);
        const jwks = await fetchJwks(tenant.domain);

        // kid should match exactly one key in JWKS
        const matchingKeys = jwks.keys.filter((k: any) => k.kid === tokenHeader.kid);
        expect(matchingKeys.length).toEqual(1);
    });

    // ─── Property 5: JWT can be verified using the matching JWK public key from JWKS ───

    it('should verify JWT using the matching JWK public key from JWKS', async () => {
        const tenant = await createTenant('p5-verify');
        const creds = await adminTenantClient.getTenantCredentials(tenant.id);

        // Get a client_credentials token
        const ccRes = await app.getHttpServer()
            .post('/api/oauth/token')
            .send({
                grant_type: 'client_credentials',
                client_id: creds.clientId,
                client_secret: creds.clientSecret,
            })
            .set('Accept', 'application/json');
        expect2xx(ccRes);

        const token = ccRes.body.access_token;
        const tokenHeader = decodeJwtHeader(token);
        const jwks = await fetchJwks(tenant.domain);

        // Find the matching JWK
        const matchingJwk = jwks.keys.find((k: any) => k.kid === tokenHeader.kid);
        expect(matchingJwk).toBeDefined();

        // Verify the token using the JWK public key
        const verified = verifyWithJwk(token, matchingJwk);
        expect(verified).toBeDefined();
        expect(verified.grant_type).toEqual('client_credentials');
    });

    // ─── Property 10: Token signed with previous (non-current but active) key can still be verified ───

    it('should still verify a token signed with a previous key after rotation', async () => {
        const tenant = await createTenant('p10-prev');
        const creds = await adminTenantClient.getTenantCredentials(tenant.id);

        // Get a token signed with key v1
        const ccRes = await app.getHttpServer()
            .post('/api/oauth/token')
            .send({
                grant_type: 'client_credentials',
                client_id: creds.clientId,
                client_secret: creds.clientSecret,
            })
            .set('Accept', 'application/json');
        expect2xx(ccRes);

        const oldToken = ccRes.body.access_token;
        const oldTokenHeader = decodeJwtHeader(oldToken);

        // Rotate keys — key v1 is now superseded but still active
        await rotateKeys(tenant.id);

        // The old token's kid should still appear in JWKS
        const jwks = await fetchJwks(tenant.domain);
        const matchingJwk = jwks.keys.find((k: any) => k.kid === oldTokenHeader.kid);
        expect(matchingJwk).toBeDefined();

        // The old token should still be verifiable using the JWK
        const verified = verifyWithJwk(oldToken, matchingJwk);
        expect(verified).toBeDefined();
    });

    // ─── Property 10: Token verification fails when kid points to a deactivated key ───

    it('should fail verification when kid points to a deactivated key', async () => {
        const tenant = await createTenant('p10-deact');
        const creds = await adminTenantClient.getTenantCredentials(tenant.id);

        // Get a token signed with key v1
        const ccRes = await app.getHttpServer()
            .post('/api/oauth/token')
            .send({
                grant_type: 'client_credentials',
                client_id: creds.clientId,
                client_secret: creds.clientSecret,
            })
            .set('Accept', 'application/json');
        expect2xx(ccRes);

        const oldToken = ccRes.body.access_token;
        const oldTokenHeader = decodeJwtHeader(oldToken);

        // Rotate keys 3 times to exceed max=3, which deactivates key v1
        await rotateKeys(tenant.id);
        await rotateKeys(tenant.id);
        await rotateKeys(tenant.id);

        // The old token's kid should no longer appear in JWKS
        const jwks = await fetchJwks(tenant.domain);
        const kidsInJwks = jwks.keys.map((k: any) => k.kid);
        expect(kidsInJwks).not.toContain(oldTokenHeader.kid);

        // Attempting to validate the old token via the API should fail
        // We need the tenant's client credentials to call verify
        const updatedCreds = await adminTenantClient.getTenantCredentials(tenant.id);
        const verifyRes = await app.getHttpServer()
            .post('/api/oauth/verify')
            .send({
                access_token: oldToken,
                client_id: updatedCreds.clientId,
                client_secret: updatedCreds.clientSecret,
            })
            .set('Accept', 'application/json');

        // Should fail — the key is deactivated
        expect(verifyRes.status).toBeGreaterThanOrEqual(400);
    });
});
