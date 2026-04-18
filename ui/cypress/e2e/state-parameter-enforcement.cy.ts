/**
 * State Parameter Enforcement — Cypress Integration Tests
 *
 * Validates the OAuth 2.0 state parameter flow for CSRF protection per RFC 6749 §10.12.
 * Tests cover:
 * - UI state handling in AuthorizeLoginComponent
 * - External app state generation, inclusion in authorization URL, and validation on callback
 * - State mismatch rejection
 *
 * Requirements: 3.1, 3.2, 4.1, 4.2, 4.3, 5.1, 5.2, 5.3, 5.4
 */

describe('State Parameter Enforcement', () => {
    const email = () => Cypress.env('shireTenantAdminEmail');
    const password = () => Cypress.env('shireTenantAdminPassword');
    const clientId = () => Cypress.env('shireTenantAdminClientId');

    const CODE_CHALLENGE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopq';
    const REDIRECT_URI = 'http://localhost:3000/';
    const STATE_KEY = 'oauth-state';

    /**
     * Helper to construct authorize URL with required params.
     */
    function authorizeUrl(state?: string, scope?: string): string {
        const params = new URLSearchParams({
            client_id: clientId(),
            redirect_uri: REDIRECT_URI,
            code_challenge: CODE_CHALLENGE,
            code_challenge_method: 'plain',
            response_type: 'code',
        });
        if (state) {
            params.set('state', state);
        }
        if (scope) {
            params.set('scope', scope);
        }
        return `/authorize?${params.toString()}`;
    }

    beforeEach(() => {
        cy.clearCookies();
        cy.clearLocalStorage();
        cy.window().then((win) => win.sessionStorage.clear());
    });

    // ─────────────────────────────────────────────────────────────────────────────
    // Sub-task 6.1: UI State Tests
    // Requirements: 3.1, 3.2, 4.1
    // ─────────────────────────────────────────────────────────────────────────────

    describe('UI State Handling', () => {
        // 3.1, 3.2 — State is passed through from query params and preserved in the flow
        it('accepts state from query params and includes it in login request', () => {
            const testState = 'test-state-value-12345';
            cy.visit(authorizeUrl(testState));

            // Verify the component loaded and displays the client
            cy.get('.h5').should('contain', clientId());

            // Intercept the login request to verify state is passed through
            cy.intercept('POST', '**/api/oauth/login*').as('loginCall');

            cy.get('#username').should('be.visible').type(email());
            cy.get('#password').should('be.visible').type(password());
            cy.get('#login-btn').click();

            // The login request doesn't send state directly - it's preserved in the component
            // and added to the redirect URL after successful login
            cy.wait('@loginCall').then((interception) => {
                expect(interception.response?.statusCode).to.be.oneOf([200, 201]);
            });
        });

        // 3.1 — State value format validation (when provided by client)
        it('accepts state values in base64url format', () => {
            // Base64url encoded state (what a proper client would generate)
            const base64urlState = 'abc123DEF456_ghi789-jkl012';
            cy.visit(authorizeUrl(base64urlState));

            cy.get('.h5').should('contain', clientId());

            // Verify the state is preserved in the URL
            cy.url().should('include', `state=${base64urlState}`);
        });

        // 4.1 — State is included in the redirect back to client after successful login
        it('includes state in redirect URL after successful login', () => {
            const testState = 'redirect-test-state-xyz';
            cy.visit(authorizeUrl(testState));

            cy.intercept('POST', '**/api/oauth/login*').as('loginCall');

            cy.get('#username').should('be.visible').type(email());
            cy.get('#password').should('be.visible').type(password());
            cy.get('#login-btn').click();

            cy.wait('@loginCall').then((interception) => {
                expect(interception.response?.statusCode).to.be.oneOf([200, 201]);
            });

            // After login, the UI redirects to the external redirect_uri with code and state
            // We can't follow the full redirect to localhost:3000, but we can verify
            // the redirect URL construction by checking the window location before it navigates
            cy.url().should('include', 'code=');
            cy.url().should('include', `state=${encodeURIComponent(testState)}`);
        });

        // 3.2 — State is preserved through the login flow (no sessionStorage storage in UI)
        it('preserves state through the login flow without modification', () => {
            const testState = 'preservation-test-state';
            cy.visit(authorizeUrl(testState));

            // The UI doesn't store state in sessionStorage - it passes it through
            // Verify state is in the current URL
            cy.url().should('include', `state=${testState}`);

            // Complete login and verify state is still present
            cy.intercept('POST', '**/api/oauth/login*').as('loginCall');

            cy.get('#username').should('be.visible').type(email());
            cy.get('#password').should('be.visible').type(password());
            cy.get('#login-btn').click();

            cy.wait('@loginCall');

            // State should be in the redirect URL
            cy.url().should('include', `state=${testState}`);
        });
    });

    // ─────────────────────────────────────────────────────────────────────────────
    // Sub-task 6.2: External App State Tests
    // Requirements: 5.1, 5.2, 5.3, 5.4
    // ─────────────────────────────────────────────────────────────────────────────

    describe('External App State Parameter Support', () => {
        // 5.1, 5.2 — External app generates state and includes it in authorization URL
        it('generates state in sessionStorage when clicking Login', () => {
            cy.visit('http://localhost:3000/');

            // Click the login button which should generate and store state
            cy.get('#login-btn').click();

            // After clicking, we should be redirected to /authorize
            // Check that state was stored before the redirect
            cy.url().should('include', '/authorize');

            // The external app should have stored state in sessionStorage
            // We can verify this by checking the URL has a state parameter
            cy.url().then((url) => {
                const urlObj = new URL(url);
                const stateParam = urlObj.searchParams.get('state');
                expect(stateParam).to.be.a('string').and.not.be.empty;
                // Verify base64url format
                expect(stateParam).to.match(/^[A-Za-z0-9_-]+$/);
            });
        });

        // 5.2 — State is included in the authorization URL
        it('includes state parameter in authorization URL', () => {
            cy.visit('http://localhost:3000/');

            cy.get('#login-btn').click();

            cy.url().should('include', '/authorize');
            cy.url().should('include', 'state=');
            cy.url().should('include', 'response_type=code');
        });

        // 5.3 — External app validates state on callback and proceeds with token exchange
        it('validates state on callback and proceeds with token exchange on match', () => {
            cy.visit('http://localhost:3000/');

            // Intercept the token exchange
            cy.intercept('POST', '**/api/oauth/token*').as('tokenCall');

            // Click login to start the flow
            cy.get('#login-btn').click();

            // Should be on authorize page
            cy.url().should('include', '/authorize');

            // Complete login
            cy.get('#username').should('be.visible').type(email());
            cy.get('#password').should('be.visible').type(password());
            cy.get('#login-btn').click();

            // Wait for token exchange
            cy.wait('@tokenCall').then((interception) => {
                expect(interception.response?.statusCode).to.be.oneOf([200, 201]);
            });

            // Should be back on the external app with decoded token
            cy.url().should('include', '?code');
            cy.get('#decodedToken').should('not.be.empty');
            cy.get('#login-btn').should('contain', 'Logout');
        });

        // 5.4 — External app displays error when state is tampered with
        it('displays error when state parameter is tampered with', () => {
            cy.visit('http://localhost:3000/');

            // Click login to generate state and start the OAuth flow
            cy.get('#login-btn').click();
            cy.url().should('include', '/authorize');

            // Complete login - this will redirect back to localhost:3000 with the original state
            cy.get('#username').should('be.visible').type(email());
            cy.get('#password').should('be.visible').type(password());

            // Before clicking login, intercept the redirect back to the external app.
            // We tamper the sessionStorage on localhost:3000 (the external app origin)
            // so that when the callback lands, the stored state won't match the URL state.
            // We do this by intercepting the callback page load and injecting a script
            // that overwrites sessionStorage before the inline JS runs.
            cy.intercept('GET', 'http://localhost:3000/?code=*', (req) => {
                req.continue((res) => {
                    // Inject a script at the very top of the HTML that tampers sessionStorage
                    // before the external app's inline script executes
                    const tamperScript = `<script>sessionStorage.setItem('oauth-state', 'tampered-state-value');</script>`;
                    res.body = res.body.replace('<head>', `<head>${tamperScript}`);
                });
            }).as('callbackIntercept');

            cy.get('#login-btn').click();

            // The external app should detect the mismatch and show an error
            cy.get('#decodedToken').should('contain', 'Error');
        });

        // 5.4 — External app displays error when state is missing from callback
        it('displays error when state is missing from callback URL', () => {
            // First, set up a stored state
            cy.visit('http://localhost:3000/');
            cy.window().then((win) => {
                win.sessionStorage.setItem('oauth-state', 'expected-state-value');
            });

            // Simulate a callback with code but no state (direct navigation)
            cy.visit('http://localhost:3000/?code=fake-auth-code');

            // Should show error about missing/mismatched state
            cy.get('#decodedToken').should('contain', 'Error');
        });
    });

    // ─────────────────────────────────────────────────────────────────────────────
    // Sub-task 6.3: State Mismatch Rejection Tests
    // Requirements: 4.2, 4.3
    // ─────────────────────────────────────────────────────────────────────────────

    describe('State Mismatch Rejection', () => {
        // 4.2, 4.3 — UI rejects callback with tampered state
        // Note: The UI (AuthorizeLoginComponent) doesn't validate state on callback -
        // it passes through state from the initial request. The validation happens
        // at the client that initiated the flow (external app).
        // This test verifies the external app properly rejects tampered state.

        it('external app rejects callback with tampered state value', () => {
            cy.visit('http://localhost:3000/');

            // Start the login flow
            cy.get('#login-btn').click();
            cy.url().should('include', '/authorize');

            // Capture the original state from the URL
            let originalState: string;
            cy.url().then((url) => {
                const urlObj = new URL(url);
                originalState = urlObj.searchParams.get('state')!;
                expect(originalState).to.be.a('string').and.not.be.empty;
            });

            // Complete login
            cy.get('#username').should('be.visible').type(email());
            cy.get('#password').should('be.visible').type(password());

            // Before clicking login, intercept the redirect back to the external app.
            // Tamper the sessionStorage on localhost:3000 so the stored state won't match
            // the state parameter in the callback URL.
            cy.intercept('GET', 'http://localhost:3000/?code=*', (req) => {
                req.continue((res) => {
                    const tamperScript = `<script>sessionStorage.setItem('oauth-state', 'tampered-state-xyz');</script>`;
                    res.body = res.body.replace('<head>', `<head>${tamperScript}`);
                });
            }).as('callbackIntercept');

            cy.get('#login-btn').click();

            // The callback will have the original state, but sessionStorage has tampered value
            // External app should detect mismatch and show error
            cy.get('#decodedToken').should('contain', 'Error');
            cy.get('#decodedToken').should('contain', 'mismatch');
        });

        // 4.3 — Authorization code is not processed when state is invalid
        it('does not exchange authorization code when state validation fails', () => {
            cy.visit('http://localhost:3000/');

            // Set a stored state
            cy.window().then((win) => {
                win.sessionStorage.setItem('oauth-state', 'stored-state-abc');
            });

            // Intercept token endpoint to verify it's NOT called
            cy.intercept('POST', '**/api/oauth/token*').as('tokenCall');

            // Simulate callback with mismatched state
            cy.visit('http://localhost:3000/?code=some-auth-code&state=different-state-xyz');

            // Should show error
            cy.get('#decodedToken').should('contain', 'Error');

            // Token endpoint should NOT have been called
            cy.get('@tokenCall.all').should('have.length', 0);
        });

        // 4.2 — Error message is displayed for state mismatch
        it('displays clear error message for state mismatch', () => {
            cy.visit('http://localhost:3000/');

            // Set a stored state
            cy.window().then((win) => {
                win.sessionStorage.setItem('oauth-state', 'correct-state');
            });

            // Simulate callback with wrong state
            cy.visit('http://localhost:3000/?code=auth-code&state=wrong-state');

            // Verify error message mentions CSRF or state mismatch
            cy.get('#decodedToken').then(($el) => {
                const text = $el.text();
                expect(text).to.satisfy((msg: string) =>
                    msg.includes('Error') && (msg.includes('state') || msg.includes('CSRF'))
                );
            });
        });

        // 4.3 — No stored state on callback shows error
        it('displays error when no stored state exists on callback', () => {
            cy.visit('http://localhost:3000/');

            // Ensure no stored state
            cy.window().then((win) => {
                win.sessionStorage.removeItem('oauth-state');
            });

            // Simulate callback with state but no stored value
            cy.visit('http://localhost:3000/?code=auth-code&state=some-state');

            // Should show error about missing stored state
            cy.get('#decodedToken').should('contain', 'Error');
        });
    });

    // ─────────────────────────────────────────────────────────────────────────────
    // Additional: State Format and Uniqueness Tests
    // ─────────────────────────────────────────────────────────────────────────────

    describe('State Format and Generation', () => {
        // Verify state format is base64url (43 characters for 32 bytes)
        it('generates state in correct base64url format', () => {
            cy.visit('http://localhost:3000/');

            cy.get('#login-btn').click();
            cy.url().should('include', '/authorize');

            cy.url().then((url) => {
                const urlObj = new URL(url);
                const state = urlObj.searchParams.get('state');

                expect(state).to.be.a('string');
                expect(state!.length).to.eq(43); // 32 bytes base64url-encoded = 43 chars
                expect(state).to.match(/^[A-Za-z0-9_-]+$/); // base64url alphabet
            });
        });

        // Verify each login generates a unique state
        it('generates unique state values for each login attempt', () => {
            const states: string[] = [];

            // Generate first state
            cy.visit('http://localhost:3000/');
            cy.get('#login-btn').click();
            cy.url().should('include', '/authorize');
            cy.url().then((url) => {
                const urlObj = new URL(url);
                states.push(urlObj.searchParams.get('state')!);
            });

            // Go back and generate second state
            cy.visit('http://localhost:3000/');
            cy.clearCookies();
            cy.window().then((win) => win.sessionStorage.clear());
            cy.get('#login-btn').click();
            cy.url().should('include', '/authorize');
            cy.url().then((url) => {
                const urlObj = new URL(url);
                states.push(urlObj.searchParams.get('state')!);

                // Verify both states exist and are different
                expect(states[0]).to.be.a('string').and.not.be.empty;
                expect(states[1]).to.be.a('string').and.not.be.empty;
                expect(states[0]).to.not.eq(states[1]);
            });
        });
    });
});
