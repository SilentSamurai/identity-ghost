/**
 * External App OAuth Login Test
 *
 * Simulates a third-party app (running on localhost:3000) initiating an OAuth login.
 * The user clicks "Login" on the external app, gets redirected to /authorize,
 * enters credentials, and is redirected back with an authorization code.
 * Verifies the decoded token contains the correct user email and tenant domain.
 */
describe('External Login', () => {
    beforeEach(() => {
        cy.visit('/')
    })

    // Clicks login on the external app, authenticates via /authorize, and verifies
    // the redirect back to the external app with a valid code and decoded token
    it('External Login', () => {

        cy.visit('http://localhost:3000/');

        cy.get('#login-btn').click();

        cy.intercept('POST', '**/api/oauth/token*').as('authToken');

        cy.url().should('include', '/authorize');

        cy.get('#username').type(Cypress.env('shireTenantAdminEmail'));
        cy.get('#password').type(Cypress.env('shireTenantAdminPassword'));

        // cy.intercept('POST', '**/api/oauth/login*').as('authCode')
        // cy.intercept('POST', '**/api/oauth/token*').as('authToken')

        cy.get('#login-btn').click();

        cy.wait('@authToken').should(({request, response}) => {
            expect(response, 'response').to.exist;
            expect(response!.statusCode).to.be.oneOf([201, 200]);
            // expect(response && response.body).to.include('authentication_code')
        });

        // cy.origin("http://localhost:3000/", () => {})

        cy.url().should('include', '?code');

        cy.get('#decodedToken').should('contain', Cypress.env('shireTenantAdminEmail'));
        cy.get('#decodedToken').should('contain', Cypress.env('shireTenantAdminClientId'));


    })
})
