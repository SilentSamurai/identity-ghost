/**
 * Client (OAuth Client) CRUD Flow Tests
 *
 * Tests the full lifecycle of OAuth clients from the user-context client list (CL01/CL02):
 * creating a confidential client, viewing its details, rotating its secret,
 * and deleting it both from the detail page and from the list page.
 * Logs in as a normal tenant admin (shire.local) — no super-admin privileges needed.
 */
describe('Client Flow', () => {

    const uniqueSuffix = Date.now();
    const CLIENT_NAME = `E2E-Client-${uniqueSuffix}`;
    const CLIENT_NAME_EDITED = CLIENT_NAME + '-edited';
    const CLIENT_NAME_DELETE = `E2E-Del-Client-${uniqueSuffix}`;

    beforeEach(() => {
        cy.login("admin@shire.local", "admin9000", "shire.local");
    });

    // Navigates to the client list page and verifies the table component renders
    it('Navigate to CL01 and verify table is visible', function () {
        cy.userOpenClientList();
        cy.get('app-table').should('be.visible');
    });

    // Creates a new confidential client with name, redirect URI, and scopes,
    // then verifies the client secret dialog appears with a non-empty secret
    it('Create confidential client and verify secret is displayed', function () {
        cy.userOpenClientList();

        cy.contains('button', 'Create Client').click();

        cy.get('#name').type(CLIENT_NAME);
        cy.get('#redirectUris').type('https://example.com/callback');
        cy.get('#allowedScopes').clear().type('openid profile');

        cy.intercept('POST', '**/api/clients/create').as('CreateClient');

        cy.get('.modal-footer').contains('button', 'Create').click();

        cy.wait('@CreateClient').should(({response}) => {
            expect(response).to.exist;
            expect(response!.statusCode).to.be.oneOf([201, 200]);
        });

        cy.contains('Client Secret').should('be.visible');
        cy.get('pre').should('be.visible').invoke('text').should('not.be.empty');

        cy.get('.modal-footer').contains('button', 'Close').click();

        cy.contains('td', CLIENT_NAME).should('exist');
    });

    // Clicks a client name link in the CL01 list and verifies the CL02 detail page
    // loads with all expected attribute fields (name, client ID, scopes, grant types, etc.)
    it('Click client name in list and verify CL02 detail page loads', function () {
        cy.userOpenClientList();

        cy.contains('td a', CLIENT_NAME).click();

        cy.url().should('include', '/CL02/');

        cy.contains(CLIENT_NAME).should('be.visible');
        cy.contains('Name').should('exist');
        cy.contains('Client ID').should('exist');
        cy.contains('Client Type').should('exist');
        cy.contains('Redirect URIs').should('exist');
        cy.contains('Allowed Scopes').should('exist');
        cy.contains('Grant Types').should('exist');
        cy.contains('Response Types').should('exist');
        cy.contains('Token Endpoint Auth Method').should('exist');
        cy.contains('Require PKCE').should('exist');
        cy.contains('Allow Password Grant').should('exist');
        cy.contains('Allow Refresh Token').should('exist');
    });

    // Opens the client detail page, clicks "Rotate Secret", confirms the dialog,
    // and verifies a new secret is displayed

    // Opens the client detail page, clicks "Edit", updates the name,
    // and verifies the detail page reflects the change
    it('Edit client on CL02 and verify updated name', function () {
        cy.userOpenClientList();

        cy.contains('td a', CLIENT_NAME).click();
        cy.url().should('include', '/CL02/');

        cy.get('#EDIT_CLIENT_BTN').should('be.visible').click();

        cy.get('#name').should('be.visible').clear().type(CLIENT_NAME_EDITED);

        cy.intercept('PATCH', '**/api/clients/*').as('UpdateClient');

        cy.get('.modal-footer').contains('button', 'Update').click();

        cy.wait('@UpdateClient').should(({response}) => {
            expect(response).to.exist;
            expect(response!.statusCode).to.be.oneOf([200]);
        });

        cy.contains(CLIENT_NAME_EDITED).should('be.visible');
    });

    it('Rotate client secret on CL02 and verify new secret dialog', function () {
        cy.userOpenClientList();

        cy.contains('td a', CLIENT_NAME_EDITED).click();
        cy.url().should('include', '/CL02/');

        cy.get('#ROTATE_SECRET_BTN').should('be.visible');

        cy.intercept('POST', '**/api/clients/*/rotate-secret').as('RotateSecret');

        cy.get('#ROTATE_SECRET_BTN').click();

        cy.get('#CONFIRMATION_YES_BTN').click();

        cy.wait('@RotateSecret').should(({response}) => {
            expect(response).to.exist;
            expect(response!.statusCode).to.be.oneOf([201, 200]);
        });

        cy.contains('Client Secret').should('be.visible');
        cy.get('pre').should('be.visible').invoke('text').should('not.be.empty');

        cy.get('.modal-footer').contains('button', 'Close').click();
    });

    // Opens the client detail page, deletes the client via the detail page button,
    // and verifies navigation back to CL01 with the client removed from the list
    it('Delete client from CL02 and verify navigation back to CL01', function () {
        cy.userOpenClientList();

        cy.contains('td a', CLIENT_NAME_EDITED).click();
        cy.url().should('include', '/CL02/');

        cy.intercept('DELETE', '**/api/clients/*').as('DeleteClient');

        cy.get('#DELETE_CLIENT_BTN').click();

        cy.get('#CONFIRMATION_YES_BTN').click();

        cy.wait('@DeleteClient').should(({response}) => {
            expect(response).to.exist;
            expect(response!.statusCode).to.be.oneOf([200]);
        });

        cy.url().should('include', '/CL01/');

        cy.contains('td', CLIENT_NAME_EDITED).should('not.exist');
    });

    // Creates a client, then deletes it directly from the CL01 list using the
    // row-level delete button (without navigating to the detail page)
    it('Create and delete client from CL01 list via row action button', function () {
        cy.userOpenClientList();

        cy.contains('button', 'Create Client').click();

        cy.get('#name').type(CLIENT_NAME_DELETE);
        cy.get('#redirectUris').type('https://example.com/callback');

        cy.intercept('POST', '**/api/clients/create').as('CreateClientForDelete');

        cy.get('.modal-footer').contains('button', 'Create').click();

        cy.wait('@CreateClientForDelete').should(({response}) => {
            expect(response).to.exist;
            expect(response!.statusCode).to.be.oneOf([201, 200]);
        });

        cy.contains('Client Secret').should('be.visible');
        cy.get('.modal-footer').contains('button', 'Close').click();

        cy.contains('td', CLIENT_NAME_DELETE).should('exist');

        cy.intercept('DELETE', '**/api/clients/*').as('DeleteClientFromList');

        cy.contains('td', CLIENT_NAME_DELETE)
            .parent('tr')
            .find('button.btn-danger')
            .click();

        cy.get('#CONFIRMATION_YES_BTN').click();

        cy.wait('@DeleteClientFromList').should(({response}) => {
            expect(response).to.exist;
            expect(response!.statusCode).to.be.oneOf([200]);
        });

        cy.contains('td', CLIENT_NAME_DELETE).should('not.exist');
    });
});
