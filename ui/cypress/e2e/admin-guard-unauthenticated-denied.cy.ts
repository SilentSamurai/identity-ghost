/// <reference types="cypress" />

/**
 * Property 2: Non-super-admin users are denied access to admin routes
 * Validates: Requirement 2.3
 *
 * An unauthenticated user who navigates to an /admin route
 * should be redirected to the login page.
 */

describe('AdminGuard — unauthenticated user denied from admin routes', () => {

    it('should redirect unauthenticated user to /login when visiting /admin/TN01', () => {
        cy.visit('/admin/TN01');
        cy.url().should('include', '/login');
    });
});
