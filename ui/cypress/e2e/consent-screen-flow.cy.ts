/**
 * Consent Screen Flow E2E Tests
 *
 * Full integration tests for the OAuth consent screen. Uses real seeded data:
 * - Tenant: shire.local
 * - User: admin@shire.local / admin9000
 * - Client: "Consent E2E Test" (third-party, public, needs consent)
 *
 * Flow driven by the external app at http://localhost:3000/consent-app.html:
 * 1. Visit consent-app.html — sets client_id/scope/prompt on the login button, clicks it
 * 2. External app builds /api/oauth/authorize URL with PKCE and redirects to backend
 * 3. Backend has no session → redirects to Angular /authorize (login UI)
 * 4. Enter credentials → POST /api/oauth/login → sets sid cookie
 * 5. Angular navigates to /api/oauth/authorize?session_confirmed=true
 * 6. Backend sees sid cookie + third-party client → no prior consent → 302 to /consent
 * 7. Angular consent component loads → fetches session info → renders consent UI
 * 8. User clicks Approve/Deny → JSON POST to /api/oauth/consent
 * 9. Backend processes consent → PRG redirect back to /api/oauth/authorize
 * 10. Backend issues code → redirects back to consent-app.html?code=... (or ?error=...)
 * 11. External app exchanges code for tokens and displays result in DOM
 *
 * Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5
 */
