/**
 * Consent Screen Flow Tests
 *
 * Tests the full consent screen UI flow from the user's perspective:
 * - Consent screen displays when login triggers a `requires_consent` response
 * - Consent screen shows client name and human-readable scope descriptions
 * - Scope-to-description mapping for openid, profile, and email
 * - "Approve" button submits consent and redirects with auth code
 * - "Deny" button redirects to client with error=access_denied
 *
 * Uses cy.intercept() to mock backend responses rather than hitting a real backend.
 * All tests navigate to /authorize with PKCE params, fill in credentials, and
 * interact with the consent screen as a real user would.
 *
 * Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5
 */
describe('Consent Screen Flow', () => {

    const REDIRECT_URI = 'https://consent-e2e.example.com/callback';
    const CLIENT_ID = 'test-client-id';
    const CLIENT_NAME = 'My Test App';
    const CODE_CHALLENGE = 'test-code-challenge-value';
    const CODE_CHALLENGE_METHOD = 'plain';
    const STATE = 'cypress-consent-state-123';
    const AUTH_CODE = 'test-auth-code-abc123';

    const TEST_USER = {
        email: 'user@example.com',
        password: 'password123',
    };

    /**
     * Navigate to /authorize with all required PKCE params and stub the login
     * endpoint to return a requires_consent response.
     */
    function visitAuthorizeAndStubConsentRequired(requestedScopes: string[]) {
        cy.intercept('POST', '**/api/oauth/login*', {
            statusCode: 200,
            body: {
                requires_consent: true,
                requested_scopes: requestedScopes,
                client_name: CLIENT_NAME,
                client_id: CLIENT_ID,
            },
        }).as('loginRequiresConsent');

        cy.visit(
            `/authorize?client_id=${CLIENT_ID}` +
            `&code_challenge=${CODE_CHALLENGE}` +
            `&code_challenge_method=${CODE_CHALLENGE_METHOD}` +
            `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
            `&state=${STATE}` +
            `&scope=${requestedScopes.join('%20')}` +
            `&response_type=code`,
        );

        cy.get('#username').type(TEST_USER.email);
        cy.get('#password').type(TEST_USER.password);
        cy.get('#login-btn').click();

        cy.wait('@loginRequiresConsent');
    }

    // ─── Consent Screen Display ───────────────────────────────────────

    describe('consent screen display', () => {

        // Validates: Requirement 4.1 — consent screen displays when login triggers requires_consent
        it('displays consent screen when login returns requires_consent', () => {
            visitAuthorizeAndStubConsentRequired(['openid', 'profile', 'email']);

            cy.url().should('include', '/consent');
        });

        // Validates: Requirement 4.2 — consent screen shows client name
        it('shows the client name on the consent screen', () => {
            visitAuthorizeAndStubConsentRequired(['openid', 'profile', 'email']);

            cy.url().should('include', '/consent');
            cy.contains(CLIENT_NAME).should('be.visible');
        });

        // Validates: Requirement 4.1 — consent screen lists requested scopes with descriptions
        it('shows human-readable scope descriptions for all requested scopes', () => {
            visitAuthorizeAndStubConsentRequired(['openid', 'profile', 'email']);

            cy.url().should('include', '/consent');
            cy.contains('Verify your identity').should('be.visible');
            cy.contains('View your profile information (name)').should('be.visible');
            cy.contains('View your email address').should('be.visible');
        });

    });

    // ─── Scope-to-Description Mapping ────────────────────────────────

    describe('scope-to-description mapping', () => {

        // Validates: Requirement 4.5 — openid maps to "Verify your identity"
        it('maps openid scope to "Verify your identity"', () => {
            visitAuthorizeAndStubConsentRequired(['openid']);

            cy.url().should('include', '/consent');
            cy.contains('Verify your identity').should('be.visible');
            cy.contains('View your profile information (name)').should('not.exist');
            cy.contains('View your email address').should('not.exist');
        });

        // Validates: Requirement 4.5 — profile maps to "View your profile information (name)"
        it('maps profile scope to "View your profile information (name)"', () => {
            visitAuthorizeAndStubConsentRequired(['profile']);

            cy.url().should('include', '/consent');
            cy.contains('View your profile information (name)').should('be.visible');
            cy.contains('Verify your identity').should('not.exist');
            cy.contains('View your email address').should('not.exist');
        });

        // Validates: Requirement 4.5 — email maps to "View your email address"
        it('maps email scope to "View your email address"', () => {
            visitAuthorizeAndStubConsentRequired(['email']);

            cy.url().should('include', '/consent');
            cy.contains('View your email address').should('be.visible');
            cy.contains('Verify your identity').should('not.exist');
            cy.contains('View your profile information (name)').should('not.exist');
        });

        // Validates: Requirement 4.5 — all three scopes shown together
        it('shows all three scope descriptions when all scopes are requested', () => {
            visitAuthorizeAndStubConsentRequired(['openid', 'profile', 'email']);

            cy.url().should('include', '/consent');
            cy.contains('Verify your identity').should('be.visible');
            cy.contains('View your profile information (name)').should('be.visible');
            cy.contains('View your email address').should('be.visible');
        });

    });

    // ─── Approve Flow ─────────────────────────────────────────────────

    describe('approve flow', () => {

        // Validates: Requirement 4.3 — Approve button submits consent and redirects with auth code
        it('Approve button submits consent and redirects to client with auth code', () => {
            visitAuthorizeAndStubConsentRequired(['openid', 'profile', 'email']);

            cy.url().should('include', '/consent');

            cy.intercept('POST', '**/api/oauth/consent*', {
                statusCode: 200,
                body: {
                    authentication_code: AUTH_CODE,
                },
            }).as('consentApprove');

            // Intercept the external redirect to prevent cross-origin navigation.
            // When the component sets window.location.href, the browser issues a
            // GET to the redirect URI — we catch it here and return a stub response.
            cy.intercept('GET', `${REDIRECT_URI}*`, {statusCode: 200, body: 'ok'}).as('clientRedirect');

            cy.contains('button', 'Approve').click();

            cy.wait('@consentApprove').should(({request, response}) => {
                expect(response).to.exist;
                expect(response!.statusCode).to.eq(200);
                expect(response!.body.authentication_code).to.eq(AUTH_CODE);
                expect(request.body.consent_action).to.eq('approve');
                expect(request.body.approved_scopes).to.deep.include.members(['openid', 'profile', 'email']);
            });

            // Verify redirect to client redirect_uri with code param
            cy.wait('@clientRedirect').its('request.url').should((url) => {
                expect(url).to.include(REDIRECT_URI);
                expect(url).to.include(`code=${AUTH_CODE}`);
            });
        });

        // Validates: Requirement 4.3 — Approve sends correct fields to consent endpoint
        it('Approve button sends correct consent payload to the backend', () => {
            visitAuthorizeAndStubConsentRequired(['openid', 'email']);

            cy.url().should('include', '/consent');

            cy.intercept('POST', '**/api/oauth/consent*', {
                statusCode: 200,
                body: { authentication_code: AUTH_CODE },
            }).as('consentPayload');

            // Intercept the external redirect to prevent cross-origin navigation
            cy.intercept('GET', `${REDIRECT_URI}*`, {statusCode: 200, body: 'ok'}).as('clientRedirect');

            cy.contains('button', 'Approve').click();

            cy.wait('@consentPayload').should(({request}) => {
                expect(request.body.consent_action).to.eq('approve');
                expect(request.body.client_id).to.eq(CLIENT_ID);
                expect(request.body.code_challenge).to.eq(CODE_CHALLENGE);
                expect(request.body.code_challenge_method).to.eq(CODE_CHALLENGE_METHOD);
                expect(request.body.email).to.eq(TEST_USER.email);
                expect(request.body.password).to.eq(TEST_USER.password);
            });
        });

    });

    // ─── Deny Flow ────────────────────────────────────────────────────

    describe('deny flow', () => {

        // Validates: Requirement 4.4 — Deny button redirects to client with error=access_denied
        it('Deny button redirects to client redirect_uri with error=access_denied', () => {
            visitAuthorizeAndStubConsentRequired(['openid', 'profile', 'email']);

            cy.url().should('include', '/consent');

            cy.intercept('POST', '**/api/oauth/consent*', {
                statusCode: 200,
                body: {
                    error: 'access_denied',
                    error_description: 'The resource owner denied the request',
                },
            }).as('consentDeny');

            // Intercept the external redirect to prevent cross-origin navigation
            cy.intercept('GET', `${REDIRECT_URI}*`, {statusCode: 200, body: 'ok'}).as('clientRedirect');

            cy.contains('button', 'Deny').click();

            cy.wait('@consentDeny').should(({request, response}) => {
                expect(response).to.exist;
                expect(response!.statusCode).to.eq(200);
                expect(response!.body.error).to.eq('access_denied');
                expect(request.body.consent_action).to.eq('deny');
            });

            // Verify redirect to client redirect_uri with error params
            cy.wait('@clientRedirect').its('request.url').should((url) => {
                expect(url).to.include(REDIRECT_URI);
                expect(url).to.include('error=access_denied');
            });
        });

        // Validates: Requirement 4.4 — Deny includes state in redirect
        it('Deny redirect includes state parameter', () => {
            visitAuthorizeAndStubConsentRequired(['openid']);

            cy.url().should('include', '/consent');

            cy.intercept('POST', '**/api/oauth/consent*', {
                statusCode: 200,
                body: {
                    error: 'access_denied',
                    error_description: 'The resource owner denied the request',
                },
            }).as('consentDenyWithState');

            // Intercept the external redirect to prevent cross-origin navigation
            cy.intercept('GET', `${REDIRECT_URI}*`, {statusCode: 200, body: 'ok'}).as('clientRedirect');

            cy.contains('button', 'Deny').click();

            cy.wait('@consentDenyWithState');

            cy.wait('@clientRedirect').its('request.url').should((url) => {
                expect(url).to.include(`state=${STATE}`);
            });
        });

    });

});
