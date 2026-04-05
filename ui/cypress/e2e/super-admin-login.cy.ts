/**
 * Admin Access Tests
 *
 * Tests that super-admin users can access /admin after logging in
 * through the regular /login page, and that unauthorized users
 * are rejected with 403.
 */
describe('Super Admin — Admin Access', () => {

    // Logs in with the super-admin and verifies access to /admin
    it('Super Admin can access admin panel', () => {
        cy.visit(`/login?client_id=${Cypress.env('superAdminClientId')}`);

        cy.get('#username').type(Cypress.env('superAdminEmail'));
        cy.get('#password').type(Cypress.env('superAdminPassword'));

        cy.intercept('POST', '**/api/oauth/token*').as('authCode');

        cy.get('#login-btn').click();

        cy.wait('@authCode').should(({response}) => {
            expect(response).to.exist;
            expect(response!.statusCode).to.be.oneOf([201, 200]);
        });

        cy.url().should('include', '/home');

        cy.visit('/admin');
        cy.url().should('include', '/admin');
    });

    // Logs in with a non-admin user and verifies /admin redirects to error
    it('Non-admin user cannot access admin panel', () => {
        cy.visit(`/login?client_id=${Cypress.env('superAdminClientId')}`);

        cy.get('#username').type(Cypress.env('adminTenantUserEmail'));
        cy.get('#password').type(Cypress.env('adminTenantUserPassword'));

        cy.intercept('POST', '**/api/oauth/login*').as('login');

        cy.get('#login-btn').click();

        cy.wait('@login').should(({response}) => {
            expect(response).to.exist;
            // User not in auth.server.com tenant — expect 403
            expect(response!.statusCode).to.be.oneOf([403]);
        });
    });
});
