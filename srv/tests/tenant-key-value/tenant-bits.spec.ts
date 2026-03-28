/**
 * Tests the TenantBits key-value store API.
 *
 * TenantBits allows technical clients (client_credentials grant) to store per-tenant
 * key-value pairs scoped by owner. Covers:
 *   - CRUD lifecycle (add, update, get, exists, delete)
 *   - Cross-tenant isolation: same key on different tenants stays independent
 *   - Owner isolation: different owners writing to the same tenant cannot see each other's keys
 *   - Auth enforcement: user (password grant) tokens are rejected with 403
 */
import {SharedTestFixture} from '../shared-test.fixture';
import {TenantClient} from '../api-client/tenant-client';
import {AdminTenantClient} from '../api-client/admin-tenant-client';
import {TokenFixture} from '../token.fixture';
import {TenantBitsClient} from "../api-client/tenant-bits-client";

describe('TenantBits API', () => {
    let app: SharedTestFixture;
    let tenantClient: TenantClient;
    let adminTenantClient: AdminTenantClient;
    let bitsClient: TenantBitsClient;
    let accessToken: string;
    let tenantId: string;
    let tenantId2: string;

    // For multi-owner test
    let accessToken2: string;
    let bitsClient2: TenantBitsClient;

    beforeAll(async () => {
        app = new SharedTestFixture();
        const tokenFixture = new TokenFixture(app);
        // Create two tenants
        const adminResponse = await tokenFixture.fetchAccessToken(
            'admin@auth.server.com',
            'admin9000',
            'auth.server.com'
        );
        tenantClient = new TenantClient(app, adminResponse.accessToken);
        adminTenantClient = new AdminTenantClient(app, adminResponse.accessToken);
        // Create tenants as admin
        const tenant = await tenantClient.createTenant('bits-test-tenant', 'bits-test-tenant-domain');
        tenantId = tenant.id;
        const tenant2 = await tenantClient.createTenant('bits-test-tenant2', 'bits-test-tenant2-domain');
        tenantId2 = tenant2.id;

        // Use client credentials for bitsClient (tenant 1)
        const tenant1Creds = await adminTenantClient.getTenantCredentials(tenantId);
        const response1 = await tokenFixture.fetchClientCredentialsToken(
            tenant1Creds.clientId,
            tenant1Creds.clientSecret
        );
        accessToken = response1.accessToken;
        bitsClient = new TenantBitsClient(app, accessToken);

        // Use client credentials for bitsClient2 (tenant 2)
        const tenant2Creds = await adminTenantClient.getTenantCredentials(tenantId2);
        const response2 = await tokenFixture.fetchClientCredentialsToken(
            tenant2Creds.clientId,
            tenant2Creds.clientSecret
        );
        accessToken2 = response2.accessToken;
        bitsClient2 = new TenantBitsClient(app, accessToken2);
    });

    afterAll(async () => {
        await app.close();
    });

    it('should add a bit', async () => {
        const result = await bitsClient.addOrUpdate(tenantId, 'theme', 'dark');
        expect(result.success).toBe(true);
        expect(result.kv.key).toBe('theme');
        expect(result.kv.value).toBe('dark');
    });

    it('should update the value for the same bit', async () => {
        const result = await bitsClient.addOrUpdate(tenantId, 'theme', 'light');
        expect(result.success).toBe(true);
        expect(result.kv.value).toBe('light');
    });

    it('should check if bit exists', async () => {
        const exists = await bitsClient.exists(tenantId, 'theme');
        expect(exists).toBe(true);
    });

    it('should get the value for a bit', async () => {
        const value = await bitsClient.getValue(tenantId, 'theme');
        expect(value).toBe('light');
    });

    it('should delete a bit', async () => {
        const result = await bitsClient.delete(tenantId, 'theme');
        expect(result.success).toBe(true);
    });

    it('should confirm bit does not exist after deletion', async () => {
        const exists = await bitsClient.exists(tenantId, 'theme');
        expect(exists).toBe(false);
    });

    it('should allow same bit for different tenants with different values (by same owner)', async () => {
        // Set value for tenant 1
        await bitsClient.addOrUpdate(tenantId, 'shared-key', 'value-tenant1');
        // Set value for tenant 2
        await bitsClient.addOrUpdate(tenantId2, 'shared-key', 'value-tenant2');
        // Get values for both tenants
        const value1 = await bitsClient.getValue(tenantId, 'shared-key');
        const value2 = await bitsClient.getValue(tenantId2, 'shared-key');
        expect(value1).toBe('value-tenant1');
        expect(value2).toBe('value-tenant2');
    });

    it('should not update value for other tenant when updating same bit (by same owner)', async () => {
        // Update value for tenant 1
        await bitsClient.addOrUpdate(tenantId, 'shared-key', 'updated-tenant1');
        // Value for tenant 2 should remain unchanged
        const value2 = await bitsClient.getValue(tenantId2, 'shared-key');
        expect(value2).toBe('value-tenant2');
        // Value for tenant 1 should be updated
        const value1 = await bitsClient.getValue(tenantId, 'shared-key');
        expect(value1).toBe('updated-tenant1');
    });

    it('should not delete bit for other tenant when deleting same bit (by same owner)', async () => {
        // Delete bit for tenant 1
        await bitsClient.delete(tenantId, 'shared-key');
        // Bit for tenant 2 should still exist
        const exists2 = await bitsClient.exists(tenantId2, 'shared-key');
        expect(exists2).toBe(true);
        // Bit for tenant 1 should not exist
        const exists1 = await bitsClient.exists(tenantId, 'shared-key');
        expect(exists1).toBe(false);
    });

    it('should allow different owners to save different bits for the same tenant and keep them isolated', async () => {
        // Owner 1 saves key1 for tenantId
        await bitsClient.addOrUpdate(tenantId, 'owner1-key', 'owner1-value');
        // Owner 2 saves key2 for tenantId
        await bitsClient2.addOrUpdate(tenantId, 'owner2-key', 'owner2-value');
        // Owner 1 should see only their bit
        const value1 = await bitsClient.getValue(tenantId, 'owner1-key');
        expect(value1).toBe('owner1-value');
        const exists1 = await bitsClient.exists(tenantId, 'owner2-key');
        expect(exists1).toBe(false);
        // Owner 2 should see only their bit
        const value2 = await bitsClient2.getValue(tenantId, 'owner2-key');
        expect(value2).toBe('owner2-value');
        const exists2 = await bitsClient2.exists(tenantId, 'owner1-key');
        expect(exists2).toBe(false);
    });
    //
    it('should reject requests with a user (password grant) token', async () => {
        const tokenFixture = new TokenFixture(app);
        const userResponse = await tokenFixture.fetchAccessToken(
            'admin@auth.server.com',
            'admin9000',
            'auth.server.com'
        );
        const userBitsClient = new TenantBitsClient(app, userResponse.accessToken);
        try {
            await userBitsClient.addOrUpdate(tenantId, 'forbidden', 'value')
        } catch (e) {
            expect(e.status).toBe(403);
        }
    });
}); 