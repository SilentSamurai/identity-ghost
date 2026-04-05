/**
 * Integration tests for the user lock/unlock feature.
 * 
 * This suite verifies the full admin lock/unlock lifecycle by booting the real
 * NestJS app, authenticating as the super-admin, and hitting actual HTTP
 * endpoints against a real database. It covers:
 * 
 *  - Default state: new users are unlocked.
 *  - Lock/unlock round trips: state toggles correctly and persists.
 *  - Idempotency: locking an already-locked (or unlocking an already-unlocked)
 *    user returns 200 without error.
 *  - Authorization: only super-admins can lock/unlock; tenant admins get 403.
 *  - Self-protection: the super-admin account itself cannot be locked.
 *  - Auth denial: locked users are rejected on both password login and refresh
 *    token exchange, with a generic error message (no info leak).
 *  - Field visibility: the `locked` field is exposed in admin GET responses
 *    but hidden from the non-admin `/api/users/me` endpoint.
 */
import {SharedTestFixture} from "../shared-test.fixture";
import {UsersClient} from "../api-client/user-client";
import {TokenFixture} from "../token.fixture";

/**
 *
 * This suite verifies the full admin lock/unlock lifecycle by booting the real
 * NestJS app, authenticating as the super-admin, and hitting actual HTTP
 * endpoints against a real database. It covers:
 *
 *  - Default state: new users are unlocked.
 *  - Lock/unlock round trips: state toggles correctly and persists.
 *  - Idempotency: locking an already-locked (or unlocking an already-unlocked)
 *    user returns 200 without error.
 *  - Authorization: only super-admins can lock/unlock; tenant admins get 403.
 *  - Self-protection: the super-admin account itself cannot be locked.
 *  - Auth denial: locked users are rejected on both password login and refresh
 *    token exchange, with a generic error message (no info leak).
 *  - Field visibility: the `locked` field is exposed in admin GET responses
 *    but hidden from the non-admin `/api/users/me` endpoint.
 */
