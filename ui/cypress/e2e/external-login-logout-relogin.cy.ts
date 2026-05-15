/**
 * External App OAuth Login → Logout → Re-Login Test
 *
 * Simulates the Portainer-like scenario where a third-party app (localhost:3000)
 * performs an OAuth login, the user logs out, and then attempts to log in again.
 *
 * The critical assertion: the `state` parameter must flow back to the external app
 * on re-login so that CSRF validation succeeds. Previously, the state was lost when
 * the session-confirm page was shown on re-login (existing session detected).
 *
 * Key behaviors:
 *  - Consent is DB-backed: once granted, it persists across tests. After the first
 *    test in the suite grants consent, subsequent tests skip the consent screen.
 *  - After a fresh login, the frontend sends session_confirmed=true, so the backend
 *    issues the code directly (no session-confirm). The redirect may happen so fast
 *    that no authorize UI is visible — the browser goes straight to the external app.
 *  - Session-confirm only appears when an existing session (sid cookie) hits
 *    /api/oauth/authorize without session_confirmed=true.
 */
describe('External Login → Logout → Re-Login', () => {
    const email = () => Cypress.env('shireTenantAdminEmail');
    const password = () => Cypress.env('shireTenantAdminPassword');
    const clientId = () => Cypress.env('shireTenantAdminClientId');

    beforeEach(() => {
        cy.clearAllCookies();
        cy.clearAllLocalStorage();
        cy.window().then((win) => win.sessionStorage.clear());
        cy.visit('/');
    });

    /**
     * After submitting the login form, wait for the flow to complete.
     *
     * Three outcomes are possible:
     *  1. Consent view appears (first time for this user/client) → click Approve → redirect
     *  2. Direct redirect to the external app (consent already granted + session_confirmed=true)
     *  3. Session-confirm should NOT appear after a fresh login because the frontend
     *     sends session_confirmed=true, which the backend uses to bypass it.
     *
     * In all cases we end up on the external app with an auth code.
     */
    function loginAndWaitForExternalApp() {
        cy.get('#login-btn').click();

        // Wait for navigation away from the login form, then check what we landed on.
        // After login the frontend redirects to /api/oauth/authorize?session_confirmed=true.
        //   • If consent is already granted: backend 302 → external app directly.
        //   • If consent needed: backend 302 → /authorize?view=consent
        cy.url({timeout: 15000}).should('not.include', 'view=login');

        cy.url().then((url) => {
            if (url.includes('/authorize')) {
                // We're on an authorize view — handle consent if that's what we see.
                cy.get('app-authorize').invoke('attr', 'data-view').then((view) => {
                    if (view === 'consent') {
                        cy.contains('button', 'Approve').should('be.visible').click();
                    }
                    // No session-confirm after fresh login (session_confirmed=true).
                    // After Approve, the backend may issue code directly or show
                    // session-confirm — handle the latter defensively.
                    cy.url({timeout: 10000}).should('include', 'localhost:3000');
                    cy.url().then((redirectUrl) => {
                        // If we're still on /authorize, check for session-confirm
                        if (redirectUrl.includes('/authorize')) {
                            cy.get('app-authorize').invoke('attr', 'data-view').then((v) => {
                                if (v === 'session-confirm') {
                                    cy.contains('button', 'Continue').should('be.visible').click();
                                }
                            });
                        }
                    });
                });
            }
            // If URL already includes localhost:3000, consent was already granted —
            // the browser went straight to the external app. Nothing more to do.
        });

        cy.url({timeout: 10000}).should('include', 'localhost:3000');
        cy.url().should('include', '?code');
        // Wait for the external app to finish its token exchange before
        // navigating away. Without this, Cypress can trigger a visit while
        // the external app's JS is still processing the callback, causing
        // "Cannot read properties of null (reading 'postMessage')" errors.
        cy.get('#decodedToken', {timeout: 10000}).should('not.be.empty');
    }

    /**
     * Helper: complete the auth flow from whatever page we land on.
     * Waits for session-confirm (the expected path when a session exists),
     * then clicks Continue.
     */
    function completeReloginFlow() {
        cy.get('app-authorize[data-view="session-confirm"]', {timeout: 10000}).should('exist');
        cy.contains('button', 'Continue').should('be.visible').click();
    }

    it('should preserve state parameter on re-login after logout', () => {
        // ─── First Login ───────────────────────────────────────────────────
        cy.visit("/");
        cy.visit('http://localhost:3000/');

        cy.get('#login-btn').click();

        cy.url().should('include', '/authorize');

        let firstState: string;
        cy.url().then((url) => {
            const urlObj = new URL(url);
            firstState = urlObj.searchParams.get('state')!;
            expect(firstState).to.be.a('string').and.not.be.empty;
        });

        cy.get('#username').should('be.visible').type(email());
        cy.get('#password').should('be.visible').type(password());

        loginAndWaitForExternalApp();

        cy.get('#login-btn').should('contain', 'Logout');

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

        cy.get('#login-btn').click();

        // The authorize page will find the sid cookie and show session-confirm
        completeReloginFlow();

        // After clicking Continue, redirected back to the external app
        cy.url({timeout: 10000}).should('include', 'localhost:3000');

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

        // ─── First: create a session by logging in ────────────────────────
        cy.visit("/");
        cy.visit('http://localhost:3000/');
        cy.get('#login-btn').click();
        cy.url().should('include', '/authorize');
        cy.get('#username').should('be.visible').type(email());
        cy.get('#password').should('be.visible').type(password());
        loginAndWaitForExternalApp();

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

        cy.visit(`/api/oauth/authorize?${params.toString()}`);

        cy.get('app-authorize[data-view="session-confirm"]', {timeout: 10000}).should('exist');
        cy.contains('button', 'Continue').should('be.visible').click();

        cy.url({timeout: 10000}).should('include', `state=${testState}`);
        cy.url().should('include', 'code=');
    });

    it('should not lose state when auth code exists in sessionStorage', () => {
        const CODE_CHALLENGE = 'dp6NlaokagLZTUjEL7cYPlMchcQdWzRW3bkAEXEti9c';
        const REDIRECT_URI = 'http://localhost:3000/';
        const testState = 'stale-code-state-test';

        // ─── First login to establish a session ───────────────────────────
        cy.visit("/");
        cy.visit('http://localhost:3000/');
        cy.get('#login-btn').click();
        cy.url().should('include', '/authorize');
        cy.get('#username').should('be.visible').type(email());
        cy.get('#password').should('be.visible').type(password());
        loginAndWaitForExternalApp();

        // ─── Now visit /api/oauth/authorize directly with a new state ──────
        const params = new URLSearchParams({
            client_id: clientId(),
            redirect_uri: REDIRECT_URI,
            code_challenge: CODE_CHALLENGE,
            code_challenge_method: 'S256',
            response_type: 'code',
            state: testState,
            scope: 'openid profile email',
        });

        cy.visit(`/api/oauth/authorize?${params.toString()}`);

        cy.get('app-authorize[data-view="session-confirm"]', {timeout: 10000}).should('exist');
        cy.contains('button', 'Continue').should('be.visible').click();

        cy.url({timeout: 10000}).should('include', `state=${testState}`);
    });

    it('session_confirmed=true skips session-confirm and issues code directly', () => {
        const CODE_CHALLENGE = 'dp6NlaokagLZTUjEL7cYPlMchcQdWzRW3bkAEXEti9c';
        const REDIRECT_URI = 'http://localhost:3000/';

        // ─── First login to establish a session ────────────────────────────
        cy.visit("/");
        cy.visit('http://localhost:3000/');
        cy.get('#login-btn').click();
        cy.url().should('include', '/authorize');
        cy.get('#username').should('be.visible').type(email());
        cy.get('#password').should('be.visible').type(password());
        loginAndWaitForExternalApp();

        // ─── Use cy.request with session_confirmed=true ────────────────────
        const state = 'bypass-test-' + Date.now();
        cy.getCookie('sid').then((cookie) => {
            cy.request({
                method: 'GET',
                url: '/api/oauth/authorize',
                qs: {
                    client_id: clientId(),
                    redirect_uri: REDIRECT_URI,
                    code_challenge: CODE_CHALLENGE,
                    code_challenge_method: 'S256',
                    response_type: 'code',
                    state,
                    scope: 'openid profile email',
                    session_confirmed: 'true',
                },
                headers: { Cookie: `sid=${cookie!.value}` },
                followRedirect: false,
            }).then((resp) => {
                expect(resp.status).to.eq(302);
                const location = resp.headers['location'] as string;
                expect(location).to.include(REDIRECT_URI);
                expect(location).to.include('code=');
                expect(location).to.include(`state=${state}`);
            });
        });
    });

    it('Logout from session-confirm clears sid cookie and shows login form', () => {
        const CODE_CHALLENGE = 'dp6NlaokagLZTUjEL7cYPlMchcQdWzRW3bkAEXEti9c';
        const REDIRECT_URI = 'http://localhost:3000/';

        // ─── First login to establish a session ────────────────────────────
        cy.visit("/");
        cy.visit('http://localhost:3000/');
        cy.get('#login-btn').click();
        cy.url().should('include', '/authorize');
        cy.get('#username').should('be.visible').type(email());
        cy.get('#password').should('be.visible').type(password());
        loginAndWaitForExternalApp();

        // ─── Trigger session-confirm via /api/oauth/authorize ──────────────
        const params = new URLSearchParams({
            client_id: clientId(),
            redirect_uri: REDIRECT_URI,
            code_challenge: CODE_CHALLENGE,
            code_challenge_method: 'S256',
            response_type: 'code',
            state: 'logout-test-' + Date.now(),
            scope: 'openid profile email',
        });
        cy.visit(`/api/oauth/authorize?${params.toString()}`);
        cy.get('app-authorize[data-view="session-confirm"]', {timeout: 10000}).should('exist');
        cy.getCookie('sid').should('exist');

        // ─── Click Logout ──────────────────────────────────────────────────
        cy.contains('button', 'Logout').should('be.visible').click();

        cy.get('app-authorize[data-view="login"]', {timeout: 10000}).should('exist');
        cy.get('#username').should('be.visible');
        cy.get('#password').should('be.visible');
        cy.getCookie('sid').should('not.exist');
    });
});
