/**
 * Tests the OAuth Client entity lifecycle.
 *
 * Covers: creating confidential and public clients, fetching by clientId and by tenant,
 * secret rotation (with 24h overlap window), field updates (including immutable fields
 * like isPublic/grantTypes that should be ignored), and deletion with 404 verification.
 */
import {SharedTestFixture} from "../shared-test.fixture";
import {TokenFixture} from "../token.fixture";
import {ClientEntityClient} from "../api-client/client-entity-client";
import {TenantClient} from "../api-client/tenant-client";
import {AdminTenantClient} from "../api-client/admin-tenant-client";

describe("E2E Client Entity Management", () => {
    let app: SharedTestFixture;
    let clientApi: ClientEntityClient;
    let tenantApi: TenantClient;
    let adminApi: AdminTenantClient;
    let accessToken: string;
    let testTenantId: string;

    beforeAll(async () => {
        app = new SharedTestFixture();
        const tokenFixture = new TokenFixture(app);
        const response = await tokenFixture.fetchAccessToken(
            "admin@auth.server.com",
            "admin9000",
            "auth.server.com"
        );
        accessToken = response.accessToken;
        clientApi = new ClientEntityClient(app, accessToken);
        tenantApi = new TenantClient(app, accessToken);
        adminApi = new AdminTenantClient(app, accessToken);

        // Create a tenant to own the clients
        const tenant = await tenantApi.createTenant("client-test-tenant", "client-test.com");
        testTenantId = tenant.id;
    });

    afterAll(async () => {
        await app.close();
    });

    it("should perform full client lifecycle", async () => {
        // 1) Create a confidential client
        const created = await clientApi.createClient(testTenantId, "My Web App", {
            redirectUris: ["https://myapp.example.com/callback"],
            allowedScopes: "openid profile",
            grantTypes: "authorization_code",
            responseTypes: "code",
        });

        expect(created.client).toBeDefined();
        expect(created.client.clientId).toBeDefined();
        expect(created.clientSecret).toBeDefined();
        expect(typeof created.clientSecret).toBe("string");
        expect(created.clientSecret.length).toBe(64); // 32 bytes hex
        expect(created.client.clientSecrets).toHaveLength(1);
        expect(created.client.isPublic).toBe(false);
        expect(created.client.name).toBe("My Web App");

        const clientId = created.client.clientId;
        const originalSecret = created.clientSecret;

        // 2) Get client by clientId
        const fetched = await clientApi.getClient(clientId);
        expect(fetched.clientId).toBe(clientId);
        expect(fetched.name).toBe("My Web App");
        expect(fetched.tenant).toBeDefined();
        expect(fetched.tenant.id).toBe(testTenantId);

        // 3) Get clients by tenant (cross-tenant, use admin route)
        const tenantClients = await adminApi.getTenantClients(testTenantId);
        expect(Array.isArray(tenantClients)).toBe(true);
        expect(tenantClients.length).toBeGreaterThanOrEqual(1);
        expect(tenantClients.find((c: any) => c.clientId === clientId)).toBeDefined();

        // 4) Rotate secret
        const rotated = await clientApi.rotateSecret(clientId);
        expect(rotated.client).toBeDefined();
        expect(rotated.clientSecret).toBeDefined();
        expect(rotated.clientSecret).not.toBe(originalSecret);
        // Should now have 2 secrets (old with expiry + new)
        expect(rotated.client.clientSecrets).toHaveLength(2);
        // Old secret should have expires_at set
        expect(rotated.client.clientSecrets[0].expires_at).not.toBeNull();
        // New secret should have no expiry
        expect(rotated.client.clientSecrets[1].expires_at).toBeNull();

        // 5) Delete client
        const deleteResult = await clientApi.deleteClient(clientId);
        expect(deleteResult.status).toBe("success");

        // 6) Verify deletion — should get 404
        const verifyResponse = await clientApi.getClientRaw(clientId);
        expect(verifyResponse.status).toBe(404);
    });


    it("should update client fields", async () => {
        // Create a client to update
        const created = await clientApi.createClient(testTenantId, "Update Test Client", {
            redirectUris: ["https://original.example.com/callback"],
            requirePkce: false,
            allowPasswordGrant: false,
            allowRefreshToken: true,
        });
        const clientId = created.client.clientId;

        // Update name and redirectUris
        const updated = await clientApi.updateClient(clientId, {
            name: "Updated Client Name",
            redirectUris: ["https://new.example.com/callback", "https://other.example.com/callback"],
        });
        expect(updated.name).toBe("Updated Client Name");
        expect(updated.redirectUris).toEqual(["https://new.example.com/callback", "https://other.example.com/callback"]);
        // Unchanged fields should remain the same
        expect(updated.requirePkce).toBe(false);
        expect(updated.allowPasswordGrant).toBe(false);
        expect(updated.allowRefreshToken).toBe(true);

        // Update boolean flags
        const updated2 = await clientApi.updateClient(clientId, {
            requirePkce: true,
            allowPasswordGrant: true,
            allowRefreshToken: false,
        });
        expect(updated2.requirePkce).toBe(true);
        expect(updated2.allowPasswordGrant).toBe(true);
        expect(updated2.allowRefreshToken).toBe(false);
        // Name should remain from previous update
        expect(updated2.name).toBe("Updated Client Name");

        // Verify via GET
        const fetched = await clientApi.getClient(clientId);
        expect(fetched.name).toBe("Updated Client Name");
        expect(fetched.requirePkce).toBe(true);
        expect(fetched.allowPasswordGrant).toBe(true);
        expect(fetched.allowRefreshToken).toBe(false);
        expect(fetched.redirectUris).toEqual(["https://new.example.com/callback", "https://other.example.com/callback"]);

        // Cleanup
        await clientApi.deleteClient(clientId);
    });

    it("should not allow updating isPublic or grantTypes via update endpoint", async () => {
        const created = await clientApi.createClient(testTenantId, "Immutable Fields Test", {
            grantTypes: "authorization_code",
            isPublic: false,
        });
        const clientId = created.client.clientId;

        // Send fields that should be ignored by the update endpoint
        const updated = await clientApi.updateClient(clientId, {
            name: "Still Confidential",
            isPublic: true,
            grantTypes: "implicit",
        } as any);
        expect(updated.name).toBe("Still Confidential");
        // isPublic and grantTypes should remain unchanged even if sent
        expect(updated.isPublic).toBe(false);
        expect(updated.grantTypes).toBe("authorization_code");

        // Cleanup
        await clientApi.deleteClient(clientId);
    });

    it("should create a public client without a secret", async () => {
        const created = await clientApi.createClient(testTenantId, "Public SPA", {
            redirectUris: ["https://spa.example.com/callback"],
            isPublic: true,
        });

        expect(created.client).toBeDefined();
        expect(created.client.clientId).toBeDefined();
        expect(created.client.isPublic).toBe(true);
        expect(created.clientSecret).toBeNull();
        expect(created.client.clientSecrets).toEqual([]);

        // Cleanup
        await clientApi.deleteClient(created.client.clientId);
    });
});
