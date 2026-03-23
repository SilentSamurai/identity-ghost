import {TestAppFixture} from "../test-app.fixture";
import {TokenFixture} from "../token.fixture";
import {ClientEntityClient} from "../api-client/client-entity-client";
import {TenantClient} from "../api-client/tenant-client";

describe("E2E Client Entity Management", () => {
    let app: TestAppFixture;
    let clientApi: ClientEntityClient;
    let tenantApi: TenantClient;
    let accessToken: string;
    let testTenantId: string;

    beforeAll(async () => {
        app = await new TestAppFixture().init();
        const tokenFixture = new TokenFixture(app);
        const response = await tokenFixture.fetchAccessToken(
            "admin@auth.server.com",
            "admin9000",
            "auth.server.com"
        );
        accessToken = response.accessToken;
        clientApi = new ClientEntityClient(app, accessToken);
        tenantApi = new TenantClient(app, accessToken);

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

        // 3) Get clients by tenant
        const tenantClients = await clientApi.getClientsByTenant(testTenantId);
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
