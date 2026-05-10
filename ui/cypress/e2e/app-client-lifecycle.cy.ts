import type {Interception} from 'cypress/types/net-stubbing';

describe('Per-App OAuth Client Identity — App_Client Lifecycle', () => {
    const TENANT_ADMIN = Cypress.env('shireTenantAdminEmail');
    const TENANT_DOMAIN = Cypress.env('shireTenantAdminClientId');
    const uniqueSuffix = Date.now();
    const APP_NAME = `AppClient-E2E-${uniqueSuffix}`;
    const APP_URL = 'http://localhost:3000';
    const APP_DESC = 'Test app for App_Client lifecycle E2E';
    const UPDATED_NAME = `AppClient-E2E-Updated-${uniqueSuffix}`;
    const UPDATED_URL = 'http://localhost:3000/updated';

    it('should create an app and display clientId and alias in the success view (user context)', () => {
        cy.login(TENANT_ADMIN, Cypress.env('shireTenantAdminPassword'), TENANT_DOMAIN);
        cy.userOpenTenantOverview();
        cy.contains('button', 'Apps').click();
        cy.contains('button', 'Create').click();

        cy.get('input[name="name"]').type(APP_NAME);
        cy.get('input[name="appUrl"]').type(APP_URL);
        cy.get('textarea[name="description"]').type(APP_DESC);

        cy.intercept('POST', '**/api/apps/create').as('CreateApp');

        cy.get('.modal-footer').contains('button', 'Create').click();

        cy.wait('@CreateApp').should((interception: Interception) => {
            expect(interception.response?.statusCode).to.be.oneOf([201, 200]);
            const body = interception.response?.body;
            expect(body).to.have.property('clientId');
            expect(body).to.have.property('alias');
        });

        cy.get('.app-created-info').should('be.visible');
        cy.get('.app-created-info .alert-success').should('contain', 'App created successfully');
        cy.get('.app-created-info').contains('strong', 'Client ID:')
            .parent().find('code').should('be.visible');
        cy.get('.app-created-info').contains('strong', 'Alias:')
            .parent().find('code').should('be.visible');

        cy.get('.modal-footer').contains('button', 'Done').click();

        cy.contains('td', APP_NAME).should('exist');
    });

    it('should show clientId and alias as read-only in the update dialog and cascade name change', () => {
        cy.login(TENANT_ADMIN, Cypress.env('shireTenantAdminPassword'), TENANT_DOMAIN);
        cy.userOpenTenantOverview();
        cy.contains('button', 'Apps').click();

        cy.contains('td', APP_NAME)
            .parent()
            .find('button[data-test-id="edit"]')
            .click();

        cy.get('app-update-app').should('contain', 'Client ID');
        cy.get('app-update-app').should('contain', 'Alias');
        cy.get('app-update-app label').contains('Client ID')
            .siblings('div').find('code').should('be.visible');
        cy.get('app-update-app label').contains('Alias')
            .siblings('div').find('code').should('be.visible');

        cy.get('app-update-app input[id="name"]').clear().type(UPDATED_NAME);
        cy.get('app-update-app input[id="appUrl"]').clear().type(UPDATED_URL);

        cy.intercept('PATCH', '**/api/apps/*').as('UpdateApp');

        cy.get('.modal-footer').contains('button', 'Update').click();

        cy.wait('@UpdateApp').should((interception: Interception) => {
            expect(interception.response?.statusCode).to.be.oneOf([200, 201]);
            const body = interception.response?.body;
            expect(body).to.have.property('clientId');
            expect(body).to.have.property('alias');
            expect(body.name).to.eq(UPDATED_NAME);
            expect(body.appUrl).to.eq(UPDATED_URL);
        });

        cy.contains('td', UPDATED_NAME).should('exist');
    });

    it('should delete an app and remove the associated App_Client', () => {
        cy.login(TENANT_ADMIN, Cypress.env('shireTenantAdminPassword'), TENANT_DOMAIN);
        cy.userOpenTenantOverview();
        cy.contains('button', 'Apps').click();

        cy.contains('td', UPDATED_NAME)
            .parent()
            .find('button[data-test-id="delete"]')
            .click();

        cy.intercept('DELETE', '**/api/apps/*').as('DeleteApp');

        cy.get('#CONFIRMATION_YES_BTN').click();

        cy.wait('@DeleteApp').should((interception: Interception) => {
            expect(interception.response?.statusCode).to.be.oneOf([200, 201]);
        });

        cy.contains('td', UPDATED_NAME).should('not.exist');
    });

    it('should create an app and display clientId and alias in the success view (super-admin context)', () => {
        cy.adminLogin(Cypress.env('superAdminEmail'), Cypress.env('superAdminPassword'));
        cy.goToAdminPage('AP01');

        cy.contains('button', 'Create App').click();

        cy.get('app-create-app-admin select[id="tenantSelect"]').select('Shire Tenant (shire.local)');

        const adminAppName = `AppClient-Admin-${uniqueSuffix}`;
        cy.get('app-create-app-admin input[id="name"]').type(adminAppName);
        cy.get('app-create-app-admin input[id="appUrl"]').type(APP_URL);
        cy.get('app-create-app-admin textarea[id="description"]').type(APP_DESC);

        cy.intercept('POST', '**/api/apps/create').as('CreateAppAdmin');

        cy.get('.modal-footer').contains('button', 'Create').click();

        cy.wait('@CreateAppAdmin').should((interception: Interception) => {
            expect(interception.response?.statusCode).to.be.oneOf([201, 200]);
            const body = interception.response?.body;
            expect(body).to.have.property('clientId');
            expect(body).to.have.property('alias');
        });

        cy.get('.app-created-info').should('be.visible');
        cy.get('.app-created-info .alert-success').should('contain', 'App created successfully');
        cy.get('.app-created-info').contains('strong', 'Client ID:')
            .parent().find('code').should('be.visible');
        cy.get('.app-created-info').contains('strong', 'Alias:')
            .parent().find('code').should('be.visible');

        cy.get('.modal-footer').contains('button', 'Done').click();
    });
});
