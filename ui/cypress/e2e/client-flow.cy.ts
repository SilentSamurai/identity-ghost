describe('Client Flow', () => {

    const uniqueSuffix = Date.now();
    const CLIENT_NAME = `E2E-Client-${uniqueSuffix}`;
    const CLIENT_NAME_DELETE = `E2E-Del-Client-${uniqueSuffix}`;

    function goToClientList() {
        cy.visit('/home');
        cy.url().should('include', '/home');
        cy.get('#Home_HOME_NAV').click();
        cy.contains('app-tile', 'Clients').click();
        cy.url().should('include', '/CL01/');
    }

    beforeEach(() => {
        cy.adminLogin("admin@auth.server.com", "admin9000");
    });

    it('Navigate to CL01 and verify table is visible', function () {
        goToClientList();
        cy.get('app-table').should('be.visible');
    });

    it('Create confidential client and verify secret is displayed', function () {
        goToClientList();

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

    it('Click client name in list and verify CL02 detail page loads', function () {
        goToClientList();

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

    it('Rotate client secret on CL02 and verify new secret dialog', function () {
        goToClientList();

        cy.contains('td a', CLIENT_NAME).click();
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

    it('Delete client from CL02 and verify navigation back to CL01', function () {
        goToClientList();

        cy.contains('td a', CLIENT_NAME).click();
        cy.url().should('include', '/CL02/');

        cy.intercept('DELETE', '**/api/clients/*').as('DeleteClient');

        cy.get('#DELETE_CLIENT_BTN').click();

        cy.get('#CONFIRMATION_YES_BTN').click();

        cy.wait('@DeleteClient').should(({response}) => {
            expect(response).to.exist;
            expect(response!.statusCode).to.be.oneOf([200]);
        });

        cy.url().should('include', '/CL01/');

        cy.contains('td', CLIENT_NAME).should('not.exist');
    });

    it('Create and delete client from CL01 list via row action button', function () {
        goToClientList();

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