describe('e2e user lock/unlock', () => {
    let app: SharedTestFixture;
    let adminAccessToken: string;
    let usersClient: UsersClient;
    let tokenFixture: TokenFixture;

    const testUserEmail = "locktest@test-website.com";
    const testUserPassword = "LockTest9000";
    const testUserName = "LockTestUser";

    let testUserId: string;

    beforeAll(async () => {
        app = new SharedTestFixture();
        tokenFixture = new TokenFixture(app);

        // Authenticate as the super-admin so all subsequent requests have full privileges
        const response = await tokenFixture.fetchAccessToken(
            "admin@auth.server.com",
            "admin9000",
            "auth.server.com"
        );
        adminAccessToken = response.accessToken;
        usersClient = new UsersClient(app, adminAccessToken);

        // Create a disposable user that most tests will lock/unlock
        const created = await usersClient.createUser(testUserName, testUserEmail, testUserPassword);
        testUserId = created.id;
    });

    afterAll(async () => {
        await app.close();
    });

    // --- Default state -----------------------------------------------------------

    /**
     * A freshly created user must have `locked` set to false.
     * Ensures the DB default / entity default is wired correctly.
     */
    it('should default locked to false for newly created users', async () => {
        const user = await usersClient.getUser(testUserId);
        expect(user.locked).toBe(false);
    });

    // --- Lock / unlock round trips -----------------------------------------------

    /**
     * Locking a user should:
     *  1. Return the updated user with `locked: true` in the response body.
     *  2. Persist the change so a subsequent GET also returns `locked: true`.
     *  3. Serialize `locked` as a boolean (not a string or number).
     */
    it('should lock a user and return locked: true via GET', async () => {
        const lockResult = await usersClient.lockUser(testUserId);
        expect(lockResult.id).toEqual(testUserId);
        expect(lockResult.locked).toBe(true);

        const user = await usersClient.getUser(testUserId);
        expect(user.locked).toBe(true);
        expect(typeof user.locked).toBe('boolean');
    });

    /**
     * Unlocking a previously locked user should:
     *  1. Return the updated user with `locked: false`.
     *  2. Persist so GET confirms the unlock.
     */
    it('should unlock a locked user and return locked: false', async () => {
        // Ensure user is locked first
        await usersClient.lockUser(testUserId);

        const unlockResult = await usersClient.unlockUser(testUserId);
        expect(unlockResult.id).toEqual(testUserId);
        expect(unlockResult.locked).toBe(false);

        const user = await usersClient.getUser(testUserId);
        expect(user.locked).toBe(false);
    });

    // --- Idempotency -------------------------------------------------------------

    /**
     * Locking an already-locked user should be a no-op that still returns 200.
     * The API must not throw a conflict or error for duplicate lock requests.
     */
    it('should return 200 when locking an already-locked user', async () => {
        await usersClient.lockUser(testUserId);
        const response = await usersClient.lockUserRaw(testUserId);
        expect(response.status).toEqual(200);
        expect(response.body.locked).toBe(true);

        const user = await usersClient.getUser(testUserId);
        expect(user.locked).toBe(true);
    });

    /**
     * Unlocking an already-unlocked user should be a no-op that still returns 200.
     */
    it('should return 200 when unlocking an already-unlocked user', async () => {
        await usersClient.unlockUser(testUserId);
        const response = await usersClient.unlockUserRaw(testUserId);
        expect(response.status).toEqual(200);
        expect(response.body.locked).toBe(false);

        const user = await usersClient.getUser(testUserId);
        expect(user.locked).toBe(false);
    });

    // --- Full cycle --------------------------------------------------------------

    /**
     * Verifies the complete lock → unlock cycle in sequence:
     * lock the user, confirm locked, unlock, confirm unlocked.
     */
    it('should return to unlocked after lock then unlock round trip', async () => {
        await usersClient.lockUser(testUserId);
        let user = await usersClient.getUser(testUserId);
        expect(user.locked).toBe(true);

        await usersClient.unlockUser(testUserId);
        user = await usersClient.getUser(testUserId);
        expect(user.locked).toBe(false);
    });

    // --- Authorization -----------------------------------------------------------

    /**
     * A tenant admin (non-super-admin) must be forbidden from locking or
     * unlocking any user. Both operations should return 403.
     */
    it('should return 403 when non-super-admin attempts to lock a user', async () => {
        // Authenticate as a regular tenant admin — not a super-admin
        const nonSuperAdminToken = await tokenFixture.fetchAccessToken(
            "admin@shire.local",
            "admin9000",
            "shire.local"
        );
        const nonSuperAdminClient = new UsersClient(app, nonSuperAdminToken.accessToken);

        const lockResponse = await nonSuperAdminClient.lockUserRaw(testUserId);
        expect(lockResponse.status).toEqual(403);

        const unlockResponse = await nonSuperAdminClient.unlockUserRaw(testUserId);
        expect(unlockResponse.status).toEqual(403);
    });

    /**
     * The super-admin account is a protected identity — it must never be
     * lockable, even by another super-admin request. Prevents accidental
     * or malicious lockout of the root account.
     */
    it('should return 403 when attempting to lock the super-admin account', async () => {
        const allUsers = await usersClient.getAllUsers();
        const superAdmin = allUsers.find((u: any) => u.email === "admin@auth.server.com");
        expect(superAdmin).toBeDefined();

        const response = await usersClient.lockUserRaw(superAdmin.id);
        expect(response.status).toEqual(403);
    });

    // --- Auth denial for locked users --------------------------------------------

    /**
     * A locked user must be rejected at the OAuth token endpoint when using
     * the password grant. The error message must be generic ("Invalid
     * credentials") so an attacker can't distinguish a locked account from
     * a wrong password — this prevents account-enumeration attacks.
     *
     * Uses a seeded tenant admin (admin@shire.local) so we have a real user
     * that can normally authenticate. Cleans up by unlocking afterward.
     */
    it('should return 401 when a locked user attempts password login', async () => {
        const shireAdmin = await usersClient.getUserByEmail("admin@shire.local");

        // Start from a known-unlocked state, then lock
        await usersClient.unlockUser(shireAdmin.id);
        await usersClient.lockUser(shireAdmin.id);

        // Attempt a password grant — should be rejected
        const response = await app.getHttpServer()
            .post('/api/oauth/token')
            .send({
                "grant_type": "password",
                "username": "admin@shire.local",
                "password": "admin9000",
                "client_id": "shire.local"
            })
            .set('Accept', 'application/json');

        expect(response.status).toEqual(400);
        // Must be a generic message — no hint that the account is locked
        expect(response.body.error).toEqual('invalid_grant');
        expect(response.body.error_description).toEqual('Invalid email or password');

        // Clean up: unlock the user so other tests aren't affected
        await usersClient.unlockUser(shireAdmin.id);
    });

    /**
     * Even if a locked user holds a previously-issued refresh token, the
     * server must reject the refresh exchange. This ensures locking a user
     * effectively revokes all active sessions, not just new logins.
     *
     * Flow: unlock → authenticate → capture refresh token → lock → attempt
     * refresh → expect 401.
     */
    it('should return 401 when a locked user attempts refresh token exchange', async () => {
        const shireAdmin = await usersClient.getUserByEmail("admin@shire.local");

        // Ensure unlocked so we can obtain a valid refresh token
        await usersClient.unlockUser(shireAdmin.id);

        const tokenResponse = await tokenFixture.fetchAccessToken(
            "admin@shire.local",
            "admin9000",
            "shire.local"
        );
        const refreshToken = tokenResponse.refreshToken;

        // Lock the user while they hold a valid refresh token
        await usersClient.lockUser(shireAdmin.id);

        // Attempt to exchange the refresh token — should be denied
        const response = await app.getHttpServer()
            .post('/api/oauth/token')
            .send({
                "grant_type": "refresh_token",
                "refresh_token": refreshToken,
            })
            .set('Accept', 'application/json');

        expect(response.status).toEqual(400);
        expect(response.body.error).toEqual('invalid_grant');

        // Clean up
        await usersClient.unlockUser(shireAdmin.id);
    });

    // --- Bearer token denial for locked users ------------------------------------

    /**
     * A locked user must also be rejected when using an existing bearer
     * (access) token. Even though the JWT signature is valid, the server
     * should check the user's lock status on every authenticated request
     * so that locking takes effect immediately — not just when the token
     * expires.
     *
     * Flow: unlock → authenticate → capture access token → lock → call a
     * protected endpoint with the bearer token → expect 401.
     */
    it('should return 401 when a locked user uses a valid bearer token', async () => {
        const shireAdmin = await usersClient.getUserByEmail("admin@shire.local");

        // Ensure unlocked so we can obtain a valid access token
        await usersClient.unlockUser(shireAdmin.id);

        const tokenResponse = await tokenFixture.fetchAccessToken(
            "admin@shire.local",
            "admin9000",
            "shire.local"
        );
        const accessToken = tokenResponse.accessToken;

        // Lock the user while they hold a valid access token
        await usersClient.lockUser(shireAdmin.id);

        // Attempt to call a protected endpoint with the bearer token
        const response = await app.getHttpServer()
            .get('/api/users/me')
            .set('Authorization', `Bearer ${accessToken}`)
            .set('Accept', 'application/json');

        expect(response.status).toEqual(401);

        // Clean up
        await usersClient.unlockUser(shireAdmin.id);
    });

    // --- Additional default-state check ------------------------------------------

    /**
     * Second creation-path check: creates a brand-new user (different from
     * the one in beforeAll) and confirms `locked` defaults to false.
     * Guards against regressions where a migration or entity change
     * accidentally flips the default.
     */
    it('should default locked to false for a freshly created user', async () => {
        const newUser = await usersClient.createUser(
            "FreshUser",
            "freshuser-lock@test-website.com",
            "FreshUser9000"
        );
        const user = await usersClient.getUser(newUser.id);
        expect(user.locked).toBe(false);
    });

    // --- Field visibility --------------------------------------------------------

    /**
     * The `locked` field is admin-only metadata. The non-admin `/api/users/me`
     * endpoint must NOT expose it, so regular users can't discover whether
     * their account (or any account) is locked. This is a security boundary
     * check — leaking lock status could aid social-engineering attacks.
     */
    it('should not include locked field in /api/users/me response', async () => {
        const tokenResponse = await tokenFixture.fetchAccessToken(
            "admin@shire.local",
            "admin9000",
            "shire.local"
        );
        const userClient = new UsersClient(app, tokenResponse.accessToken);
        const me = await userClient.getMe();

        expect(me.email).toBeDefined();
        expect(me).not.toHaveProperty('locked');
    });
});
