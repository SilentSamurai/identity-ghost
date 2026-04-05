/**
 * Admin Navigation Link Tests
 *
 * Verifies that links inside admin list pages (TN01, RL01) navigate
 * to the correct admin detail pages (TN02, RL02) instead of
 * accidentally routing to user-context pages.
 */
describe('Super Admin — Admin Navigation Links', () => {

    beforeEach(() => {
        cy.adminLogin(Cypress.env('superAdminEmail'), Cypress.env('superAdminPassword'));
    });

    /**
     * Property 1: Bug Condition — Admin components use correct routes
     * Validates: Requirements 2.2, 2.7 
     *
     * Navigates to /admin/TN01, clicks a tenant domain link,
     * and asserts the URL contains /admin/TN02/.
     */
    it('TN01 tenant domain link navigates to /admin/TN02', () => {
        cy.goToAdminPage('TN01');

        // Wait for the tenant table to load with at least one row
        cy.get('app-table tbody tr', { timeout: 10000 }).should('have.length.greaterThan', 0);

        // Click the first tenant domain link
        cy.get('app-table tbody tr').first().find('a[href]').first().click();

        // Assert the URL contains /admin/TN02/
        cy.url().should('include', '/admin/TN02/');
    });

    /**
     * Property 1: Bug Condition — Admin components use correct routes
     * Validates: Requirements 2.5, 2.7
     *
     * Navigates to /admin/RL01, clicks a role name link and asserts
     * URL contains /admin/RL02/, then navigates back and clicks a
     * tenant domain link and asserts URL contains /admin/TN02/.
     */
    it('RL01 role name link navigates to /admin/RL02 and tenant domain link navigates to /admin/TN02', () => {
        cy.goToAdminPage('RL01');

        // Wait for the roles table to load with at least one row
        cy.get('app-table tbody tr', { timeout: 10000 }).should('have.length.greaterThan', 0);

        // The first <a> in each row is the role name link (routes to /admin/RL02/)
        cy.get('app-table tbody tr').first().find('td').eq(1).find('a').click();

        // Assert the URL contains /admin/RL02/
        cy.url().should('include', '/admin/RL02/');

        // Navigate back to RL01 to test the tenant domain link
        cy.goToAdminPage('RL01');

        // Wait for the roles table to load again
        cy.get('app-table tbody tr', { timeout: 10000 }).should('have.length.greaterThan', 0);

        // The second <a> in each row is the tenant domain link (routes to /admin/TN02/)
        cy.get('app-table tbody tr').first().find('td').eq(2).find('a').click();

        // Assert the URL contains /admin/TN02/
        cy.url().should('include', '/admin/TN02/');
    });
});
