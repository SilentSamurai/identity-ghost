/**
 * User Login Page Tests
 *
 * Tests the /login page two-step flow: first the user enters a client_id,
 * then username/password fields appear. Also verifies that providing
 * client_id via query param skips step 1, and that a valid login
 * redirects to /home.
 */
describe('Login', () => {
    beforeEach(() => {
        cy.visit('/login');
    });

    // Verifies the two-step login form: client_id input is shown first,
    // username/password fields only appear after clicking Continue
    it('Should show client_id step first, then reveal username/password after Continue', () => {
        // Step 1: client_id input visible, username/password not visible
        cy.get('input#client_id').should('be.visible');
        cy.get('input#username').should('not.exist');
        cy.get('input#password').should('not.exist');

        // Enter client_id and continue
        cy.get('input#client_id').type('public');
        cy.get('#continue-btn').should('be.visible').click();

        // Step 2: username and password visible
        cy.get('input#username').should('be.visible');
        cy.get('input#password').should('be.visible');
    });

    // When client_id is provided as a query parameter, step 1 is skipped
    // and username/password fields are shown immediately
    it('Should show username/password directly when client_id is provided via query', () => {
        cy.visit('/login?client_id=public');

        // Client ID input should be hidden in step 2
        cy.get('input#client_id').should('not.exist');

        // Username/password should be visible
        cy.get('input#username').should('be.visible');
        cy.get('input#password').should('be.visible');
    });

    // Logs in with valid credentials (client_id via query) and verifies redirect to /home
    it('Should login successfully', () => {
        cy.visit(`/login?client_id=${Cypress.env('shireTenantAdminClientId')}`);

        cy.intercept('POST', '**/api/oauth/token*').as('oauthToken');

        cy.get('#username').type(Cypress.env('shireTenantAdminEmail'));
        cy.get('#password').type(Cypress.env('shireTenantAdminPassword'));
        cy.get('#login-btn').click();

        cy.wait('@oauthToken').its('response.statusCode').should('be.oneOf', [200, 201]);

        cy.url().should('include', '/home');
    });
});
