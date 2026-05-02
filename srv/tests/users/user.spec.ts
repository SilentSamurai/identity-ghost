import {v4 as uuidv4} from 'uuid';
import {SharedTestFixture} from "../shared-test.fixture";
import {UsersClient} from "../api-client/user-client";
import {TokenFixture} from "../token.fixture";


describe('UsersController (e2e)', () => {
    let app: SharedTestFixture;
    let usersClient: UsersClient;
    let tokenFixture: TokenFixture;
    let accessToken: string;

    // Test user credentials
    const testUserEmail = `test-user-${uuidv4()}@example.com`;
    const testUserPassword = 'Test@123456';
    const testUserName = 'Test User';

    // Updated credentials for testing updates
    const updatedName = 'U Test User';
    const updatedEmail = `updated-${uuidv4()}@example.com`;
    const updatedPassword = 'UpdatedTest@123456';

    beforeAll(async () => {
        // Create and set up the test application
        app = new SharedTestFixture();

        // Get admin access token for authenticated requests
        tokenFixture = new TokenFixture(app);
        const tokenResponse = await tokenFixture.fetchAccessToken(
            "admin@auth.server.com",
            "admin9000",
            "auth.server.com"
        );
        accessToken = tokenResponse.accessToken;

        // Initialize the users client with the access token
        usersClient = new UsersClient(app, accessToken);
    });

    afterAll(async () => {
        await app.close();
        // smtpServer.close();
    });

    describe('Admin API Operations', () => {
        // Admin credentials
        let adminToken: string;
        let adminClient: UsersClient;
        let testUserId: string;
        const adminCreatedEmail = `admin-created-${uuidv4()}@example.com`;

        beforeAll(async () => {
            // Get admin token
            const adminAuth = await tokenFixture.fetchAccessToken(
                "admin@auth.server.com",
                "admin9000",
                "auth.server.com"
            );

            adminToken = adminAuth.accessToken;
            adminClient = new UsersClient(app, adminToken);
        });

        it('should create a user as admin', async () => {

            const user = await adminClient.createUser(
                'Admin Created User',
                adminCreatedEmail,
                'AdminCreated@123'
            );

            expect(user).toBeDefined();
            expect(user.id).toBeDefined();
            expect(user.email).toBe(adminCreatedEmail);

            testUserId = user.id;
        });

        it('should get user by ID', async () => {
            const user = await adminClient.getUser(testUserId);

            expect(user).toBeDefined();
            expect(user.id).toBe(testUserId);
        });

        it('should get user by email', async () => {
            const user = await adminClient.getUserByEmail(adminCreatedEmail);

            expect(user).toBeDefined();
            expect(user.email).toBe(adminCreatedEmail);
        });


        it('should get all users', async () => {
            const users = await adminClient.getAllUsers();

            expect(users).toBeDefined();
            expect(Array.isArray(users)).toBe(true);
            expect(users.length).toBeGreaterThan(0);
        });

        it('should update a user', async () => {
            const updatedAdminEmail = `updated-admin-${uuidv4()}@example.com`;
            const user = await adminClient.updateUser(
                testUserId,
                'Updated Admin User',
                updatedAdminEmail
            );

            expect(user).toBeDefined();
            expect(user.name).toBe('Updated Admin User');
            expect(user.email).toBe(updatedAdminEmail);
        });

        it('should get user tenants', async () => {
            const tenants = await adminClient.getUserTenants(testUserId);

            expect(tenants).toBeDefined();
            expect(Array.isArray(tenants)).toBe(true);
        });

        it('should delete a user', async () => {
            const response = await adminClient.deleteUser(testUserId);

            expect(response).toBeDefined();
            expect(response.status).toBe(200);

            // Verify user is deleted
            try {
                await adminClient.getUser(testUserId);
                fail('Should not be able to get deleted user');
            } catch (error) {
                expect(error).toBeDefined();
            }
        });
    });
});