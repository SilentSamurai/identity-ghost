/**
 * Ambiguous Tenant Flow Tests
 *
 * When a user belongs to multiple tenants and logs in via an external app's
 * /authorize endpoint, the server returns requires_tenant_selection=true.
 * The UI should redirect to /tenant-selection where the user picks a tenant,
 * then complete the OAuth flow with an authentication_code.
 *
 * Setup: creates a test app on Mordor, subscribes Gondor and Rohan to it,
 * and adds the ambiguous user to both Gondor and Rohan.
 * Cleanup: unsubscribes and removes the test app afterward.
 */
describe('Ambiguous Tenant Flow', () => {
    const AMBIGUOUS_USER = {
        email: "gandalf@mail.com",
        password: "gandalf9000"
    };
    const TENANTS = {
        mordor: {
            name: "Mordor Tenant",
            domain: "mordor.local"
        },
        gondor: {
            name: "Gondor Tenant",
            domain: "gondor.local"
        },
        rohan: {
            name: "Rohan Tenant",
            domain: "rohan.local"
        }
    };
    const TEST_APP = {
        name: "Ambiguous Tenant Test App",
        url: "http://localhost:3000/ambiguous-tenant-app.html",
        description: "Test application for ambiguous tenant flow"
    };

    // Setup: log in to Mordor, create a test app, and publish it
    it('should setup Mordor tenant', () => {
        cy.login(`admin@${TENANTS.mordor.domain}`, "admin9000", TENANTS.mordor.domain);
        cy.userOpenTenantOverview();
        cy.addAppFromOverview(TEST_APP.name, TEST_APP.url, TEST_APP.description, { onboardingEnabled: false });
        cy.userPublishApp(TEST_APP.name);
        cy.logout();
    });

    // Setup: log in to Gondor, subscribe to the test app, add the ambiguous user as a member
    it('should setup Gondor tenant', () => {
        cy.login(`admin@${TENANTS.gondor.domain}`, "admin9000", TENANTS.gondor.domain);
        cy.userOpenTenantOverview();
        cy.subscribeAppFromOverview(TEST_APP.name);
        cy.userAddMemberToTenant(AMBIGUOUS_USER.email);
        cy.logout();
    });

    // Setup: log in to Rohan, subscribe to the test app, add the ambiguous user as a member
    it('should setup Rohan tenant', () => {
        cy.login(`admin@${TENANTS.rohan.domain}`, "admin9000", TENANTS.rohan.domain);
        cy.userOpenTenantOverview();
        cy.subscribeAppFromOverview(TEST_APP.name);
        cy.userAddMemberToTenant(AMBIGUOUS_USER.email);
        cy.logout();
    });

    // Core test: navigate to the external app, click Login to trigger OAuth flow,
    // verify tenant selection page appears, pick Gondor, and confirm the flow completes
    it('should handle ambiguous tenant selection flow', () => {
        // Navigate to the external app page (simulates a real user opening the app)
        cy.visit("/login");
        cy.visit(TEST_APP.url);

        // 1. Click Login — the app initiates the OAuth flow with PKCE via OIDC discovery
        cy.get('#login-btn').contains('Login').click();

        // The authorize endpoint detects no session and redirects to /authorize (login UI)
        cy.url().should('include', '/authorize');

        // 2. Login with ambiguous user — /login returns requires_tenant_selection
        cy.intercept('POST', '**/api/oauth/login*').as('login');

        cy.get('#username').type(AMBIGUOUS_USER.email);
        cy.get('#password').type(AMBIGUOUS_USER.password);

        cy.get('#login-btn').click();

        cy.wait('@login').should(({response}) => {
            expect(response, 'response').to.exist;
            expect(response!.statusCode).to.be.oneOf([201, 200]);
            expect(response!.body.requires_tenant_selection).to.be.true;
            expect(response!.body.tenants).to.be.an('array');
            expect(response!.body.tenants.length).to.equal(2);
        });

        // 3. Verify tenant selection page
        cy.get('app-authorize[data-view="tenant-selection"]').should('exist');

        // 4. Intercept the second /login call (with hint) when user picks a tenant
        cy.intercept('POST', '**/api/oauth/login*').as('loginWithHint');

        // 5. Select Gondor tenant
        cy.get('button').contains(TENANTS.gondor.domain).click();

        // 6. Verify the login-with-hint call returns success (session created)
        cy.wait('@loginWithHint').should(({request, response}) => {
            expect(response, 'response').to.exist;
            expect(response!.statusCode).to.be.oneOf([201, 200]);
            expect(response!.body).to.have.property('success', true);
            expect(request.body).to.have.property('subscriber_tenant_hint', TENANTS.gondor.domain);
        });

        // 7. Consent — user must grant access before confirming the session
        cy.get('app-authorize[data-view="consent"]').should('exist');
        cy.get('button').contains('Approve').click();

        // 8. Session-confirm — backend asks user to confirm the active session
        cy.get('app-authorize[data-view="session-confirm"]').should('exist');
        cy.get('button').contains('Continue').click();

        // 9. Verify successful completion — redirected back to the app with auth code
        cy.url().should('include', 'ambiguous-tenant-app.html');
        cy.url().should('include', 'code=');
        cy.url().should('include', 'state=');
    });

    // Cleanup: unsubscribe Gondor from the test app
    it('should cleanup Gondor tenant', () => {
        cy.login(`admin@${TENANTS.gondor.domain}`, "admin9000", TENANTS.gondor.domain);
        cy.userOpenTenantOverview();
        cy.unsubscribeFromApp(TEST_APP.name);
        cy.logout();
    });

    // Cleanup: unsubscribe Rohan from the test app
    it('should cleanup Rohan tenant', () => {
        cy.login(`admin@${TENANTS.rohan.domain}`, "admin9000", TENANTS.rohan.domain);
        cy.userOpenTenantOverview();
        cy.unsubscribeFromApp(TEST_APP.name);
        cy.logout();
    });

    // Cleanup: delete the test app from Mordor
    it('should cleanup test app', () => {
        cy.login(`admin@${TENANTS.mordor.domain}`, "admin9000", TENANTS.mordor.domain);
        cy.userOpenTenantOverview();
        cy.deleteAppFromOverview(TEST_APP.name);
        cy.logout();
    });
});
