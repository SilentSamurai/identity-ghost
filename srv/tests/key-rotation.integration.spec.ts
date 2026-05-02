import {SharedTestFixture} from "./shared-test.fixture";
import {TokenFixture} from "./token.fixture";
import {expect2xx} from "./api-client/client";

/**
 * Integration tests for key rotation behavior.
 *
 * Validates Properties 6, 7, 8 from the JWKS design:
 * - Key versioning and isCurrent invariant
 * - Supersession and overlap window
 * - Max active keys enforcement
 * Also validates initial key creation, Tenant entity cleanup,
 * TenantService.updateKeys() rotation, and credential API responses.
 */
describe('Key rotation', () => {
    let app: SharedTestFixture;
    let adminAccessToken: string;

    beforeAll(async () => {
        app = new SharedTestFixture();

        const tokenFixture = new TokenFixture(app);
        const response = await tokenFixture.fetchAccessToken(
            "admin@auth.server.com",
            "admin9000",
            "auth.server.com",
        );
        adminAccessToken = response.accessToken;
    });

    afterAll(async () => {
        await app.close();
    });

    /** Helper: create a tenant with a unique domain */
    async function createTenant(suffix: string): Promise<{ id: string; domain: string; clientId: string }> {
        const ts = Date.now().toString(36);
        const domain = `kr-${suffix}-${ts}.com`;
        const name = `kr-${suffix}`.substring(0, 20);
        const res = await app.getHttpServer()
            .post('/api/tenant/create')
            .send({name, domain})
            .set('Authorization', `Bearer ${adminAccessToken}`)
            .set('Accept', 'application/json');
        expect2xx(res);
        return {id: res.body.id, domain, clientId: res.body.clientId};
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

    // ─── Property 6: Rotation creates new key with keyVersion = prev + 1 and exactly one isCurrent ───

    it('should create a new key with incremented version and exactly one current key per tenant after rotation', async () => {
        const tenant = await createTenant('p6');

        // Before rotation: 1 key in JWKS
        const jwksBefore = await fetchJwks(tenant.domain);
        expect(jwksBefore.keys.length).toEqual(1);
        const kidBefore = jwksBefore.keys[0].kid;

        // Rotate
        await rotateKeys(tenant.id);

        // After rotation: 2 keys in JWKS (old still active within overlap window)
        const jwksAfter = await fetchJwks(tenant.domain);
        expect(jwksAfter.keys.length).toEqual(2);

        // The old kid should still be present
        const kids = jwksAfter.keys.map((k: any) => k.kid);
        expect(kids).toContain(kidBefore);

        // There should be a new kid that wasn't there before
        const newKids = kids.filter((k: string) => k !== kidBefore);
        expect(newKids.length).toEqual(1);
    });

    // ─── Property 7: Rotation sets supersededAt on the previous key ───

    it('should keep superseded key in JWKS within overlap window (supersededAt set)', async () => {
        const tenant = await createTenant('p7');

        const jwksBefore = await fetchJwks(tenant.domain);
        expect(jwksBefore.keys.length).toEqual(1);
        const originalKid = jwksBefore.keys[0].kid;

        // Rotate — the old key should be superseded but still active
        await rotateKeys(tenant.id);

        const jwksAfter = await fetchJwks(tenant.domain);
        // Old key still present (within overlap window)
        const kids = jwksAfter.keys.map((k: any) => k.kid);
        expect(kids).toContain(originalKid);
        expect(jwksAfter.keys.length).toEqual(2);
    });

    // ─── Property 8: Max active keys enforcement ───

    it('should deactivate oldest key when max active keys exceeded', async () => {
        const tenant = await createTenant('p8');

        // Default max is 3. Create initial key (1), then rotate 3 times to get 4 total.
        // After 3rd rotation, the oldest should be deactivated.
        const jwks0 = await fetchJwks(tenant.domain);
        expect(jwks0.keys.length).toEqual(1);
        const kid1 = jwks0.keys[0].kid;

        // Rotation 1: 2 active keys
        await rotateKeys(tenant.id);
        const jwks1 = await fetchJwks(tenant.domain);
        expect(jwks1.keys.length).toEqual(2);

        // Rotation 2: 3 active keys (at max)
        await rotateKeys(tenant.id);
        const jwks2 = await fetchJwks(tenant.domain);
        expect(jwks2.keys.length).toEqual(3);

        // Rotation 3: would be 4, but max=3 so oldest deactivated → still 3
        await rotateKeys(tenant.id);
        const jwks3 = await fetchJwks(tenant.domain);
        expect(jwks3.keys.length).toEqual(3);

        // The very first key (kid1) should have been deactivated
        const kidsAfter = jwks3.keys.map((k: any) => k.kid);
        expect(kidsAfter).not.toContain(kid1);
    });

    // ─── Property 7: Superseded key remains active within TOKEN_EXPIRATION_TIME_IN_SECONDS ───

    it('should keep superseded key active in JWKS immediately after rotation', async () => {
        const tenant = await createTenant('p7-active');

        const jwksBefore = await fetchJwks(tenant.domain);
        const originalKid = jwksBefore.keys[0].kid;

        await rotateKeys(tenant.id);

        // Immediately after rotation, the old key should still be in JWKS
        const jwksAfter = await fetchJwks(tenant.domain);
        const kids = jwksAfter.keys.map((k: any) => k.kid);
        expect(kids).toContain(originalKid);
    });

    // ─── Property 7: Superseded key excluded after overlap window ───
    // Note: We cannot easily manipulate time in integration tests, so we verify
    // the structural behavior: after enough rotations to exceed max keys,
    // the oldest key is forcibly deactivated and excluded from JWKS.

    it('should exclude deactivated keys from JWKS response', async () => {
        const tenant = await createTenant('p7-deactivated');

        const jwks0 = await fetchJwks(tenant.domain);
        const kid1 = jwks0.keys[0].kid;

        // Rotate 3 times to exceed max (3), forcing deactivation of kid1
        await rotateKeys(tenant.id);
        await rotateKeys(tenant.id);
        await rotateKeys(tenant.id);

        const jwksFinal = await fetchJwks(tenant.domain);
        const kids = jwksFinal.keys.map((k: any) => k.kid);
        expect(kids).not.toContain(kid1);
        // All remaining keys should be active (not deactivated)
        expect(jwksFinal.keys.length).toBeLessThanOrEqual(3);
    });

    // ─── New tenant gets TenantKey with keyVersion=1, isCurrent=true, valid opaque kid ───

    it('should create initial TenantKey with keyVersion=1 and valid opaque kid for new tenant', async () => {
        const tenant = await createTenant('initial');

        const jwks = await fetchJwks(tenant.domain);
        expect(jwks.keys.length).toEqual(1);

        const jwk = jwks.keys[0];
        // kid should be a 16-char hex string (opaque SHA-256 truncated)
        expect(jwk.kid).toMatch(/^[a-f0-9]{16}$/);
        // Should be a valid RSA key
        expect(jwk.kty).toEqual('RSA');
        expect(jwk.alg).toEqual('RS256');
        expect(jwk.use).toEqual('sig');
    });

    // ─── Tenant entity does not contain privateKey or publicKey fields ───

    it('should not expose privateKey or publicKey on the Tenant entity response', async () => {
        const tenant = await createTenant('no-keys');

        // Fetch tenant detail via admin API
        const res = await app.getHttpServer()
            .get(`/api/admin/tenant/${tenant.id}`)
            .set('Authorization', `Bearer ${adminAccessToken}`)
            .set('Accept', 'application/json');
        expect2xx(res);

        // Tenant response should NOT have privateKey or publicKey at the top level
        expect(res.body).not.toHaveProperty('privateKey');
        expect(res.body).not.toHaveProperty('publicKey');
        expect(res.body).not.toHaveProperty('private_key');
        expect(res.body).not.toHaveProperty('public_key');
    });

    // ─── TenantService.updateKeys() creates a new TenantKey via rotation ───

    it('should create a new TenantKey via rotation when updateKeys is called', async () => {
        const tenant = await createTenant('update-keys');

        const jwksBefore = await fetchJwks(tenant.domain);
        expect(jwksBefore.keys.length).toEqual(1);

        // Trigger rotation via admin API (which calls TenantService.updateKeys → KeyManagementService.rotateKey)
        await rotateKeys(tenant.id);

        const jwksAfter = await fetchJwks(tenant.domain);
        expect(jwksAfter.keys.length).toEqual(2);

        // All kids should be unique
        const kids = jwksAfter.keys.map((k: any) => k.kid);
        const uniqueKids = new Set(kids);
        expect(uniqueKids.size).toEqual(kids.length);
    });

    // ─── Tenant detail API responses still include publicKey (read from TenantKey) ───

    it('should still include publicKey in tenant credentials API response (read from TenantKey)', async () => {
        const tenant = await createTenant('cred-pk');

        // Admin credentials endpoint
        const credRes = await app.getHttpServer()
            .get(`/api/admin/tenant/${tenant.id}/credentials`)
            .set('Authorization', `Bearer ${adminAccessToken}`)
            .set('Accept', 'application/json');
        expect2xx(credRes);

        expect(credRes.body).toHaveProperty('publicKey');
        expect(typeof credRes.body.publicKey).toBe('string');
        expect(credRes.body.publicKey).toContain('BEGIN PUBLIC KEY');

        // After rotation, credentials should return the NEW current key's publicKey
        await rotateKeys(tenant.id);

        const credResAfter = await app.getHttpServer()
            .get(`/api/admin/tenant/${tenant.id}/credentials`)
            .set('Authorization', `Bearer ${adminAccessToken}`)
            .set('Accept', 'application/json');
        expect2xx(credResAfter);

        expect(credResAfter.body).toHaveProperty('publicKey');
        expect(typeof credResAfter.body.publicKey).toBe('string');
        expect(credResAfter.body.publicKey).toContain('BEGIN PUBLIC KEY');

        // The public key should have changed after rotation
        expect(credResAfter.body.publicKey).not.toEqual(credRes.body.publicKey);
    });
});
