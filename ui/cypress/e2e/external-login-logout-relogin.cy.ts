/**
 * External App OAuth Login → Logout → Re-Login Test
 *
 * Simulates the Portainer-like scenario where a third-party app (localhost:3000)
 * performs an OAuth login, the user logs out, and then attempts to log in again.
 *
 * The critical assertion: the `state` parameter must flow back to the external app
 * on re-login so that CSRF validation succeeds. Previously, the state was lost when
 * the session-confirm page was shown on re-login (existing session detected).
 */
describe('External Login → Logout → Re-Login', () => {
    const email = () => Cypress.env('shireTenantAdminEmail');
    const password = () => Cypress.env('shireTenantAdminPassword');
    const clientId = () => Cypress.env('shireTenantAdminClientId');

    beforeEach(() => {
        cy.visit('/');
    });

    /**
     * Helper: complete the auth flow from whatever page we land on.
     * Waits for session-confirm (the expected path when a session exists),
     * then clicks Continue.
     */
    function completeReloginFlow() {
        // After the first login, the authorize page will find the old auth code
        // and navigate to session-confirm. Wait for that navigation to complete.
        cy.url({timeout: 10000}).should('include', '/session-confirm');
        cy.contains('button', 'Continue').should('be.visible').click();
    }

    it('should preserve state parameter on re-login after logout', () => {
        // ─── First Login ───────────────────────────────────────────────────
        cy.visit('http://localhost:3000/');

        cy.intercept('POST', '**/api/oauth/token*').as('tokenCall');

        cy.get('#login-btn').click();

        cy.url().should('include', '/authorize');

        // Capture the first state value
        let firstState: string;
        cy.url().then((url) => {
            const urlObj = new URL(url);
            firstState = urlObj.searchParams.get('state')!;
            expect(firstState).to.be.a('string').and.not.be.empty;
        });

        cy.get('#username').should('be.visible').type(email());
        cy.get('#password').should('be.visible').type(password());
        cy.get('#login-btn').click();

        // Wait for token exchange to complete
        cy.wait('@tokenCall').then((interception) => {
            expect(interception.response?.statusCode).to.be.oneOf([200, 201]);
        });

        // Verify first login succeeded
        cy.url().should('include', '?code');
        cy.get('#decodedToken').should('not.be.empty');
        cy.get('#login-btn').should('contain', 'Logout');

        // Verify state was present in the callback URL
        cy.url().then((url) => {
            const urlObj = new URL(url);
            const callbackState = urlObj.searchParams.get('state');
            expect(callbackState).to.eq(firstState);
        });

        // ─── Logout (simulate Portainer clearing its session) ──────────────
        cy.window().then((win) => {
            win.sessionStorage.clear();
        });

        // ─── Second Login ──────────────────────────────────────────────────
        cy.visit('http://localhost:3000/');

        cy.intercept('POST', '**/api/oauth/token*').as('tokenCall2');

        cy.get('#login-btn').click();

        // The authorize page will find the old auth code and navigate to session-confirm
        completeReloginFlow();

        // After clicking Continue, the session-confirm page redirects back to the external app
        // with the auth code and state. The token exchange may fail (stale code) but
        // the critical assertion is that state is present in the callback URL.
        cy.url({timeout: 10000}).should('include', 'localhost:3000');

        // Critical assertion: state must be present in the callback URL
        cy.url().then((url) => {
            const urlObj = new URL(url);
            const callbackState = urlObj.searchParams.get('state');
            expect(callbackState).to.be.a('string').and.not.be.empty;
        });
    });

    it('should return state in callback URL when session-confirm is shown', () => {
        const CODE_CHALLENGE = 'dp6NlaokagLZTUjEL7cYPlMchcQdWzRW3bkAEXEti9c';
        const REDIRECT_URI = 'http://localhost:3000/';
        const testState = 'relogin-state-test-value';

        // ─── First: create a session by logging in directly ────────────────
        cy.visit('http://localhost:3000/');
        cy.intercept('POST', '**/api/oauth/token*').as('tokenCall');
        cy.get('#login-btn').click();
        cy.url().should('include', '/authorize');
        cy.get('#username').should('be.visible').type(email());
        cy.get('#password').should('be.visible').type(password());
        cy.get('#login-btn').click();
        cy.wait('@tokenCall');
        cy.get('#decodedToken').should('not.be.empty');

        // ─── Now simulate a new authorize request with a known state ───────
        const params = new URLSearchParams({
            client_id: clientId(),
            redirect_uri: REDIRECT_URI,
            code_challenge: CODE_CHALLENGE,
            code_challenge_method: 'S256',
            response_type: 'code',
            state: testState,
            scope: 'openid profile email',
        });

        cy.visit(`/authorize?${params.toString()}`);

        // Wait for navigation to session-confirm (auth code exists in sessionStorage)
        cy.url({timeout: 10000}).should('include', '/session-confirm');
        cy.contains('button', 'Continue').should('be.visible').click();

        // Verify redirect includes the state parameter
        cy.url({timeout: 10000}).should('include', `state=${testState}`);
        cy.url().should('include', 'code=');
    });

    it('should not lose state when auth code exists in sessionStorage', () => {
        const CODE_CHALLENGE = 'dp6NlaokagLZTUjEL7cYPlMchcQdWzRW3bkAEXEti9c';
        const REDIRECT_URI = 'http://localhost:3000/';
        const testState = 'stale-code-state-test';

        // ─── First login to get a valid auth code in sessionStorage ────────
        cy.visit('http://localhost:3000/');
        cy.intercept('POST', '**/api/oauth/token*').as('tokenCall');
        cy.get('#login-btn').click();
        cy.url().should('include', '/authorize');
        cy.get('#username').should('be.visible').type(email());
        cy.get('#password').should('be.visible').type(password());
        cy.get('#login-btn').click();
        cy.wait('@tokenCall');
        cy.get('#decodedToken').should('not.be.empty');

        // ─── Now visit authorize page directly with a new state ─────────────
        const params = new URLSearchParams({
            client_id: clientId(),
            redirect_uri: REDIRECT_URI,
            code_challenge: CODE_CHALLENGE,
            code_challenge_method: 'S256',
            response_type: 'code',
            state: testState,
            scope: 'openid profile email',
        });

        cy.visit(`/authorize?${params.toString()}`);

        // Wait for navigation to session-confirm
        cy.url({timeout: 10000}).should('include', '/session-confirm');
        cy.contains('button', 'Continue').should('be.visible').click();

        // Critical: state must be present in the redirect
        cy.url({timeout: 10000}).should('include', `state=${testState}`);
    });
});
