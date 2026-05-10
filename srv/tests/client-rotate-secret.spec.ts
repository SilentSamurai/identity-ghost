import {SharedTestFixture} from "./shared-test.fixture";
import {TokenFixture} from "./token.fixture";
import {ClientEntityClient} from "./api-client/client-entity-client";

describe("Client Secret Rotation - Public to Confidential", () => {
    let app: SharedTestFixture;
    let clientApi: ClientEntityClient;
    let accessToken: string;
    let defaultClientId: string;

    const domain = "client-rotate-test.local";
    const email = `admin@${domain}`;
    const password = "admin9000";

    beforeAll(async () => {
        app = new SharedTestFixture();
        const tokenFixture = new TokenFixture(app);
        const response = await tokenFixture.fetchPasswordGrantAccessToken(email, password, domain);
        accessToken = response.accessToken;
        clientApi = new ClientEntityClient(app, accessToken);

        // Find the default client by listing tenant clients
        const clients = await clientApi.getClientsByTenant("");
        const defaultClient = clients.find((c: any) => c.alias === domain);
        expect(defaultClient).toBeDefined();
        defaultClientId = defaultClient.clientId;
    });

    afterAll(async () => {
        await app.close();
    });

    it("should convert a public client to confidential on first rotate", async () => {
        const client = await clientApi.getClient(defaultClientId);
        expect(client.isPublic).toBe(true);
        expect(client.clientSecrets).toEqual([]);
        expect(client.tokenEndpointAuthMethod).toBe("none");

        const rotated = await clientApi.rotateSecret(defaultClientId);

        expect(rotated.client.isPublic).toBe(false);
        expect(rotated.client.tokenEndpointAuthMethod).toBe("client_secret_basic");
        expect(rotated.clientSecret).toBeDefined();
        expect(rotated.clientSecret.length).toBe(64);
        expect(rotated.client.clientSecrets).toHaveLength(1);
        expect(rotated.client.clientSecrets[0].expires_at).toBeNull();
    });

    it("should set 24h expiry on old secret when rotating again", async () => {
        const client = await clientApi.getClient(defaultClientId);
        expect(client.isPublic).toBe(false);
        const previousCount = client.clientSecrets.length;

        const rotated = await clientApi.rotateSecret(defaultClientId);

        expect(rotated.client.clientSecrets).toHaveLength(previousCount + 1);
        // Old secrets should have expires_at set
        for (let i = 0; i < rotated.client.clientSecrets.length - 1; i++) {
            expect(rotated.client.clientSecrets[i].expires_at).not.toBeNull();
        }
        // New secret has no expiry
        const last = rotated.client.clientSecrets[rotated.client.clientSecrets.length - 1];
        expect(last.expires_at).toBeNull();
    });

    it("should authenticate with the rotated secret via client_credentials", async () => {
        const rotated = await clientApi.rotateSecret(defaultClientId);

        const tokenResponse = await app.getHttpServer()
            .post("/api/oauth/token")
            .send({
                grant_type: "client_credentials",
                client_id: domain,
                client_secret: rotated.clientSecret,
            })
            .set("Accept", "application/json");

        expect(tokenResponse.status).toBe(200);
        expect(tokenResponse.body.access_token).toBeDefined();
    });
});
