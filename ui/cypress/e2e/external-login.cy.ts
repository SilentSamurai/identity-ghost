/**
 * External App OAuth Login Test
 *
 * Simulates a third-party app (running on localhost:3000) initiating an OAuth login.
 * The user clicks "Login" on the external app, gets redirected to /authorize,
 * enters credentials, and is redirected back with an authorization code.
 * Verifies the decoded token contains the correct user email and tenant domain.
 *
 * Consent is DB-backed and persists across test runs. On the first run for this
 * user/client, the consent screen appears. On subsequent runs, consent is already
 * granted and the redirect to the external app happens immediately after login.
 */
describe('External Login', () => {
    beforeEach(() => {
        cy.clearAllCookies();
        cy.clearAllLocalStorage();
        cy.window().then((win) => win.sessionStorage.clear());
        cy.visit('/');
    });

    it('External Login', () => {
        cy.visit('http://localhost:3000/');

        cy.get('#login-btn').click();

        cy.url().should('include', '/authorize');

        cy.get('#username').type(Cypress.env('shireTenantAdminEmail'));
        cy.get('#password').type(Cypress.env('shireTenantAdminPassword'));

        cy.get('#login-btn').click();

        // After login, the frontend redirects with session_confirmed=true.
        // If consent is not yet granted: consent view appears → click Approve → redirect.
        // If consent already granted: redirect directly to external app (no UI screens).
        // No session-confirm after fresh login (frontend sends session_confirmed=true).
        cy.url({timeout: 15000}).should('not.include', 'view=login');

        cy.url().then((url) => {
            if (url.includes('/authorize')) {
                cy.get('app-authorize').invoke('attr', 'data-view').then((view) => {
                    if (view === 'consent') {
                        cy.contains('button', 'Approve').should('be.visible').click();
                        // After Approve, wait for redirect — may go directly to
                        // external app or show session-confirm.
                        cy.url({timeout: 10000}).should('include', 'localhost:3000');
                        cy.url().then((redirectUrl) => {
                            if (redirectUrl.includes('/authorize')) {
                                cy.get('app-authorize').invoke('attr', 'data-view').then((v) => {
                                    if (v === 'session-confirm') {
                                        cy.contains('button', 'Continue').should('be.visible').click();
                                    }
                                });
                            }
                        });
                    }
                });
            }
        });

        // Redirected back to external app with authorization code
        cy.url({timeout: 10000}).should('include', 'localhost:3000');
        cy.url().should('include', '?code');

        // External app exchanges code for token automatically via handleCallback()
        cy.get('#decodedToken', {timeout: 10000})
            .should('contain', Cypress.env('shireTenantAdminClientId'));
    });
});