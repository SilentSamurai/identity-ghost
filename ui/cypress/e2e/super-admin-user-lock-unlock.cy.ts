/**
 * Admin User Lock/Unlock — Cypress Integration Tests
 *
 * These tests exercise the user lock/unlock feature end-to-end from the
 * super-admin UI. The admin section is protected by SuperAdminGuard, so
 * all tests run as the super-admin (admin@auth.server.com).
 *
 * A disposable test user is created in the `before` hook for the UI-level
 * tests (status display, lock/unlock toggling, dialog dismiss). This user
 * is NOT a member of any tenant, so it cannot be used for login tests.
 *
 * The final login-denial test uses a seeded tenant admin (admin@shire.local)
 * who is already a member of the shire.local tenant, allowing us to verify
 * the full flow: lock → login rejected (401) → unlock → login succeeds.
 *
 * Test coverage:
 *  1. New users default to "Unlocked" status with a "Lock" button visible.
 *  2. Locking a user: PUT /users/:id/lock returns 200, UI shows "Locked".
 *  3. Unlocking a user: PUT /users/:id/unlock returns 200, UI shows "Unlocked".
 *     (Depends on test 2 leaving the user locked.)
 *  4. Dismissing the confirmation dialog does not change lock status.
 *  5. Super-admin self-lock protection: backend returns 403, status stays "Unlocked".
 *  6. Login denial round trip: locked user gets 401 on POST /api/oauth/login,
 *     unlocked user completes the full auth flow (login → token exchange → /home).
 */
