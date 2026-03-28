/// <reference types="cypress" />

/**
 * Property 1: Super-admin can access all admin routes
 * Validates: Requirements 1.1, 1.4, 2.1
 *
 * For each admin route, a logged-in super-admin should see the page
 * rendered inside the admin layout (admin navbar visible, no error page).
 */

const ALL_ADMIN_ROUTES = [
    'TN01',
    'TN02',
    'TNRL01',
    'RL01',
    'RL02',
    'GP01',
    'GP02',
    'UR01',
    'UR02',
    'AP01',
];

describe('Admin Pages Separation — super-admin can access all admin routes', () => {

    beforeEach(() => {
        cy.adminLogin('admin@auth.server.com', 'admin9000');
    });

    ALL_ADMIN_ROUTES.forEach((route) => {
        it(`should render /admin/${route} with admin navbar visible and no error page`, () => {
            cy.visit(`/admin/${route}`);

            // URL stays on the admin route (no redirect to error or login)
            cy.url().should('include', `/admin/${route}`);

            // Admin navbar is rendered
            cy.get('admin-nav-bar', { timeout: 10000 }).should('exist').and('be.visible');

            // No error page content
            cy.url().should('not.include', '/error/');
            cy.url().should('not.include', '/login');
        });
    });
});

/**
 * Admin layout renders correctly
 * Validates: Requirements 3.1, 3.2, 3.3
 *
 * The admin layout should display a navbar with navigation links to all
 * admin pages, the logged-in user's email, and a sign-out option.
 */
describe('Admin Pages Separation — admin layout renders correctly', () => {

    beforeEach(() => {
        cy.adminLogin('admin@auth.server.com', 'admin9000');
        cy.visit('/admin/TN01');
        cy.get('admin-nav-bar', { timeout: 10000 }).should('be.visible');
    });

    it('should display navigation links to Tenants, Users, Roles, Groups, and Apps', () => {
        const expectedLinks = [
            { label: 'Tenants', href: '/admin/TN01' },
            { label: 'Users', href: '/admin/UR01' },
            { label: 'Roles', href: '/admin/RL01' },
            { label: 'Groups', href: '/admin/GP01' },
            { label: 'Apps', href: '/admin/AP01' },
        ];

        expectedLinks.forEach(({ label, href }) => {
            cy.get('admin-nav-bar')
                .find(`a.nav-link[href="${href}"]`)
                .should('be.visible')
                .and('contain.text', label);
        });
    });

    it('should display the logged-in user email', () => {
        cy.get('admin-nav-bar')
            .find('#adminDropdownUser')
            .should('be.visible')
            .and('contain.text', 'admin@auth.server.com');
    });

    it('should have a sign-out option in the user dropdown', () => {
        // Open the dropdown
        cy.get('admin-nav-bar').find('#adminDropdownUser').click();

        // Assert sign-out link is present
        cy.get('admin-nav-bar')
            .find('.dropdown-menu')
            .should('be.visible')
            .within(() => {
                cy.contains('a.dropdown-item', 'Sign Out').should('exist');
            });
    });
});
