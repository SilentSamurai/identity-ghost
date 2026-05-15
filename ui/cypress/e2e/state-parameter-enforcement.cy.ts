import { visitAuthorize, interceptAll } from '../support/unified-authorize';

describe('State Parameter Enforcement', () => {
    const email = () => Cypress.env('shireTenantAdminEmail');
    const password = () => Cypress.env('shireTenantAdminPassword');
    const clientId = () => Cypress.env('shireTenantAdminClientId');

    const CODE_CHALLENGE = 'dp6NlaokagLZTUjEL7cYPlMchcQdWzRW3bkAEXEti9c';
    const REDIRECT_URI = 'http://localhost:3000/';

    beforeEach(() => {
        cy.clearCookies();
        cy.clearLocalStorage();
        cy.window().then((win) => win.sessionStorage.clear());
    });

    // ─────────────────────────────────────────────────────────────────────────────
    // Sub-task 6.1: UI State Tests
    // ─────────────────────────────────────────────────────────────────────────────

    describe('UI State Handling', () => {
        it('accepts state from query params and preserves it through login', () => {
            const testState = 'test-state-value-12345';
            interceptAll();

            visitAuthorize({
                view: 'login',
                csrfToken: 'test-csrf-token',
                params: {
                    client_id: clientId(),
                    redirect_uri: REDIRECT_URI,
                    response_type: 'code',
                    state: testState,
                    code_challenge: CODE_CHALLENGE,
                    code_challenge_method: 'S256',
                    scope: 'openid profile email',
                },
            });

            cy.get('.h5').should('contain', clientId());

            cy.get('#username').type(email());
            cy.get('#password').type(password());
            cy.get('#login-btn').click();

            cy.wait('@loginPost').then((interception) => {
                expect(interception.response?.statusCode).to.eq(200);
            });

            cy.wait('@authorizeGet').then((interception) => {
                const url = new URL(interception.request.url);
                expect(url.searchParams.get('state')).to.eq(testState);
            });
        });

        it('accepts state values in base64url format', () => {
            const base64urlState = 'abc123DEF456_ghi789-jkl012';

            visitAuthorize({
                view: 'login',
                csrfToken: 'test-csrf',
                params: {
                    client_id: clientId(),
                    redirect_uri: REDIRECT_URI,
                    response_type: 'code',
                    state: base64urlState,
                    code_challenge: CODE_CHALLENGE,
                    code_challenge_method: 'S256',
                },
            });

            cy.get('.h5').should('contain', clientId());
            cy.url().should('include', `state=${base64urlState}`);
        });

        it('includes state in redirect URL after successful login', () => {
            const testState = 'redirect-test-state-xyz';
            interceptAll();

            visitAuthorize({
                view: 'login',
                csrfToken: 'test-csrf',
                params: {
                    client_id: clientId(),
                    redirect_uri: REDIRECT_URI,
                    response_type: 'code',
                    state: testState,
                    code_challenge: CODE_CHALLENGE,
                    code_challenge_method: 'S256',
                    scope: 'openid profile email',
                },
            });

            cy.get('#username').type(email());
            cy.get('#password').type(password());
            cy.get('#login-btn').click();

            cy.wait('@loginPost');

            cy.wait('@authorizeGet').then((interception) => {
                const url = new URL(interception.request.url);
                expect(url.searchParams.get('state')).to.eq(testState);
                expect(url.searchParams.get('session_confirmed')).to.eq('true');
            });
        });

        it('preserves state through the login flow without modification', () => {
            const testState = 'preservation-test-state';
            interceptAll();

            visitAuthorize({
                view: 'login',
                csrfToken: 'test-csrf',
                params: {
                    client_id: clientId(),
                    redirect_uri: REDIRECT_URI,
                    response_type: 'code',
                    state: testState,
                    code_challenge: CODE_CHALLENGE,
                    code_challenge_method: 'S256',
                },
            });

            cy.url().should('include', `state=${testState}`);

            cy.get('#username').type(email());
            cy.get('#password').type(password());
            cy.get('#login-btn').click();

            cy.wait('@loginPost');

            cy.wait('@authorizeGet').then((interception) => {
                const url = new URL(interception.request.url);
                expect(url.searchParams.get('state')).to.eq(testState);
            });
        });
    });

    // ─────────────────────────────────────────────────────────────────────────────
    // Sub-task 6.2: External App State Tests
    // ─────────────────────────────────────────────────────────────────────────────

    describe('External App State Parameter Support', () => {
        it('generates state in sessionStorage when clicking Login', () => {
            cy.visit('http://localhost:3000/');

            cy.get('#login-btn').click();

            cy.url().should('include', '/authorize');

            cy.url().then((url) => {
                const urlObj = new URL(url);
                const stateParam = urlObj.searchParams.get('state');
                expect(stateParam).to.be.a('string').and.not.be.empty;
                expect(stateParam).to.match(/^[A-Za-z0-9_-]+$/);
            });
        });

        it('includes state parameter in authorization URL', () => {
            cy.visit('http://localhost:3000/');

            cy.get('#login-btn').click();

            cy.url().should('include', '/authorize');
            cy.url().should('include', 'state=');
            cy.url().should('include', 'response_type=code');
        });

        it('validates state on callback and proceeds with token exchange on match', () => {
            cy.visit('http://localhost:3000/');

            cy.intercept('POST', '**/api/oauth/token*').as('tokenCall');

            cy.get('#login-btn').click();

            cy.url().should('include', '/authorize');

            cy.get('#username').should('be.visible').type(email());
            cy.get('#password').should('be.visible').type(password());
            cy.get('#login-btn').click();

            cy.wait('@tokenCall').then((interception) => {
                expect(interception.response?.statusCode).to.be.oneOf([200, 201]);
            });

            cy.url().should('include', '?code');
            cy.get('#decodedToken').should('not.be.empty');
            cy.get('#login-btn').should('contain', 'Logout');
        });

        it('displays error when state parameter is tampered with', () => {
            cy.visit('http://localhost:3000/');

            cy.get('#login-btn').click();
            cy.url().should('include', '/authorize');

            cy.get('#username').should('be.visible').type(email());
            cy.get('#password').should('be.visible').type(password());

            cy.intercept('GET', 'http://localhost:3000/**', (req) => {
                req.continue((res) => {
                    const tamperScript = `<script>sessionStorage.setItem('oauth-state', 'tampered-state-value');</script>`;
                    res.body = res.body.replace('<head>', `<head>${tamperScript}`);
                });
            }).as('callbackIntercept');

            cy.get('#login-btn').click();

            cy.get('#decodedToken').should('contain', 'Error');
        });

        it('displays error when state is missing from callback URL', () => {
            cy.visit('http://localhost:3000/');
            cy.window().then((win) => {
                win.sessionStorage.setItem('oauth-state', 'expected-state-value');
            });

            cy.visit('http://localhost:3000/?code=fake-auth-code');

            cy.get('#decodedToken').should('contain', 'Error');
        });
    });

    // ─────────────────────────────────────────────────────────────────────────────
    // Sub-task 6.3: State Mismatch Rejection Tests
    // ─────────────────────────────────────────────────────────────────────────────

    describe('State Mismatch Rejection', () => {
        it('external app rejects callback with tampered state value', () => {
            cy.visit('http://localhost:3000/');

            cy.get('#login-btn').click();
            cy.url().should('include', '/authorize');

            let originalState: string;
            cy.url().then((url) => {
                const urlObj = new URL(url);
                originalState = urlObj.searchParams.get('state')!;
                expect(originalState).to.be.a('string').and.not.be.empty;
            });

            cy.get('#username').should('be.visible').type(email());
            cy.get('#password').should('be.visible').type(password());

            cy.intercept('GET', 'http://localhost:3000/**', (req) => {
                req.continue((res) => {
                    const tamperScript = `<script>sessionStorage.setItem('oauth-state', 'tampered-state-xyz');</script>`;
                    res.body = res.body.replace('<head>', `<head>${tamperScript}`);
                });
            }).as('callbackIntercept');

            cy.get('#login-btn').click();

            cy.get('#decodedToken').should('contain', 'Error');
            cy.get('#decodedToken').should('contain', 'mismatch');
        });

        it('does not exchange authorization code when state validation fails', () => {
            cy.visit('http://localhost:3000/');

            cy.window().then((win) => {
                win.sessionStorage.setItem('oauth-state', 'stored-state-abc');
            });

            cy.intercept('POST', '**/api/oauth/token*').as('tokenCall');

            cy.visit('http://localhost:3000/?code=some-auth-code&state=different-state-xyz');

            cy.get('#decodedToken').should('contain', 'Error');

            cy.get('@tokenCall.all').should('have.length', 0);
        });

        it('displays clear error message for state mismatch', () => {
            cy.visit('http://localhost:3000/');

            cy.window().then((win) => {
                win.sessionStorage.setItem('oauth-state', 'correct-state');
            });

            cy.visit('http://localhost:3000/?code=auth-code&state=wrong-state');

            cy.get('#decodedToken').then(($el) => {
                const text = $el.text();
                expect(text).to.satisfy((msg: string) =>
                    msg.includes('Error') && (msg.includes('state') || msg.includes('CSRF'))
                );
            });
        });

        it('displays error when no stored state exists on callback', () => {
            cy.visit('http://localhost:3000/');

            cy.window().then((win) => {
                win.sessionStorage.removeItem('oauth-state');
            });

            cy.visit('http://localhost:3000/?code=auth-code&state=some-state');

            cy.get('#decodedToken').should('contain', 'Error');
        });
    });

    // ─────────────────────────────────────────────────────────────────────────────
    // Additional: State Format and Uniqueness Tests
    // ─────────────────────────────────────────────────────────────────────────────

    describe('State Format and Generation', () => {
        it('generates state in correct base64url format', () => {
            cy.visit('http://localhost:3000/');

            cy.get('#login-btn').click();
            cy.url().should('include', '/authorize');

            cy.url().then((url) => {
                const urlObj = new URL(url);
                const state = urlObj.searchParams.get('state');

                expect(state).to.be.a('string');
                expect(state!.length).to.eq(43);
                expect(state).to.match(/^[A-Za-z0-9_-]+$/);
            });
        });

        it('generates unique state values for each login attempt', () => {
            const states: string[] = [];

            cy.visit('http://localhost:3000/');
            cy.get('#login-btn').click();
            cy.url().should('include', '/authorize');
            cy.url().then((url) => {
                const urlObj = new URL(url);
                states.push(urlObj.searchParams.get('state')!);
            });

            cy.visit('http://localhost:3000/');
            cy.clearCookies();
            cy.window().then((win) => win.sessionStorage.clear());
            cy.get('#login-btn').click();
            cy.url().should('include', '/authorize');
            cy.url().then((url) => {
                const urlObj = new URL(url);
                states.push(urlObj.searchParams.get('state')!);

                expect(states[0]).to.be.a('string').and.not.be.empty;
                expect(states[1]).to.be.a('string').and.not.be.empty;
                expect(states[0]).to.not.eq(states[1]);
            });
        });
    });
});
