/// <reference types="cypress" />

/**
 * Property 2: Non-super-admin users are denied access to admin routes
 * Validates: Requirement 2.2
 *
 * A tenant user (non-super-admin) who navigates to any /admin route
 * should be redirected to /error/403.
 */

const ADMIN_ROUTES = ['TN01', 'UR01', 'RL01', 'GP01', 'AP01'];

describe('AdminGuard — tenant user denied from admin routes', () => {

    beforeEach(() => {
        cy.login('admin@shire.local', 'admin9000', 'shire.local');
    });

    ADMIN_ROUTES.forEach((route) => {
        it(`should redirect tenant user to /error/403 when visiting /admin/${route}`, () => {
            cy.visit(`/admin/${route}`);
            cy.url().should('include', '/error/403');
        });
    });
});
