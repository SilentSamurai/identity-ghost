import type { Interception } from 'cypress/types/net-stubbing';

/**
 * Apps & Subscription Flow Tests
 *
 * End-to-end test for the full app lifecycle between two tenants:
 * Tenant A creates and publishes an app, Tenant B subscribes to it,
 * opens it, and authenticates via OAuth. Then both sides clean up.
 * Verifies cross-tenant app visibility, subscription, and OAuth token exchange.
 */
describe('Apps & Subscription Flow', () => {
    const TENANT_A_ADMIN = Cypress.env('shireTenantAdminEmail');
    const TENANT_A_DOMAIN = Cypress.env('shireTenantAdminClientId');
    const TENANT_B_ADMIN = 'admin@bree.local';
    const TENANT_B_DOMAIN = 'bree.local';
    const APP_NAME = 'Subscription Test App';
    const APP_URL = 'http://localhost:3000';
    const APP_DESC = 'A test app for subscription E2E';


    // Tenant A creates a new app from the tenant overview page
    it('Tenant A should add an app', () => {
        cy.login(TENANT_A_ADMIN, Cypress.env('shireTenantAdminPassword'), TENANT_A_DOMAIN);
        cy.userOpenTenantOverview();
        cy.addAppFromOverview(APP_NAME, APP_URL, APP_DESC);
    });

    // Tenant B opens the subscription dialog and verifies the unpublished app is not listed
    it('Tenant B should NOT see the app before it is published', () => {
        cy.login(TENANT_B_ADMIN, 'admin9000', TENANT_B_DOMAIN);
        cy.userOpenTenantOverview();
        cy.contains('button', 'Subscriptions').click();

        cy.get('button').contains('Subscribe App').click();
        cy.get('table').should('not.contain', APP_NAME);
        cy.get('button').contains('Cancel').click();
    });

    // Tenant A publishes the app and verifies it shows as "Public" in the table
    it('Tenant A should publish the app', () => {
        cy.login(TENANT_A_ADMIN, Cypress.env('shireTenantAdminPassword'), TENANT_A_DOMAIN);
        cy.userPublishApp(APP_NAME);
        cy.get('table').contains('tr', APP_NAME).should('contain', 'Public');
    });

    // Tenant B subscribes to the now-published app and opens it
    it('Tenant B should be able to subscribe and Open App', () => {
        cy.login(TENANT_B_ADMIN, 'admin9000', TENANT_B_DOMAIN);
        cy.userOpenTenantOverview();
        cy.subscribeAppFromOverview(APP_NAME);
        cy.userOpenSubscribedApp(APP_NAME);
    });

    // Tenant B user navigates to the external app, triggers OAuth /authorize flow,
    // logs in, and verifies the token contains the correct user and tenant claims
    it("Tenant B user should be able to login to Tenant A's app", () => {
        const TENANT_B_USER = 'admin@bree.local';
        const TENANT_B_USER_PASSWORD = 'admin9000';

        cy.login(TENANT_B_ADMIN, 'admin9000', TENANT_B_DOMAIN);
        cy.userOpenTenantOverview();

        cy.visit(APP_URL);

        cy.get('button').contains('Login').click();

        cy.url().should('include', '/authorize');
        cy.get('#username').type(TENANT_B_USER);
        cy.get('#password').type(TENANT_B_USER_PASSWORD);

        cy.intercept('POST', '**/api/oauth/token*').as('authToken');
        cy.get('#login-btn').click();

        cy.wait('@authToken').should((interception: Interception) => {
            const {response} = interception;
            expect(response?.statusCode).to.be.oneOf([201, 200]);
        });

        cy.url().should('include', '?code');
        cy.get('#decodedToken').should('contain', TENANT_B_USER);
        cy.get('#decodedToken').should('contain', TENANT_B_DOMAIN);
    });

    // Cleanup: Tenant B unsubscribes from the app
    it('Tenant B unsubscribe', () => {
        cy.login(TENANT_B_ADMIN, 'admin9000', TENANT_B_DOMAIN);
        cy.userOpenTenantOverview();
        cy.unsubscribeFromApp(APP_NAME);
    });

    // Cleanup: Tenant A deletes the app
    it('Tenant A should delete an app', () => {
        cy.login(TENANT_A_ADMIN, Cypress.env('shireTenantAdminPassword'), TENANT_A_DOMAIN);
        cy.userOpenTenantOverview();
        cy.deleteAppFromOverview(APP_NAME);
    });


});