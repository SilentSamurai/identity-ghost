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
    const SINGLE_TENANT_USER = {
        email: "single-tenant-user@test.com",
        password: "TestPassword123!"
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
        name: "Test App",
        url: "http://localhost:3000",
        description: "Test application for ambiguous tenant flow"
    };

    // Setup: log in to Mordor, create a test app, and publish it
    it('should setup Mordor tenant', () => {
        cy.login(`admin@${TENANTS.mordor.domain}`, "admin9000", TENANTS.mordor.domain);
        cy.userOpenTenantOverview();
        cy.addAppFromOverview(TEST_APP.name, TEST_APP.url, TEST_APP.description);
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

    // Core test: login as ambiguous user via /authorize, verify tenant selection page appears,
    // pick Gondor, and confirm the OAuth flow completes with an auth code redirect
    it('should handle ambiguous tenant selection flow', () => {
        cy.visit(`/authorize?client_id=${TENANTS.mordor.domain}&code_challenge=test&redirect_uri=https://example.com`);

        // 1. Login with ambiguous user — /login now returns requires_tenant_selection
        cy.intercept('POST', '**/api/oauth/login*').as('login');

        cy.get('#username').type(AMBIGUOUS_USER.email)
        cy.get('#password').type(AMBIGUOUS_USER.password)

        cy.get('#login-btn').click();

        cy.wait('@login').should(({response}) => {
            expect(response, 'response').to.exist;
            expect(response!.statusCode).to.be.oneOf([201, 200]);
            expect(response!.body.requires_tenant_selection).to.be.true;
            expect(response!.body.tenants).to.be.an('array');
            expect(response!.body.tenants.length).to.equal(2);
        });

        // 2. Verify tenant selection page
        cy.url().should('include', '/tenant-selection');

        // 3. Intercept the second /login call (with hint) when user picks a tenant
        cy.intercept('POST', '**/api/oauth/login*').as('loginWithHint');

        // 4. Select tenant and complete flow
        cy.get('button').contains(TENANTS.gondor.domain).click();

        // 5. Verify the login-with-hint call returns an auth code
        cy.wait('@loginWithHint').should(({request, response}) => {
            expect(response, 'response').to.exist;
            expect(response!.statusCode).to.be.oneOf([201, 200]);
            expect(response!.body).to.have.property('authentication_code');
            expect(request.body).to.have.property('subscriber_tenant_hint', TENANTS.gondor.domain);
        });

        // 6. Verify successful completion
        cy.url().should('include', 'https://example.com/');
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
