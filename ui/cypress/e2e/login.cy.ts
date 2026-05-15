describe('Login', () => {
    it('should show client_id form at /login when no query params are provided', () => {
        cy.visit('/login');
        cy.get('#client_id').should('be.visible');
        cy.get('#continue-btn').should('be.visible');
        cy.contains('Forgot Password').should('be.visible');
    });

    it('should redirect through OAuth flow to /authorize after submitting client_id', () => {
        cy.visit('/login');
        cy.get('#client_id').type('shire.local');
        cy.get('#continue-btn').click();
        cy.url({timeout: 15000}).should('include', '/authorize');
        cy.url().should('include', 'client_id=shire.local');
    });

    it('should skip the client_id form when query param is provided', () => {
        cy.visit('/login?client_id=shire.local');
        cy.url({timeout: 15000}).should('include', '/authorize');
        cy.url().should('include', 'client_id=shire.local');
    });

    it('should show email verification success banner', () => {
        cy.visit('/login?verified=true');
        cy.contains('Email Verified').should('be.visible');
        cy.get('#client_id').should('be.visible');
    });

    it('should show email verification failure banner', () => {
        cy.visit('/login?verified=false');
        cy.contains('Verification Failed').should('be.visible');
    });

    it('should show OAuth error banner when error param is present', () => {
        cy.visit('/login?error=invalid_request&error_description=missing+state');
        cy.contains('Sign-in interrupted').should('be.visible');
    });

    it('should complete the full login flow and redirect to /home', () => {
        cy.visit(`/login?client_id=${Cypress.env('shireTenantAdminClientId')}`);

        cy.intercept('POST', '**/api/oauth/token*').as('oauthToken');

        cy.get('#username', {timeout: 15000}).should('be.visible')
            .type(Cypress.env('shireTenantAdminEmail'));
        cy.get('#password').should('be.visible')
            .type(Cypress.env('shireTenantAdminPassword'));
        cy.get('#login-btn').click();

        cy.wait('@oauthToken').its('response.statusCode').should('be.oneOf', [200, 201]);
        cy.url().should('include', '/home');
    });
});
