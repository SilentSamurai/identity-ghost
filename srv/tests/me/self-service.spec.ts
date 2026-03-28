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
    const clientId = "shire.local";

    beforeAll(async () => {
        console.log("Starting Test Stating");
        // Create and set up the test application
        app = new SharedTestFixture();

        // Get admin access token for authenticated requests
        tokenFixture = new TokenFixture(app);
        // Initialize the users client with the access token
        usersClient = new UsersClient(app, "");
        console.log("Starting Test Finish");
    });

    afterAll(async () => {
        console.log("Closing Test Stating");
        await app.close();
        console.log("Closing Test Finished");
    });

    describe('User Registration and Authentication Flow with a Tenant', () => {
        it('should register a new user', async () => {

            // Test signup endpoint
            const signupResponse = await usersClient.signup(testUserName, testUserEmail, testUserPassword, clientId);

            expect(signupResponse).toBeDefined();
            expect(signupResponse.success).toBeDefined();
            expect(signupResponse.success).toBe(true);

            // Password should not be returned
            expect(signupResponse.password).toBeUndefined();
        });

        it('should verify a new user via email link', async () => {
            // Find the verification email sent to our test user
            const search = {
                to: testUserEmail,
                subject: /signing.*up.*Auth.*Server/i,
            };
            const verificationEmail = await app.smtp.waitForEmail(search);
            // Verify we found the email
            expect(verificationEmail).toBeDefined();

            // Extract the verification URL from the email body
            let urlMatch = app.smtp.extractPaths(verificationEmail);
            expect(urlMatch).toBeDefined();
            expect(urlMatch.length).toBeGreaterThan(1);

            const verificationPath = urlMatch[1];
            console.log('Verification path:', verificationPath);

            // Call the verification endpoint
            const response = await app.getHttpServer().get(verificationPath);

            // Verify the response - should redirect to UI login page
            expect(response.status).toBe(302);
            expect(response.headers.location).toBeDefined();
            expect(response.headers.location).toContain('/login');

            console.log('User verified successfully');
        });

        it('should authenticate the user', async () => {
            // Test login to get access token
            const authResponse = await tokenFixture.fetchAccessToken(
                testUserEmail,
                testUserPassword,
                clientId
            );

            expect(authResponse).toBeDefined();
            expect(authResponse.accessToken).toBeDefined();

            // Initialize usersClient with the access token
            usersClient = new UsersClient(app, authResponse.accessToken);
        });

        it('should get current user profile', async () => {
            // Test getMe endpoint
            const user = await usersClient.getMe();

            expect(user).toBeDefined();
            expect(user.email).toBe(testUserEmail);
            expect(user.name).toBe(testUserName);
        });
    });

    describe('User Profile Management', () => {
        it('should update user name', async () => {
            // Test updateMyName endpoint
            const updatedUser = await usersClient.updateMyName(updatedName);

            expect(updatedUser).toBeDefined();
            expect(updatedUser.name).toBe(updatedName);
        });

        it('should update user email', async () => {
            // Test updateMyEmail endpoint
            const response = await usersClient.updateMyEmail(updatedEmail);

            expect(response).toBeDefined();
            expect(response.status).toEqual(true);
        });

        it('verify new email for change', async () => {
            const search = {
                to: updatedEmail,
                subject: /.*Change.*email.*Auth.*Server.*/i,
            };
            const verificationEmail = await app.smtp.waitForEmail(search);
            // Verify we found the email
            expect(verificationEmail).toBeDefined();

            // Extract the verification URL from the email body
            let urlMatch = app.smtp.extractPaths(verificationEmail);
            expect(urlMatch).toBeDefined();
            expect(urlMatch.length).toBeGreaterThan(1);

            const verificationPath = urlMatch[1];
            console.log('Verification path:', verificationPath);

            // Call the verification endpoint
            const response = await app.getHttpServer().get(verificationPath);

            // Verify the response - should redirect to profile page with success flag
            expect(response.status).toBe(302);
            expect(response.headers.location).toBeDefined();
            expect(response.headers.location).toContain('/profile');
            expect(response.headers.location).toContain('emailChanged=true');

            console.log('User verified successfully');
        });

        it('should get login with new email', async () => {
            const authResponse = await tokenFixture.fetchAccessToken(
                updatedEmail,
                testUserPassword,
                clientId
            );

            expect(authResponse).toBeDefined();
            expect(authResponse.accessToken).toBeDefined();

            // Initialize usersClient with the access token
            usersClient = new UsersClient(app, authResponse.accessToken);
        });

        it('should update user password', async () => {
            // Test updateMyPassword endpoint
            const response = await usersClient.updateMyPassword(testUserPassword, updatedPassword);

            expect(response).toBeDefined();
            expect(response.status).toBe(true);

            // Re-authenticate with new password to verify it was changed
            const authResponse = await tokenFixture.fetchAccessToken(
                updatedEmail, // Use the updated email
                updatedPassword,
                clientId
            );

            expect(authResponse.accessToken).toBeDefined();

            // Update the client with the new token
            usersClient = new UsersClient(app, authResponse.accessToken);
        });

        it('should get user tenants', async () => {
            // Test getMyTenants endpoint
            try {
                const tenants = await usersClient.getMyTenants();
            } catch (e) {
                expect(e.status).toEqual(403);
                expect(e.body.message).toBe('Forbidden');
            }
        });
    });

    describe('User Search', () => {
        it('should find current user via profile endpoint', async () => {
            const user = await usersClient.getMe();

            expect(user).toBeDefined();
            expect(user.email).toBe(updatedEmail);
        });
    });

    describe('Account Deletion', () => {
        it('should delete the user account', async () => {
            // Test signdown endpoint
            const response = await usersClient.signdown(updatedPassword);

            expect(response).toBeDefined();
            expect(response.status).toBe(true);

            // Try to login with deleted account - should fail
            try {
                await tokenFixture.fetchAccessToken(
                    updatedEmail,
                    updatedPassword,
                    clientId
                );
                fail('Should not be able to login with deleted account');
            } catch (error) {
                expect(error).toBeDefined();
            }
        });
    });

});