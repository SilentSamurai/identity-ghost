import {SharedTestFixture} from "./shared-test.fixture";
import {TokenFixture} from "./token.fixture";
import {expect2xx} from "./api-client/client";

/**
 * Integration tests for admin key management endpoints.
 *
 * GET /api/admin/tenant/:tenantId/keys  — per-tenant key listing
 * GET /api/admin/keys                   — cross-tenant key listing
 *
 * Validates:
 *   - Key metadata returned with correct ordering and config (Req 1)
 *   - Private/public key exclusion from responses (Req 1.3, 9.3)
 *   - Auth guards: 401 without token, 403 for non-super-admin (Req 1.4, 9.4)
 *   - Error handling: 404 unknown tenant, 400 invalid UUID (Req 1.5, 1.6)
 *   - Cross-tenant listing with tenant info (Req 9.1, 9.2)
 *   - Status and tenantId query filters (Req 9.5)
 */
describe('Admin key management endpoints', () => {
    let app: SharedTestFixture;
    let tokenFixture: TokenFixture;
    let adminAccessToken: string;

    // Test tenants created in beforeAll
    let tenantA: { id: string; domain: string };
    let tenantB: { id: string; domain: string };

    beforeAll(async () => {
        app = new SharedTestFixture();
        tokenFixture = new TokenFixture(app);

        const adminResult = await tokenFixture.fetchAccessToken(
            "admin@auth.server.com",
            "admin9000",
            "auth.server.com",
        );
        adminAccessToken = adminResult.accessToken;

        // Create two tenants for isolation and cross-tenant tests
        const ts = Date.now().toString(36);

        const resA = await app.getHttpServer()
            .post('/api/tenant/create')
            .send({name: `ak-a-${ts}`.substring(0, 20), domain: `ak-a-${ts}.com`})
            .set('Authorization', `Bearer ${adminAccessToken}`)
            .set('Accept', 'application/json');
        expect2xx(resA);
        tenantA = {id: resA.body.id, domain: `ak-a-${ts}.com`};

        const resB = await app.getHttpServer()
            .post('/api/tenant/create')
            .send({name: `ak-b-${ts}`.substring(0, 20), domain: `ak-b-${ts}.com`})
            .set('Authorization', `Bearer ${adminAccessToken}`)
            .set('Accept', 'application/json');
        expect2xx(resB);
        tenantB = {id: resB.body.id, domain: `ak-b-${ts}.com`};

        // Rotate tenant A twice so it has 3 keys total (1 current, 1 active/superseded, 1 deactivated after 3rd rotation)
        await rotateKeys(tenantA.id);
        await rotateKeys(tenantA.id);
        // Rotate a third time to force-deactivate the oldest key (max active = 3)
        await rotateKeys(tenantA.id);
    });

    afterAll(async () => {
        await app.close();
    });

    /** Helper: rotate keys for a tenant via admin API */
    async function rotateKeys(tenantId: string): Promise<void> {
        const res = await app.getHttpServer()
            .put(`/api/admin/tenant/${tenantId}/keys`)
            .set('Authorization', `Bearer ${adminAccessToken}`)
            .set('Accept', 'application/json');
        expect2xx(res);
    }

    // ─── GET /api/admin/tenant/:tenantId/keys ───────────────────────────────────

    describe('GET /api/admin/tenant/:tenantId/keys', () => {

        it('should return keys ordered by keyVersion DESC with config metadata', async () => {
            const res = await app.getHttpServer()
                .get(`/api/admin/tenant/${tenantA.id}/keys`)
                .set('Authorization', `Bearer ${adminAccessToken}`)
                .set('Accept', 'application/json');
            expect2xx(res);

            expect(res.body).toHaveProperty('keys');
            expect(res.body).toHaveProperty('maxActiveKeys');
            expect(res.body).toHaveProperty('tokenExpirationSeconds');
            expect(typeof res.body.maxActiveKeys).toBe('number');
            expect(typeof res.body.tokenExpirationSeconds).toBe('number');

            const keys = res.body.keys;
            expect(keys.length).toBeGreaterThanOrEqual(1);

            // Verify ordering: keyVersion should be descending
            for (let i = 1; i < keys.length; i++) {
                expect(keys[i - 1].keyVersion).toBeGreaterThan(keys[i].keyVersion);
            }

            // Verify each key has the expected metadata fields
            for (const key of keys) {
                expect(key).toHaveProperty('id');
                expect(key).toHaveProperty('keyVersion');
                expect(key).toHaveProperty('kid');
                expect(key).toHaveProperty('isCurrent');
                expect(key).toHaveProperty('createdAt');
                expect(key).toHaveProperty('supersededAt');
                expect(key).toHaveProperty('deactivatedAt');
            }

            // Exactly one key should be current
            const currentKeys = keys.filter((k: any) => k.isCurrent === true);
            expect(currentKeys.length).toEqual(1);
        });

        it('should exclude privateKey and publicKey from response', async () => {
            const res = await app.getHttpServer()
                .get(`/api/admin/tenant/${tenantA.id}/keys`)
                .set('Authorization', `Bearer ${adminAccessToken}`)
                .set('Accept', 'application/json');
            expect2xx(res);

            for (const key of res.body.keys) {
                expect(key).not.toHaveProperty('privateKey');
                expect(key).not.toHaveProperty('publicKey');
                expect(key).not.toHaveProperty('private_key');
                expect(key).not.toHaveProperty('public_key');
            }
        });

        it('should return 401 without auth token', async () => {
            const res = await app.getHttpServer()
                .get(`/api/admin/tenant/${tenantA.id}/keys`)
                .set('Accept', 'application/json');

            expect(res.status).toEqual(401);
        });

        it('should return 403 for non-super-admin', async () => {
            // Authenticate as a tenant admin (not super admin)
            const nonSuperAdmin = await tokenFixture.fetchAccessToken(
                "admin@shire.local",
                "admin9000",
                "shire.local",
            );

            const res = await app.getHttpServer()
                .get(`/api/admin/tenant/${tenantA.id}/keys`)
                .set('Authorization', `Bearer ${nonSuperAdmin.accessToken}`)
                .set('Accept', 'application/json');

            expect(res.status).toEqual(403);
        });

        it('should return 404 for unknown tenant', async () => {
            const unknownId = '00000000-0000-0000-0000-000000000000';
            const res = await app.getHttpServer()
                .get(`/api/admin/tenant/${unknownId}/keys`)
                .set('Authorization', `Bearer ${adminAccessToken}`)
                .set('Accept', 'application/json');

            expect(res.status).toEqual(404);
        });

        it('should return 400 for invalid UUID', async () => {
            const res = await app.getHttpServer()
                .get(`/api/admin/tenant/not-a-uuid/keys`)
                .set('Authorization', `Bearer ${adminAccessToken}`)
                .set('Accept', 'application/json');

            expect(res.status).toEqual(400);
        });
    });

    // ─── GET /api/admin/keys ────────────────────────────────────────────────────

    describe('GET /api/admin/keys', () => {

        it('should return all keys across tenants with tenant info', async () => {
            const res = await app.getHttpServer()
                .get('/api/admin/keys')
                .set('Authorization', `Bearer ${adminAccessToken}`)
                .set('Accept', 'application/json');
            expect2xx(res);

            expect(res.body).toHaveProperty('keys');
            expect(res.body).toHaveProperty('maxActiveKeys');
            expect(res.body).toHaveProperty('tokenExpirationSeconds');

            const keys = res.body.keys;
            expect(keys.length).toBeGreaterThanOrEqual(1);

            // Verify each key includes tenant info
            for (const key of keys) {
                expect(key).toHaveProperty('id');
                expect(key).toHaveProperty('keyVersion');
                expect(key).toHaveProperty('kid');
                expect(key).toHaveProperty('isCurrent');
                expect(key).toHaveProperty('createdAt');
                expect(key.tenant).toBeDefined();
                expect(key.tenant).toHaveProperty('id');
                expect(key.tenant).toHaveProperty('name');
                expect(key.tenant).toHaveProperty('domain');
            }

            // Should contain keys from both test tenants
            const tenantIds = new Set(keys.map((k: any) => k.tenant.id));
            expect(tenantIds.has(tenantA.id)).toBe(true);
            expect(tenantIds.has(tenantB.id)).toBe(true);

            // Verify ordering: createdAt should be descending
            for (let i = 1; i < keys.length; i++) {
                const prev = new Date(keys[i - 1].createdAt).getTime();
                const curr = new Date(keys[i].createdAt).getTime();
                expect(prev).toBeGreaterThanOrEqual(curr);
            }
        });

        it('should exclude privateKey and publicKey', async () => {
            const res = await app.getHttpServer()
                .get('/api/admin/keys')
                .set('Authorization', `Bearer ${adminAccessToken}`)
                .set('Accept', 'application/json');
            expect2xx(res);

            for (const key of res.body.keys) {
                expect(key).not.toHaveProperty('privateKey');
                expect(key).not.toHaveProperty('publicKey');
                expect(key).not.toHaveProperty('private_key');
                expect(key).not.toHaveProperty('public_key');
            }
        });

        it('should return 401 without auth token', async () => {
            const res = await app.getHttpServer()
                .get('/api/admin/keys')
                .set('Accept', 'application/json');

            expect(res.status).toEqual(401);
        });

        it('should return 403 for non-super-admin', async () => {
            const nonSuperAdmin = await tokenFixture.fetchAccessToken(
                "admin@shire.local",
                "admin9000",
                "shire.local",
            );

            const res = await app.getHttpServer()
                .get('/api/admin/keys')
                .set('Authorization', `Bearer ${nonSuperAdmin.accessToken}`)
                .set('Accept', 'application/json');

            expect(res.status).toEqual(403);
        });

        it('should filter by status=current and return only current keys', async () => {
            const res = await app.getHttpServer()
                .get('/api/admin/keys?status=current')
                .set('Authorization', `Bearer ${adminAccessToken}`)
                .set('Accept', 'application/json');
            expect2xx(res);

            const keys = res.body.keys;
            expect(keys.length).toBeGreaterThanOrEqual(1);

            for (const key of keys) {
                expect(key.isCurrent).toBe(true);
            }
        });

        it('should filter by status=active and return only active (non-current, non-deactivated) keys', async () => {
            const res = await app.getHttpServer()
                .get('/api/admin/keys?status=active')
                .set('Authorization', `Bearer ${adminAccessToken}`)
                .set('Accept', 'application/json');
            expect2xx(res);

            const keys = res.body.keys;
            // Active keys: isCurrent=false AND deactivatedAt IS NULL
            for (const key of keys) {
                expect(key.isCurrent).toBe(false);
                expect(key.deactivatedAt).toBeNull();
            }
        });

        it('should filter by status=deactivated and return only deactivated keys', async () => {
            const res = await app.getHttpServer()
                .get('/api/admin/keys?status=deactivated')
                .set('Authorization', `Bearer ${adminAccessToken}`)
                .set('Accept', 'application/json');
            expect2xx(res);

            const keys = res.body.keys;
            expect(keys.length).toBeGreaterThanOrEqual(1);

            for (const key of keys) {
                expect(key.deactivatedAt).not.toBeNull();
            }
        });

        it('should filter by tenantId and return only keys for specified tenant', async () => {
            const res = await app.getHttpServer()
                .get(`/api/admin/keys?tenantId=${tenantA.id}`)
                .set('Authorization', `Bearer ${adminAccessToken}`)
                .set('Accept', 'application/json');
            expect2xx(res);

            const keys = res.body.keys;
            expect(keys.length).toBeGreaterThanOrEqual(1);

            for (const key of keys) {
                expect(key.tenant.id).toEqual(tenantA.id);
            }
        });
    });
});