describe('Admin User Lock/Unlock', () => {

    const uniqueSuffix = Date.now();
    const TEST_USER_NAME = 'LockTestCypress';
    const TEST_USER_EMAIL = `lock-cypress-${uniqueSuffix}@auth.server.com`;
    const TEST_USER_PASSWORD = 'LockTest9000';
    const SUPER_ADMIN_EMAIL = Cypress.env('superAdminEmail');
    const SUPER_ADMIN_PASSWORD = Cypress.env('superAdminPassword');

    /**
     * Helper: navigate to a user's detail page (UR02) via the value help.
     *
     * Opens the UR02 page, triggers the email value-help dialog, filters
     * by the given email, selects the matching row, and confirms. After
     * this, the browser should be on /admin/UR02/:userId showing the
     * user's detail page with Lock Status, Lock/Unlock button, etc.
     */
    function navigateToUserDetail(email: string) {
        cy.goToAdminPage('UR02');
        cy.get('#Email-vh-btn').click();
        cy.get('#FILTER_FIELD_email').type(email);
        cy.contains('button', 'Go').click();
        cy.contains('td', email).click();
        cy.contains('button', 'Select').click();
        cy.contains('button', 'Continue').click();
        cy.url().should('include', '/admin/UR02/');
    }

    /**
     * One-time setup: log in as super-admin and create a disposable test user
     * via the admin user list page (UR01). This user is used by tests 1–4
     * for lock/unlock UI checks. It is NOT added to any tenant, so it
     * cannot be used for login-flow tests.
     */
    before(() => {
        cy.adminLogin(SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD);
        cy.goToAdminPage('UR01');
        cy.get('#CREATE_USER_DIALOG_BTN').click();

        cy.get('#CREATE_USER_name_INPUT').type(TEST_USER_NAME);
        cy.get('#CREATE_USER_email_INPUT').type(TEST_USER_EMAIL);
        cy.get('#CREATE_USER_password_INPUT').type(TEST_USER_PASSWORD);
        cy.get('#CREATE_USER_confirmPassword_INPUT').type(TEST_USER_PASSWORD);

        cy.intercept('POST', '**/users/create*').as('createUser');
        cy.get('#CREATE_USER_SUBMIT_BTN').click();
        cy.wait('@createUser').should(({ response }) => {
            expect(response!.statusCode).to.be.oneOf([200, 201]);
        });
    });

    /**
     * Before each test: log in as super-admin so we start on the admin
     * dashboard with a fresh session. adminLogin clears cookies,
     * localStorage, and sessionStorage to avoid stale auth-code redirects.
     */
    beforeEach(() => {
        cy.adminLogin(SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD);
    });

    /**
     * Verify that a freshly created user shows "Unlocked" in the Lock Status
     * attribute and that the "Lock" button is present (not "Unlock").
     * This confirms the DB default (locked = false) is reflected in the UI.
     */
    it('should display "Unlocked" for a new user', () => {
        navigateToUserDetail(TEST_USER_EMAIL);

        cy.contains('app-attribute', 'Lock Status')
            .should('contain.text', 'Unlocked');
        cy.contains('button', 'Lock').should('exist');
    });

    /**
     * Lock the test user via the admin detail page:
     *  1. Click "Lock" → confirmation dialog appears showing the user's email.
     *  2. Confirm → PUT /users/:id/lock fires, expect 200 with locked: true.
     *  3. UI updates: Lock Status shows "Locked", button label flips to "Unlock".
     *
     * NOTE: This test intentionally leaves the user locked so the next test
     * ("should unlock a locked user") can pick up from that state.
     */
    it('should lock a user after confirming the dialog', () => {
        navigateToUserDetail(TEST_USER_EMAIL);

        cy.intercept('PUT', '**/users/*/lock').as('lockUser');
        cy.contains('button', 'Lock').click();

        // Confirmation dialog should display the user's email
        cy.contains(TEST_USER_EMAIL).should('be.visible');
        cy.get('#CONFIRMATION_YES_BTN').click();

        cy.wait('@lockUser').should(({ response }) => {
            expect(response!.statusCode).to.equal(200);
            expect(response!.body.locked).to.equal(true);
        });

        cy.contains('app-attribute', 'Lock Status')
            .should('contain.text', 'Locked');
        cy.contains('button', 'Unlock').should('exist');
    });

    /**
     * Unlock a previously locked user via the admin detail page:
     *  1. Navigate to the user — status should already be "Locked" (from previous test).
     *  2. Click "Unlock" → confirmation dialog appears.
     *  3. Confirm → PUT /users/:id/unlock fires, expect 200 with locked: false.
     *  4. UI updates: Lock Status shows "Unlocked", button label flips to "Lock".
     *
     * Depends on the previous test leaving the user in a locked state.
     */
    it('should unlock a locked user after confirming the dialog', () => {
        navigateToUserDetail(TEST_USER_EMAIL);

        // Precondition: user should still be locked from the previous test
        cy.contains('app-attribute', 'Lock Status')
            .should('contain.text', 'Locked');

        cy.intercept('PUT', '**/users/*/unlock').as('unlockUser');
        cy.contains('button', 'Unlock').click();

        cy.contains(TEST_USER_EMAIL).should('be.visible');
        cy.get('#CONFIRMATION_YES_BTN').click();

        cy.wait('@unlockUser').should(({ response }) => {
            expect(response!.statusCode).to.equal(200);
            expect(response!.body.locked).to.equal(false);
        });

        cy.contains('app-attribute', 'Lock Status')
            .should('contain.text', 'Unlocked');
        cy.contains('button', 'Lock').should('exist');
    });

    /**
     * Verify that dismissing the confirmation dialog is a no-op:
     *  1. Navigate to the user — status should be "Unlocked" (from previous test).
     *  2. Click "Lock" → confirmation dialog appears.
     *  3. Click "No" to dismiss the dialog.
     *  4. Lock Status should still show "Unlocked" and the "Lock" button
     *     should still be present (no API call was made).
     */
    it('should not change lock status when dialog is dismissed', () => {
        navigateToUserDetail(TEST_USER_EMAIL);

        cy.contains('app-attribute', 'Lock Status')
            .should('contain.text', 'Unlocked');

        cy.contains('button', 'Lock').click();
        cy.get('#CONFIRMATION_NO_BTN').click();

        cy.contains('app-attribute', 'Lock Status')
            .should('contain.text', 'Unlocked');
        cy.contains('button', 'Lock').should('exist');
    });

    /**
     * The super-admin account (admin@auth.server.com) must never be lockable,
     * even by itself. This prevents accidental lockout of the root account.
     *
     *  1. Navigate to the super-admin's own detail page.
     *  2. Click "Lock" and confirm the dialog.
     *  3. Backend rejects with 403 ("Cannot lock the super-admin account").
     *  4. Lock Status remains "Unlocked" — the UI's catch block shows an
     *     error toast but does not change the displayed state.
     */
    it('should show an error when attempting to lock the super-admin account', () => {
        navigateToUserDetail(SUPER_ADMIN_EMAIL);

        cy.intercept('PUT', '**/users/*/lock').as('lockSuperAdmin');
        cy.contains('button', 'Lock').click();
        cy.get('#CONFIRMATION_YES_BTN').click();

        cy.wait('@lockSuperAdmin').should(({ response }) => {
            expect(response!.statusCode).to.equal(403);
        });

        cy.contains('app-attribute', 'Lock Status')
            .should('contain.text', 'Unlocked');
    });

    /**
     * Full end-to-end login denial and recovery flow.
     *
     * Uses a seeded tenant admin (admin@shire.local) instead of the
     * dynamically created test user, because the test user was created via
     * the admin API and is not a member of any tenant — it can never
     * authenticate against a client_id. The seeded user is already a member
     * of the shire.local tenant.
     *
     * Flow:
     *  Step 1 — Lock the seeded user from the admin UI.
     *  Step 2 — Clear the browser session (cookies, localStorage,
     *           sessionStorage) and attempt to log in as the locked user
     *           on the shire.local login page. The POST /api/oauth/login
     *           should return 401 ("Invalid credentials") and the browser
     *           should stay on the login page (not reach /home).
     *  Step 3 — Log back in as super-admin and unlock the seeded user.
     *  Step 4 — Clear the session again and log in as the now-unlocked user.
     *           This time the two-step auth flow should complete:
     *             a) POST /api/oauth/login → 200/201 (returns auth code)
     *             b) POST /api/oauth/token → 200/201 (exchanges code for JWT)
     *           The browser should land on /home.
     */
    it('should prevent a locked user from logging in, and allow login after unlock', () => {
        const SEEDED_USER_EMAIL = Cypress.env('shireTenantAdminEmail');
        const SEEDED_USER_PASSWORD = Cypress.env('shireTenantAdminPassword');
        const SEEDED_USER_TENANT = Cypress.env('shireTenantAdminClientId');

        // --- Step 1: Lock the seeded user from the admin detail page ---
        navigateToUserDetail(SEEDED_USER_EMAIL);
        cy.intercept('PUT', '**/users/*/lock').as('lockSeeded');
        cy.contains('button', 'Lock').click();
        cy.get('#CONFIRMATION_YES_BTN').click();
        cy.wait('@lockSeeded').should(({ response }) => {
            expect(response!.statusCode).to.equal(200);
            expect(response!.body.locked).to.equal(true);
        });
        cy.contains('app-attribute', 'Lock Status')
            .should('contain.text', 'Locked');

        // --- Step 2: Attempt login as the locked user ---
        // Clear all storage so the login page doesn't auto-redirect from
        // a stale auth code in sessionStorage.
        cy.clearCookies();
        cy.clearLocalStorage();
        cy.window().then((win) => win.sessionStorage.clear());

        cy.visit(`/login?client_id=${SEEDED_USER_TENANT}`);
        cy.get('#username').should('be.visible').type(SEEDED_USER_EMAIL);
        cy.get('#password').should('be.visible').type(SEEDED_USER_PASSWORD);

        cy.intercept('POST', '**/api/oauth/login*').as('lockedLogin');
        cy.get('#login-btn').click();

        // Backend validates credentials then checks user.locked → 401
        cy.wait('@lockedLogin').should(({ response }) => {
            expect(response!.statusCode).to.equal(401);
        });

        // Should stay on the login page, not redirect to /home
        cy.url().should('not.include', '/home');

        // --- Step 3: Unlock the seeded user ---
        cy.adminLogin(SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD);
        navigateToUserDetail(SEEDED_USER_EMAIL);
        cy.intercept('PUT', '**/users/*/unlock').as('unlockSeeded');
        cy.contains('button', 'Unlock').click();
        cy.get('#CONFIRMATION_YES_BTN').click();
        cy.wait('@unlockSeeded').should(({ response }) => {
            expect(response!.statusCode).to.equal(200);
            expect(response!.body.locked).to.equal(false);
        });
        cy.contains('app-attribute', 'Lock Status')
            .should('contain.text', 'Unlocked');

        // --- Step 4: Login should now succeed ---
        cy.clearCookies();
        cy.clearLocalStorage();
        cy.window().then((win) => win.sessionStorage.clear());

        cy.visit(`/login?client_id=${SEEDED_USER_TENANT}`);
        cy.get('#username').should('be.visible').type(SEEDED_USER_EMAIL);
        cy.get('#password').should('be.visible').type(SEEDED_USER_PASSWORD);

        cy.intercept('POST', '**/api/oauth/login*').as('unlockedLogin');
        cy.intercept('POST', '**/api/oauth/token*').as('unlockedToken');
        cy.get('#login-btn').click();

        // First leg: POST /api/oauth/login returns an auth code
        cy.wait('@unlockedLogin').should(({ response }) => {
            expect(response!.statusCode).to.be.oneOf([200, 201]);
        });

        // Second leg: auth code exchanged for a JWT at POST /api/oauth/token
        cy.wait('@unlockedToken').should(({ response }) => {
            expect(response!.statusCode).to.be.oneOf([200, 201]);
        });

        // User lands on the home page — login succeeded
        cy.url().should('include', '/home');
    });
});
