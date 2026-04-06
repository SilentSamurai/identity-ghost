/**
 * Token Revocation — UI Logout Flow Tests
 *
 * Validates that the Sign Out flow correctly calls /api/oauth/logout with the
 * refresh token, handles missing tokens gracefully, recovers from server errors,
 * and that the refresh token is persisted in sessionStorage after login.
 *
 * Requirements: 7.1, 7.2, 7.3, 7.4
 */
describe('Token Revocation — Sign Out', () => {
    const email = () => Cypress.env('shireTenantAdminEmail');
    const password = () => Cypress.env('shireTenantAdminPassword');
    const domain = () => Cypress.env('shireTenantAdminClientId');

    // 7.1 — Sign out calls logout endpoint with refresh token
    it('Sign out calls logout endpoint', () => {
        cy.login(email(), password(), domain());

        cy.intercept('POST', '**/api/oauth/logout').as('logoutCall');

        cy.get('#dropdownUser1').click();
        cy.contains('a.dropdown-item', 'Sign Out').click();

        cy.wait('@logoutCall').then((interception) => {
            expect(interception.request.body).to.have.property('refresh_token');
            expect(interception.request.body.refresh_token).to.be.a('string').and.not.be.empty;
        });

        cy.url().should('include', '/login');
    });

    // 7.2 — Sign out without refresh token skips server call but still redirects
    it('Sign out without refresh token skips logout API call', () => {
        cy.login(email(), password(), domain());

        cy.window().then((win) => win.sessionStorage.removeItem('auth-refresh-token'));

        cy.intercept('POST', '**/api/oauth/logout').as('logoutCall');

        cy.get('#dropdownUser1').click();
        cy.contains('a.dropdown-item', 'Sign Out').click();

        cy.url().should('include', '/login');

        // The logout endpoint must not have been called
        cy.get('@logoutCall.all').should('have.length', 0);
    });

    // 7.3 — Sign out with server error still clears session and redirects
    it('Sign out with server error still redirects to login', () => {
        cy.login(email(), password(), domain());

        cy.intercept('POST', '**/api/oauth/logout', { statusCode: 500 }).as('logoutError');

        cy.get('#dropdownUser1').click();
        cy.contains('a.dropdown-item', 'Sign Out').click();

        cy.wait('@logoutError').its('response.statusCode').should('eq', 500);

        cy.url().should('include', '/login');

        // Session must be cleared — access token should be gone
        cy.window().then((win) => {
            expect(win.sessionStorage.getItem('auth-token')).to.be.null;
            expect(win.sessionStorage.getItem('auth-refresh-token')).to.be.null;
        });
    });

    // 7.4 — Refresh token is stored in sessionStorage after login
    it('Refresh token is stored in sessionStorage after login', () => {
        cy.login(email(), password(), domain());

        cy.window().then((win) => {
            const refreshToken = win.sessionStorage.getItem('auth-refresh-token');
            expect(refreshToken).to.be.a('string').and.not.be.empty;
        });
    });
});
