/**
 * Tests the self-service tenant creation and user registration flow.
 *
 * A new user registers with a new tenant (org), receives a verification email,
 * clicks the link to verify, then authenticates against their own tenant. Covers:
 *   - Registration creates both user and tenant
 *   - Email verification via SMTP link extraction
 *   - User cannot log in to a different tenant they don't belong to
 *   - Authenticated user can read their profile and tenant details (including members)
 *   - Account deletion prevents further login
 */
import {v4 as uuidv4} from 'uuid';
import {SharedTestFixture} from "../shared-test.fixture";
import {UsersClient} from "../api-client/user-client";
import {TokenFixture} from "../token.fixture";
import {TenantClient} from "../api-client/tenant-client";
import {SearchClient} from "../api-client/search-client";


describe('UsersController (e2e)', () => {
    let app: SharedTestFixture;
    let usersClient: UsersClient;
    let tenantClient: TenantClient;
    let searchClient: SearchClient;
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
    // const clientId = "shire.local";
    const tenantName = "TestTenant";
    const tenantDomain = "tt.com"

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
        console.log("Closing Test Finish");
    });


    describe('Tenant Creation & User Registration & Authentication Flow ', () => {
        it('should register a new user', async () => {
            // Test signup endpoint
            const signupResponse = await usersClient.registerTenant(testUserName, testUserEmail, testUserPassword, tenantName, tenantDomain);

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

        it('should not login from any other tenant', async () => {
            // Test login to get access token
            try {
                const authResponse = await tokenFixture.fetchAccessToken(
                    testUserEmail,
                    testUserPassword,
                    "auth.server.com"
                );
            } catch (e) {
                expect(e.status).toBeDefined();
                expect(e.status).toBe(400);
            }
        });

        it('should authenticate the user', async () => {
            // Test login to get access token
            const authResponse = await tokenFixture.fetchAccessToken(
                testUserEmail,
                testUserPassword,
                tenantDomain
            );

            expect(authResponse).toBeDefined();
            expect(authResponse.accessToken).toBeDefined();

            // Initialize usersClient with the access token
            usersClient = new UsersClient(app, authResponse.accessToken);
            tenantClient = new TenantClient(app, authResponse.accessToken);
            searchClient = new SearchClient(app, authResponse.accessToken);
        });

        it('should get current user profile', async () => {
            // Test getMe endpoint
            const user = await usersClient.getMe();

            expect(user).toBeDefined();
            expect(user.email).toBe(testUserEmail);
            expect(user.name).toBe(testUserName);
        });

        it('check tenant is created', async () => {
            let tenantDetails = await tenantClient.getTenantDetails(null);
            console.log("Get Tenant Details Response:", tenantDetails);
            expect(tenantDetails.name).toEqual(tenantName);
            expect(tenantDetails.domain).toEqual(tenantDomain);
            expect(tenantDetails.clientId).toBeDefined();

            // verify member
            expect(Array.isArray(tenantDetails.members)).toBe(true);
            expect(tenantDetails.members.length).toBeGreaterThanOrEqual(1);
            expect(tenantDetails.members[0].email).toEqual(testUserEmail);
            expect(tenantDetails.members[0].name).toEqual(testUserName);

        });
    });

    describe('Account Deletion', () => {
        it('should delete the user account', async () => {
            // Test signdown endpoint
            const response = await usersClient.signdown(testUserPassword);

            expect(response).toBeDefined();
            expect(response.status).toBe(true);

            // Try to login with deleted account - should fail
            try {
                await tokenFixture.fetchAccessToken(
                    updatedEmail,
                    testUserPassword,
                    tenantDomain
                );
                fail('Should not be able to login with deleted account');
            } catch (error) {
                expect(error).toBeDefined();
            }
        });

    });

});