describe('Consent Screen Flow', () => {

    const EXTERNAL_APP_URL = 'http://localhost:3000/consent-app.html';
    // The external app itself is the registered redirect_uri — it handles the callback.
    const REDIRECT_URI = 'http://localhost:3000/consent-app.html';
    const CLIENT_NAME = 'Consent E2E Test';

    const TEST_USER = {
        email: 'admin@shire.local',
        password: 'admin9000',
    };

    let clientId: string;

    before(() => {
        cy.login(TEST_USER.email, TEST_USER.password, 'shire.local');

        cy.window().then((win) => {
            const token = win.sessionStorage.getItem('auth-token')!;
            expect(token, 'auth-token should be present in sessionStorage after login').to.be.a('string').and.not.be.empty;

            cy.request({
                method: 'GET',
                url: '/api/clients/my/clients',
                headers: {Authorization: `Bearer ${token}`},
            }).then((resp) => {
                const client = resp.body.find((c: any) => c.name === CLIENT_NAME);
                expect(client, `Client "${CLIENT_NAME}" should be seeded`).to.exist;
                clientId = client.clientId;
            });
        });
    });

    beforeEach(() => {
        cy.clearCookies();
        cy.clearLocalStorage();
    });

    /**
     * Visit the external consent app, inject clientId/scopes onto the login button,
     * click it, complete login, and wait until the browser lands on /consent.
     *
     * The external app uses REDIRECT_URI (consent-app.html) so after Approve/Deny
     * the browser returns to the external app — no non-existent host involved.
     *
     * Always uses prompt=consent to force the consent screen regardless of prior consent.
     */
    function startAuthorizeFlow(scopes: string[]) {
        // DO NOT REMOVE: Visit "/" first to initialize Cypress within the app's origin.
        // Skipping this causes Cypress to lose track of previous test steps (e.g. the
        // `cy.login()` call in `before()` — the auth token in sessionStorage gets
        // dropped), leading to cryptic failures on subsequent requests.
        cy.visit("/");
        cy.visit(EXTERNAL_APP_URL);

        cy.get('#login-btn')
            .invoke('attr', 'data-client-id', clientId)
            .invoke('attr', 'data-scope', scopes.join(' '))
            .invoke('attr', 'data-prompt', 'consent')
            .click();

        cy.get('#username').should('be.visible').type(TEST_USER.email);
        cy.get('#password').should('be.visible').type(TEST_USER.password);
        cy.get('#login-btn').click();

        cy.get('app-authorize[data-view="consent"]').should('exist');
    }

    // ─── Consent Screen Display ───────────────────────────────────────

    describe('consent screen display', () => {

        it('displays consent screen when login triggers requires_consent', () => {
            startAuthorizeFlow(['openid', 'profile', 'email']);
        });

        it('shows the client name and user email on the consent screen', () => {
            startAuthorizeFlow(['openid', 'profile', 'email']);

            cy.contains(`${clientId} is requesting access`).should('be.visible');
            cy.contains(`Signed in as ${TEST_USER.email}`).should('be.visible');
        });

        it('shows human-readable scope descriptions for all requested scopes', () => {
            startAuthorizeFlow(['openid', 'profile', 'email']);

            cy.contains('Verify your identity').should('be.visible');
            cy.contains('View your profile information (name)').should('be.visible');
            cy.contains('View your email address').should('be.visible');
        });

    });

    // ─── Scope Descriptions ────────────────────────────────────────────

    describe('scope-to-description mapping', () => {

        it('maps openid scope to "Verify your identity"', () => {
            startAuthorizeFlow(['openid']);
            cy.contains('Verify your identity').should('be.visible');
            cy.contains('View your profile information (name)').should('not.exist');
            cy.contains('View your email address').should('not.exist');
        });

        it('maps profile scope to "View your profile information (name)"', () => {
            startAuthorizeFlow(['profile']);
            cy.contains('View your profile information (name)').should('be.visible');
            cy.contains('Verify your identity').should('not.exist');
            cy.contains('View your email address').should('not.exist');
        });

        it('maps email scope to "View your email address"', () => {
            startAuthorizeFlow(['email']);
            cy.contains('View your email address').should('be.visible');
            cy.contains('Verify your identity').should('not.exist');
            cy.contains('View your profile information (name)').should('not.exist');
        });

        it('shows all three scope descriptions when all scopes are requested', () => {
            startAuthorizeFlow(['openid', 'profile', 'email']);
            cy.contains('Verify your identity').should('be.visible');
            cy.contains('View your profile information (name)').should('be.visible');
            cy.contains('View your email address').should('be.visible');
        });

    });

    // ─── Approve Flow ─────────────────────────────────────────────────

    describe('approve flow', () => {

        it('Approve button submits consent and redirects to client with auth code', () => {
            startAuthorizeFlow(['openid', 'profile', 'email']);

            cy.contains('button', 'Approve').click();

            // After consent, flow goes to session-confirm before redirecting to external app
            cy.get('app-authorize[data-view="session-confirm"]', {timeout: 10000}).should('exist');
            cy.contains('button', 'Continue').should('be.visible').click();

            // Backend redirects to consent-app.html?code=... — the external app loads
            cy.origin('http://localhost:3000', () => {
                cy.url().should('include', 'code=');
                cy.get('#auth-code').invoke('text').should('not.be.empty');
            });
        });

        it('Approve button includes all requested scopes in the consent payload', () => {
            // Set up intercept BEFORE starting the flow to ensure we capture the consent POST
            cy.intercept('POST', '**/api/oauth/consent*').as('consentSubmit');

            startAuthorizeFlow(['openid', 'profile', 'email']);

            cy.contains('button', 'Approve').click();

            cy.wait('@consentSubmit').should(({request}) => {
                // Consent component sends JSON with decision, client_id, scope, csrf_token
                const body = request.body;

                expect(body.decision).to.eq('grant');
                expect(body.client_id).to.eq(clientId);
                expect(body.scope).to.include('openid');
                expect(body.scope).to.include('profile');
                expect(body.scope).to.include('email');
            });
        });

    });

    // ─── Deny Flow ───────────────────────────────────────────────────

    describe('deny flow', () => {

        it('Deny button redirects to client redirect_uri with error=access_denied', () => {
            startAuthorizeFlow(['openid', 'profile', 'email']);

            cy.contains('button', 'Deny').click();

            cy.origin('http://localhost:3000', () => {
                cy.get('#error-code').should('have.text', 'access_denied');
                cy.get('#error-description').invoke('text').should('include', 'denied');
            });
        });

        it('Deny redirect preserves the state parameter', () => {
            startAuthorizeFlow(['openid']);

            cy.contains('button', 'Deny').click();

            cy.origin('http://localhost:3000', () => {
                cy.get('#error-code').should('have.text', 'access_denied');
                cy.url().should('include', 'state=');
            });
        });

    });

    // ─── Prompt=consent ───────────────────────────────────────────────

    describe('prompt=consent forces consent screen', () => {

        /**
         * Same as startAuthorizeFlow but with prompt=consent, forcing the consent
         * screen even when the user has previously granted consent.
         */
        function startAuthorizeFlowWithPrompt(scopes: string[]) {
            cy.visit(EXTERNAL_APP_URL);

            cy.get('#login-btn')
                .invoke('attr', 'data-client-id', clientId)
                .invoke('attr', 'data-scope', scopes.join(' '))
                .invoke('attr', 'data-prompt', 'consent')
                .click();

            cy.get('#username').should('be.visible').type(TEST_USER.email);
            cy.get('#password').should('be.visible').type(TEST_USER.password);
            cy.get('#login-btn').click();

            cy.get('app-authorize[data-view="consent"]').should('exist');
        }

        it('prompt=consent forces consent screen even when consent was previously granted', () => {
            // 1. First visit — grant consent so it is stored in DB
            startAuthorizeFlow(['openid', 'profile', 'email']);
            cy.contains('button', 'Approve').click();

            // After consent, flow goes to session-confirm before redirecting to external app
            cy.get('app-authorize[data-view="session-confirm"]', {timeout: 10000}).should('exist');
            cy.contains('button', 'Continue').should('be.visible').click();

            cy.origin('http://localhost:3000', () => {
                cy.get('#auth-code').invoke('text').should('not.be.empty');
            });

            // 2. Clear cookies so there is no active session
            cy.clearCookies();

            // 3. Second visit with prompt=consent — must show consent screen despite prior grant
            startAuthorizeFlowWithPrompt(['openid', 'profile', 'email']);

            cy.contains(`${clientId} is requesting access`).should('be.visible');
        });

        it('prompt=consent forces consent screen when no prior consent exists', () => {
            startAuthorizeFlowWithPrompt(['openid', 'profile', 'email']);

            cy.contains(`${clientId} is requesting access`).should('be.visible');
            cy.contains('Verify your identity').should('be.visible');
        });

    });

});
