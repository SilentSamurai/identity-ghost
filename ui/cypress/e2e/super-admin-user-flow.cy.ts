/**
 * Admin User CRUD Flow Tests
 *
 * Tests user management from the admin panel:
 * create a user via /admin/UR01, look up and display the user
 * via the /admin/UR02 value help, and delete the user from the list.
 */
describe('Super Admin — User CRUD Flow', () => {

    const USER_NAME = "TEST USER"
    const USER_EMAIL = "test-user@mail.com"
    const USER_PASSWORD = "test9000"

    beforeEach(() => {
        cy.adminLogin(Cypress.env('superAdminEmail'), Cypress.env('superAdminPassword'));
    });

    // Opens the admin user list (UR01), fills the create-user dialog, and submits
    it('Create User', function () {
        cy.goToAdminPage('UR01');
        cy.get('#CREATE_USER_DIALOG_BTN').click()

        cy.get('#CREATE_USER_name_INPUT').type(USER_NAME);
        cy.get('#CREATE_USER_email_INPUT').type(USER_EMAIL);
        cy.get('#CREATE_USER_password_INPUT').type(USER_PASSWORD);
        cy.get('#CREATE_USER_confirmPassword_INPUT').type(USER_PASSWORD);

        cy.intercept('POST', '**/users/create*').as('createUser')

        cy.get('#CREATE_USER_SUBMIT_BTN').click();

        cy.wait('@createUser').should(({request, response}) => {
            expect(response, 'response').to.exist;
            expect(response!.statusCode).to.be.oneOf([201, 200]);
            // expect(response && response.body).to.include('authentication_code')
        })

    })

    // Opens the admin user detail selection (UR02), searches for the user by email
    // via the value help dialog, selects them, and verifies the detail page shows the email
    it('Select and Display User in UR02 via Value Help', function () {
        cy.goToAdminPage('UR02');

        // Assume value help button has a test id or selector, e.g., #USER_VALUE_HELP_BTN
        cy.get('#Email-vh-btn').click();

        // In the value help dialog, search for the user by email
        cy.get('#FILTER_FIELD_email').type(USER_EMAIL);
        cy.contains('button', 'Go').click();

        // Select the user from the search results
        cy.contains('td', USER_EMAIL).click();
        cy.contains('button', 'Select').click();

        cy.contains('button', 'Continue').click();

        // Now check if the user is displayed in the user list/table
        cy.contains('app-attribute', USER_EMAIL).should('exist');
    });

    // Opens the admin user list (UR01), filters by email, and deletes the user
    // via the row-level delete button
    it('Delete User', function () {
        cy.goToAdminPage('UR01');

        cy.get('#FILTER_FIELD_email').type(USER_EMAIL);

        cy.get('#default_FILTER_BAR_GO_BTN').click();

        cy.contains('td', USER_EMAIL)
            .parent()
            .find('button[data-test-id="delete"]')
            .click();

        cy.get("#CONFIRMATION_YES_BTN").click()

    })


})
