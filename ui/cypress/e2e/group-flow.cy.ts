/**
 * Group Management Flow Tests (User Context)
 *
 * Tests the full lifecycle of groups from the tenant overview (TN02):
 * creating a group, navigating to the group detail page (GP02),
 * assigning/removing users and roles, updating the group name,
 * and deleting the group. Logs in as a normal tenant admin (shire.local).
 */
describe('Group Flow', () => {

    const uniqueSuffix = Date.now();
    const GROUP_NAME = `E2E-Group-${uniqueSuffix}`;
    const GROUP_NAME_UPDATED = `${GROUP_NAME}-updated`;

    beforeEach(() => {
        cy.login(
            Cypress.env('shireTenantAdminEmail'),
            Cypress.env('shireTenantAdminPassword'),
            Cypress.env('shireTenantAdminClientId')
        );
    });

    it('should show Groups tab on tenant overview', () => {
        cy.userOpenTenantOverview();
        cy.contains('button', 'Groups').should('exist');
    });

    it('should create a group from the Groups tab', () => {
        cy.userOpenTenantOverview();
        cy.contains('button', 'Groups').click();

        cy.get('#CREATE_GROUP_BTN').click();

        cy.get('#create\\.group\\.name').type(GROUP_NAME);

        cy.intercept('POST', '**/api/group/create').as('CreateGroup');

        cy.get('.modal-footer').contains('button', 'Create').click();

        cy.wait('@CreateGroup').should(({response}) => {
            expect(response).to.exist;
            expect(response!.statusCode).to.be.oneOf([201, 200]);
        });

        cy.contains('td', GROUP_NAME).should('exist');
    });

    it('should navigate to group detail page (GP02)', () => {
        cy.userOpenTenantOverview();
        cy.contains('button', 'Groups').click();

        cy.contains('td a', GROUP_NAME).click();

        cy.url().should('include', '/GP02/');
        cy.contains(GROUP_NAME).should('be.visible');
        cy.contains('button', 'Users').should('exist');
        cy.contains('button', 'Roles').should('exist');
    });

    it('should assign a user to the group', () => {
        cy.userOpenTenantOverview();
        cy.contains('button', 'Groups').click();
        cy.contains('td a', GROUP_NAME).click();
        cy.url().should('include', '/GP02/');

        cy.contains('button', 'Users').click();
        cy.contains('button', 'Assign Users').click();

        // Select the first user in the value help
        cy.get('.modal-body table tbody tr').first().click();

        cy.intercept('POST', '**/api/group/*/add-users').as('AddUser');

        cy.get('#Users_VH_SELECT_BTN').click();

        cy.wait('@AddUser').should(({response}) => {
            expect(response).to.exist;
            expect(response!.statusCode).to.be.oneOf([201, 200]);
        });
    });

    it('should assign a role to the group', () => {
        cy.userOpenTenantOverview();
        cy.contains('button', 'Groups').click();
        cy.contains('td a', GROUP_NAME).click();
        cy.url().should('include', '/GP02/');

        cy.contains('button', 'Roles').click();
        cy.contains('button', 'Assign Roles').click();

        // Select the first role in the value help
        cy.get('.modal-body table tbody tr').first().click();

        cy.intercept('POST', '**/api/group/*/add-roles').as('AddRole');

        cy.get('#Roles_VH_SELECT_BTN').click();

        cy.wait('@AddRole').should(({response}) => {
            expect(response).to.exist;
            expect(response!.statusCode).to.be.oneOf([201, 200]);
        });
    });

    it('should remove a user from the group', () => {
        cy.userOpenTenantOverview();
        cy.contains('button', 'Groups').click();
        cy.contains('td a', GROUP_NAME).click();
        cy.url().should('include', '/GP02/');

        cy.contains('button', 'Users').click();

        cy.intercept('POST', '**/api/group/*/remove-users').as('RemoveUser');

        cy.get('app-table button .fa-trash').first().closest('button').click();
        cy.get('#CONFIRMATION_YES_BTN').click();

        cy.wait('@RemoveUser').should(({response}) => {
            expect(response).to.exist;
            expect(response!.statusCode).to.be.oneOf([201, 200]);
        });
    });

    it('should remove a role from the group', () => {
        cy.userOpenTenantOverview();
        cy.contains('button', 'Groups').click();
        cy.contains('td a', GROUP_NAME).click();
        cy.url().should('include', '/GP02/');

        cy.contains('button', 'Roles').click();

        cy.intercept('POST', '**/api/group/*/remove-roles').as('RemoveRole');

        cy.get('app-table button .fa-trash').first().closest('button').click();
        cy.get('#CONFIRMATION_YES_BTN').click();

        cy.wait('@RemoveRole').should(({response}) => {
            expect(response).to.exist;
            expect(response!.statusCode).to.be.oneOf([201, 200]);
        });
    });

    it('should update the group name', () => {
        cy.userOpenTenantOverview();
        cy.contains('button', 'Groups').click();
        cy.contains('td a', GROUP_NAME).click();
        cy.url().should('include', '/GP02/');

        cy.contains('button', 'Update').click();

        cy.get('#update\\.group\\.name').clear().type(GROUP_NAME_UPDATED);

        cy.intercept('PATCH', '**/api/group/*/update').as('UpdateGroup');

        cy.get('.modal-footer').contains('button', 'Update').click();

        cy.wait('@UpdateGroup').should(({response}) => {
            expect(response).to.exist;
            expect(response!.statusCode).to.be.oneOf([200]);
        });

        cy.contains(GROUP_NAME_UPDATED).should('be.visible');
    });

    it('should delete the group from GP02 detail page', () => {
        cy.userOpenTenantOverview();
        cy.contains('button', 'Groups').click();
        cy.contains('td a', GROUP_NAME_UPDATED).click();
        cy.url().should('include', '/GP02/');

        cy.intercept('DELETE', '**/api/group/*/delete').as('DeleteGroup');

        cy.contains('button', 'Delete').click();
        cy.get('#CONFIRMATION_YES_BTN').click();

        cy.wait('@DeleteGroup').should(({response}) => {
            expect(response).to.exist;
            expect(response!.statusCode).to.be.oneOf([200]);
        });

        // Should navigate back to tenant overview with Groups tab
        cy.url().should('include', '/TN02/');
    });

    it('should create and delete a group from the TN02 list', () => {
        const deleteGroupName = `E2E-Del-Group-${uniqueSuffix}`;

        cy.userOpenTenantOverview();
        cy.contains('button', 'Groups').click();

        // Create
        cy.get('#CREATE_GROUP_BTN').click();
        cy.get('#create\\.group\\.name').type(deleteGroupName);

        cy.intercept('POST', '**/api/group/create').as('CreateGroupForDelete');
        cy.get('.modal-footer').contains('button', 'Create').click();
        cy.wait('@CreateGroupForDelete').should(({response}) => {
            expect(response).to.exist;
            expect(response!.statusCode).to.be.oneOf([201, 200]);
        });

        cy.contains('td', deleteGroupName).should('exist');

        // Delete from list
        cy.intercept('DELETE', '**/api/group/*/delete').as('DeleteGroupFromList');

        cy.contains('td', deleteGroupName)
            .parent('tr')
            .find('button')
            .filter(':has(i.fa-trash)')
            .click();

        cy.get('#CONFIRMATION_YES_BTN').click();

        cy.wait('@DeleteGroupFromList').should(({response}) => {
            expect(response).to.exist;
            expect(response!.statusCode).to.be.oneOf([200]);
        });

        cy.contains('td', deleteGroupName).should('not.exist');
    });
});
