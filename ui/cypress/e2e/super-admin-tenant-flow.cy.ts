/**
 * Admin Tenant CRUD Flow Tests
 *
 * Tests the full tenant lifecycle from the admin panel:
 * create, view, update, manage members, manage roles,
 * manage apps, and delete. All operations go through /admin/* routes.
 */
describe('Super Admin — Tenant CRUD Flow', () => {
    const TENANT_NAME = 'Test Tenant';
    const TENANT_DOMAIN = "test-tenant.com"
    const TenantUpdateName = 'Test Updated Tenant';
    const TENANT_MEMBER = 'boromir@mail.com';
    const ROLE_NAME = 'TEST_ROLE';

    beforeEach(() => {
        cy.adminLogin(Cypress.env('superAdminEmail'), Cypress.env('superAdminPassword'));
    });

    // Creates a new tenant via the admin TN01 page
    it('Create Tenant', function () {
        cy.adminCreateTenant(TENANT_NAME, TENANT_DOMAIN);
    })

    // Navigates to the tenant object page via value help and verifies it loads
    it('GET Tenant', function () {
        cy.adminGoToTenantObjectPage(TENANT_DOMAIN);
        // Verify tenant detail page rendered with expected action buttons
        cy.get('#UPDATE_TENANT_BTN').should('be.visible');
        cy.get('#DELETE_TENANT_BTN').should('be.visible');
    });


    // Opens the tenant, clicks Update, changes the name, and saves
    it('Update Tenant', function () {
        cy.adminGoToTenantObjectPage(TENANT_DOMAIN);

        cy.get('#UPDATE_TENANT_BTN').click();

        cy.get('#update\\.tenant\\.name').clear();
        cy.get('#update\\.tenant\\.name').type(TenantUpdateName);

        cy.get('#UPDATE_TENANT_SAVE_BTN').click();

    })

    // Opens the tenant, navigates to Members tab, and adds a new member by email
    it('Add Member', function () {
        cy.adminGoToTenantObjectPage(TENANT_DOMAIN);

        // cy.get('#ADD_MEMBER_BTN').click();
        cy.get('#MEMBERS_SECTION_NAV').click();
        cy.get('#OPEN_ADD_MEMBER_DIALOG_BTN').click();

        cy.get('#add\\.member\\.name').type(TENANT_MEMBER);
        cy.get('#ADD_TENANT_MEMBER_BTN').click();

    })

    // Opens the tenant, navigates to Members tab, removes the member, and verifies the API call
    it('Remove Member', function () {
        cy.adminGoToTenantObjectPage(TENANT_DOMAIN);

        // cy.get('#ADD_MEMBER_BTN').click();
        cy.get('#MEMBERS_SECTION_NAV').click();

        cy.get(`button[data-cy-id='${TENANT_MEMBER}']`).click()

        cy.intercept('DELETE', '**/api/admin/tenant/*/members/delete').as('RemoveMember')

        cy.get('#CONFIRMATION_YES_BTN').click();

        cy.wait('@RemoveMember').should(({request, response}) => {
            expect(response, 'response').to.exist;
            expect(response!.statusCode).to.be.oneOf([200]);
        })

    })

    // Opens the tenant, navigates to Roles tab, and creates a new role
    it('Add Role', function () {
        cy.adminGoToTenantObjectPage(TENANT_DOMAIN);

        // cy.get('#ADD_MEMBER_BTN').click();
        cy.get('#ROLES_SECTION_NAV').click();
        cy.get('#ADD_ROLE_DIALOG_BTN').click();

        cy.get('#add\\.role\\.name').type(ROLE_NAME);
        cy.get('#ADD_TENANT_ROLE_BTN').click();

    })

    // Opens the tenant, navigates to Roles tab, removes the role, and verifies the API call
    it('Remove Role', function () {
        cy.adminGoToTenantObjectPage(TENANT_DOMAIN);

        // cy.get('#ADD_MEMBER_BTN').click();
        cy.get('#ROLES_SECTION_NAV').click();

        cy.get(`button[data-cy-id='${ROLE_NAME}']`).click()

        cy.intercept('DELETE', '**/api/admin/tenant/*/role/*').as('RemoveRole')

        cy.get('#CONFIRMATION_YES_BTN').click();

        cy.wait('@RemoveRole').should(({request, response}) => {
            expect(response, 'response').to.exist;
            expect(response!.statusCode).to.be.oneOf([200]);
        })

    })

    // Opens the tenant, navigates to Apps tab, creates a new app with name/URL/description
    it('Add App to Tenant', function () {
        cy.adminGoToTenantObjectPage(TENANT_DOMAIN);

        const appName = "Tenant Test App";

        // Add App flow
        cy.contains('button', 'Apps').click();
        cy.contains('button', 'Create').click();

        cy.get('input[name="name"]').type(appName); // App name input
        cy.get('input[name="appUrl"]').type('http://localhost:3000'); // App name input
        cy.get('textarea[name="description"]').type('A test app for tenant E2E');

        cy.intercept('POST', '**/api/apps/create').as('CreateApp');

        cy.get('.modal-footer').contains('button', 'Create').click();

        cy.wait('@CreateApp').should(({request, response}) => {
            expect(response, 'response').to.exist;
            expect(response!.statusCode).to.be.oneOf([201, 200]);
        });

        cy.contains("td", appName).should("exist");

    });

    // Opens the tenant, navigates to Apps tab, deletes the app via the row delete button
    it('Delete App', () => {
        cy.adminGoToTenantObjectPage(TENANT_DOMAIN);

        const appName = "Tenant Test App";

        cy.contains('button', 'Apps').click();

        cy.intercept('DELETE', '**/api/apps/*').as('DeleteApp');

        cy.contains("td", appName)
            .parent()
            .find('button[data-test-id="delete"]')
            .click();

        cy.get('#CONFIRMATION_YES_BTN').click();

        cy.wait('@DeleteApp').should(({request, response}) => {
            expect(response, 'response').to.exist;
            expect(response!.statusCode).to.be.oneOf([201, 200]);
        });

    })

    // Deletes the entire tenant and verifies the API returns 200
    it('Delete Tenant', function () {
        cy.adminDeleteTenant(TENANT_DOMAIN);
    })
})
