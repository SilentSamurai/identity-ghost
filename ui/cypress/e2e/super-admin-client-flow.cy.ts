/**
 * Admin Client CRUD Flow Tests — Cross-Tenant
 *
 * Tests the core super-admin capability: managing OAuth clients across
 * different tenants from the admin panel (/admin/CL01, /admin/CL02).
 * Creates clients under two separate tenants (shire.local and bree.local),
 * verifies the owner tenant is correctly displayed, and performs
 * rotate-secret and delete operations on cross-tenant clients.
 */
describe('Super Admin — Client Cross-Tenant CRUD Flow', () => {

    const uniqueSuffix = Date.now();
    const SHIRE_CLIENT = `E2E-Shire-Client-${uniqueSuffix}`;
    const SHIRE_CLIENT_EDITED = SHIRE_CLIENT + '-edited';
    const BREE_CLIENT = `E2E-Bree-Client-${uniqueSuffix}`;
    const TENANT_A = 'shire.local';
    const TENANT_B = 'bree.local';

    beforeEach(() => {
        cy.adminLogin(Cypress.env('superAdminEmail'), Cypress.env('superAdminPassword'));
    });

    // Navigate to admin CL01 and verify the table renders
    it('Navigate to admin CL01 and verify table is visible', function () {
        cy.goToAdminPage('CL01');
        cy.get('app-table').should('be.visible');
    });

    // Create a client under Tenant A (shire.local)
    it('Create client under Tenant A (shire.local)', function () {
        cy.goToAdminPage('CL01');

        cy.contains('button', 'Create Client').click();

        cy.get('#tenantSelect option').contains(TENANT_A).then(option => {
            cy.get('#tenantSelect').select(option.val() as string);
        });

        cy.get('#name').type(SHIRE_CLIENT);
        cy.get('#redirectUris').type('https://shire.example.com/callback');
        cy.get('#allowedScopes').clear().type('openid profile');

        cy.intercept('POST', '**/api/clients/create').as('CreateShireClient');

        cy.get('.modal-footer').contains('button', 'Create').click();

        cy.wait('@CreateShireClient').should(({response}) => {
            expect(response).to.exist;
            expect(response!.statusCode).to.be.oneOf([201, 200]);
        });

        cy.contains('Client Secret').should('be.visible');
        cy.get('pre').should('be.visible').invoke('text').should('not.be.empty');
        cy.get('.modal-footer').contains('button', 'Close').click();

        cy.contains('td', SHIRE_CLIENT).should('exist');
    });

    // Create a client under Tenant B (bree.local)
    it('Create client under Tenant B (bree.local)', function () {
        cy.goToAdminPage('CL01');

        cy.contains('button', 'Create Client').click();

        cy.get('#tenantSelect option').contains(TENANT_B).then(option => {
            cy.get('#tenantSelect').select(option.val() as string);
        });

        cy.get('#name').type(BREE_CLIENT);
        cy.get('#redirectUris').type('https://bree.example.com/callback');
        cy.get('#allowedScopes').clear().type('openid profile');

        cy.intercept('POST', '**/api/clients/create').as('CreateBreeClient');

        cy.get('.modal-footer').contains('button', 'Create').click();

        cy.wait('@CreateBreeClient').should(({response}) => {
            expect(response).to.exist;
            expect(response!.statusCode).to.be.oneOf([201, 200]);
        });

        cy.contains('Client Secret').should('be.visible');
        cy.get('pre').should('be.visible').invoke('text').should('not.be.empty');
        cy.get('.modal-footer').contains('button', 'Close').click();

        cy.contains('td', BREE_CLIENT).should('exist');
    });

    // Open Tenant A's client detail page and verify the owner tenant link
    it('Verify Tenant A client detail shows correct owner tenant', function () {
        cy.goToAdminPage('CL01');

        cy.contains('td a', SHIRE_CLIENT).click();
        cy.url().should('include', '/admin/CL02/');

        cy.contains(SHIRE_CLIENT).should('be.visible');
        cy.contains('Owner Tenant').should('exist');
        cy.contains('Shire Tenant').should('exist');
    });

    // Open Tenant B's client detail page and verify the owner tenant link
    it('Verify Tenant B client detail shows correct owner tenant', function () {
        cy.goToAdminPage('CL01');

        cy.contains('td a', BREE_CLIENT).click();
        cy.url().should('include', '/admin/CL02/');

        cy.contains(BREE_CLIENT).should('be.visible');
        cy.contains('Owner Tenant').should('exist');
        cy.contains('Bree Tenant').should('exist');
    });


    // Edit Tenant A's client name from the admin detail page
    it('Edit Tenant A client name from admin CL02', function () {
        cy.goToAdminPage('CL01');

        cy.contains('td a', SHIRE_CLIENT).click();
        cy.url().should('include', '/admin/CL02/');

        cy.get('#EDIT_CLIENT_BTN').should('be.visible').click();

        cy.get('#name').should('be.visible').clear().type(SHIRE_CLIENT_EDITED);

        cy.intercept('PATCH', '**/api/clients/*').as('UpdateClient');

        cy.get('.modal-footer').contains('button', 'Update').click();

        cy.wait('@UpdateClient').should(({response}) => {
            expect(response).to.exist;
            expect(response!.statusCode).to.be.oneOf([200]);
        });

        cy.contains(SHIRE_CLIENT_EDITED).should('be.visible');
    });

    // Rotate secret on Tenant A's client from the admin detail page
    it('Rotate secret on Tenant A client', function () {
        cy.goToAdminPage('CL01');

        cy.contains('td a', SHIRE_CLIENT_EDITED).click();
        cy.url().should('include', '/admin/CL02/');

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

    // Delete Tenant A's client from the admin CL02 detail page
    it('Delete Tenant A client from admin CL02 detail page', function () {
        cy.goToAdminPage('CL01');

        cy.contains('td a', SHIRE_CLIENT_EDITED).click();
        cy.url().should('include', '/admin/CL02/');

        cy.intercept('DELETE', '**/api/clients/*').as('DeleteClient');

        cy.get('#DELETE_CLIENT_BTN').click();
        cy.get('#CONFIRMATION_YES_BTN').click();

        cy.wait('@DeleteClient').should(({response}) => {
            expect(response).to.exist;
            expect(response!.statusCode).to.be.oneOf([200]);
        });

        cy.url().should('include', '/admin/CL01');
        cy.contains('td', SHIRE_CLIENT_EDITED).should('not.exist');
    });

    // Delete Tenant B's client from the admin CL01 list via row action button
    it('Delete Tenant B client from admin CL01 list via row action', function () {
        cy.goToAdminPage('CL01');

        cy.contains('td', BREE_CLIENT).should('exist');

        cy.intercept('DELETE', '**/api/clients/*').as('DeleteClientFromList');

        cy.contains('td', BREE_CLIENT)
            .parent('tr')
            .find('button.btn-danger')
            .click();

        cy.get('#CONFIRMATION_YES_BTN').click();

        cy.wait('@DeleteClientFromList').should(({response}) => {
            expect(response).to.exist;
            expect(response!.statusCode).to.be.oneOf([200]);
        });

        cy.contains('td', BREE_CLIENT).should('not.exist');
    });
});
