import {SharedTestFixture} from "../shared-test.fixture";
import {UsersClient} from "../api-client/user-client";
import {TokenFixture} from "../token.fixture";

describe('e2e users', () => {
    let app: SharedTestFixture;
    let refreshToken = "";
    let accessToken = "";
    let user = {email: "", id: ""};

    beforeAll(async () => {
        app = new SharedTestFixture();
    });

    afterAll(async () => {
        await app.close();
    });

    it('User Operation all', async () => {
        // STEP 1: Fetch Access Token
        const tokenFixture = new TokenFixture(app);
        let response = await tokenFixture.fetchAccessToken(
            "admin@auth.server.com",
            "admin9000",
            "auth.server.com"
        );
        accessToken = response.accessToken;
        refreshToken = response.refreshToken;
        expect(accessToken).toBeDefined();

        // Create a UsersClient instance
        const usersClient = new UsersClient(app, accessToken);

        // STEP 2: Create User
        const createdUser = await usersClient.createUser("TestUser", "TestUser@test-wesite.com", "TestUser9000");
        expect(createdUser.id).toBeDefined();
        expect(createdUser.name).toEqual("TestUser");
        expect(createdUser.email).toEqual("TestUser@test-wesite.com");

        user = createdUser;

        // STEP 3: Get User Details
        const userDetailsResponse = await usersClient.getUser(user.id);
        expect(userDetailsResponse.id).toBeDefined();
        expect(userDetailsResponse.name).toEqual("TestUser");
        expect(userDetailsResponse.email).toEqual("TestUser@test-wesite.com");

        // STEP 4: Update User
        const updatedUser = await usersClient.updateUser(
            user.id,
            "UpdateTestUser",
            "UpdatedTestUser@test-wesite.com"
        );
        expect(updatedUser.id).toBeDefined();
        expect(updatedUser.name).toEqual("UpdateTestUser");
        expect(updatedUser.email).toEqual("UpdatedTestUser@test-wesite.com");
        user = updatedUser;

        // STEP 5: Get All Users
        const allUsers = await usersClient.getAllUsers();
        expect(Array.isArray(allUsers)).toBe(true);
        expect(allUsers.length).toBeGreaterThanOrEqual(1);
        expect(
            allUsers.find(u => u.email === "UpdatedTestUser@test-wesite.com")
        ).toBeDefined();

        // STEP 6: Get User Tenants
        const userTenants = await usersClient.getUserTenants(user.id);
        expect(Array.isArray(userTenants)).toBe(true);
        // May be zero or more. Just check if array is returned
        expect(userTenants.length).toBeGreaterThanOrEqual(0);

        // STEP 7: Delete User
        const deleteResponse = await usersClient.deleteUser(user.id);
        // Typically returns the deleted user or an object. We just check that it doesn't throw
        expect(deleteResponse.status).toEqual(200);
    });
})