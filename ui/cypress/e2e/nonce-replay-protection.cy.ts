/**
 * Nonce Replay Protection — Cypress Integration Tests
 *
 * Validates the OIDC nonce flow in the UI: the RP provides a nonce in the
 * authorize request, the UI stores it and sends it in the login request,
 * and omits it when the RP does not provide one.
 *
 * Per OIDC Core §3.1.2.1, the nonce is the RP's responsibility. The authorize
 * UI must forward the RP-provided nonce, not generate its own.
 *
 * Requirements: 3.1, 3.2, 3.4, 4.1, 4.2, 4.3
 */
describe('Nonce Replay Protection', () => {
    const email = () => Cypress.env('shireTenantAdminEmail');
    const password = () => Cypress.env('shireTenantAdminPassword');
    const clientId = () => Cypress.env('shireTenantAdminClientId');

    const CODE_VERIFIER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopq';
    const CODE_CHALLENGE = 'dp6NlaokagLZTUjEL7cYPlMchcQdWzRW3bkAEXEti9c';
    const REDIRECT_URI = 'http://localhost:3000/';
    const NONCE_KEY = 'oidc-nonce';
    const RP_NONCE = 'rp-generated-nonce-abc123';

    function authorizeUrl(opts: { withOpenid: boolean; withNonce?: boolean }): string {
        const params = new URLSearchParams({
            client_id: clientId(),
            redirect_uri: REDIRECT_URI,
            code_challenge: CODE_CHALLENGE,
            code_challenge_method: 'S256',
            response_type: 'code',
        });
        if (opts.withOpenid) {
            params.set('scope', 'openid profile');
        }
        if (opts.withNonce) {
            params.set('nonce', RP_NONCE);
        }
        return `/authorize?${params.toString()}`;
    }

    beforeEach(() => {
        cy.clearCookies();
        cy.clearLocalStorage();
        cy.window().then((win) => win.sessionStorage.clear());
    });

    // 3.1 — RP-provided nonce is stored in sessionStorage
    it('stores RP-provided nonce in sessionStorage', () => {
        cy.visit(authorizeUrl({withOpenid: true, withNonce: true}));

        cy.window().then((win) => {
            const nonce = win.sessionStorage.getItem(NONCE_KEY);
            expect(nonce).to.equal(RP_NONCE);
        });
    });

    // 3.2 — RP-provided nonce is sent in the POST /api/oauth/login request body
    it('sends RP-provided nonce in login request body', () => {
        cy.visit(authorizeUrl({withOpenid: true, withNonce: true}));

        cy.intercept('POST', '**/api/oauth/login*').as('loginCall');

        cy.get('#username').should('be.visible').type(email());
        cy.get('#password').should('be.visible').type(password());
        cy.get('#login-btn').click();

        cy.wait('@loginCall').then((interception) => {
            expect(interception.request.body).to.have.property('nonce');
            expect(interception.request.body.nonce).to.equal(RP_NONCE);
        });
    });

    // 3.4 — No nonce stored or sent when RP does not provide one
    it('does not store or send nonce when RP omits it', () => {
        cy.visit(authorizeUrl({withOpenid: true, withNonce: false}));

        cy.window().then((win) => {
            expect(win.sessionStorage.getItem(NONCE_KEY)).to.be.null;
        });

        cy.intercept('POST', '**/api/oauth/login*').as('loginCall');

        cy.get('#username').should('be.visible').type(email());
        cy.get('#password').should('be.visible').type(password());
        cy.get('#login-btn').click();

        cy.wait('@loginCall').then((interception) => {
            expect(interception.request.body).to.not.have.property('nonce');
        });
    });

    // 3.4b — No nonce stored or sent when openid scope is absent (regardless of nonce param)
    it('does not store or send nonce without openid scope', () => {
        cy.visit(authorizeUrl({withOpenid: false, withNonce: false}));

        cy.window().then((win) => {
            expect(win.sessionStorage.getItem(NONCE_KEY)).to.be.null;
        });

        cy.intercept('POST', '**/api/oauth/login*').as('loginCall');

        cy.get('#username').should('be.visible').type(email());
        cy.get('#password').should('be.visible').type(password());
        cy.get('#login-btn').click();

        cy.wait('@loginCall').then((interception) => {
            expect(interception.request.body).to.not.have.property('nonce');
        });
    });

    // 4.3 — Nonce present in login request when RP provides it
    it('includes RP nonce in login request for successful token exchange', () => {
        cy.visit(authorizeUrl({withOpenid: true, withNonce: true}));

        // Verify nonce exists before login
        cy.window().then((win) => {
            expect(win.sessionStorage.getItem(NONCE_KEY)).to.equal(RP_NONCE);
        });

        cy.intercept('POST', '**/api/oauth/login*').as('loginCall');

        cy.get('#username').should('be.visible').type(email());
        cy.get('#password').should('be.visible').type(password());
        cy.get('#login-btn').click();

        cy.wait('@loginCall').then((interception) => {
            expect(interception.request.body).to.have.property('nonce');
            expect(interception.request.body.nonce).to.equal(RP_NONCE);
            expect(interception.response?.statusCode).to.be.oneOf([200, 201]);
        });
    });

    // 4.1, 4.2 — Nonce mismatch rejection: tampered ID token causes error and session clear
    it('rejects token response when nonce in ID token does not match', () => {
        // Use the /login page (not /authorize) since it does the full token exchange in-app.
        // The login component validates nonce after token exchange.
        cy.visit(`/login?client_id=${clientId()}`);

        // Manually set a nonce in sessionStorage to simulate an openid flow
        cy.window().then((win) => {
            win.sessionStorage.setItem(NONCE_KEY, 'expected-nonce-value');
        });

        // Intercept the token endpoint and inject a fake id_token with a wrong nonce
        cy.intercept('POST', '**/api/oauth/token*', (req) => {
            req.continue((res) => {
                // Build a fake ID token with a wrong nonce claim
                const header = btoa(JSON.stringify({alg: 'none', typ: 'JWT'}))
                    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
                const payload = btoa(JSON.stringify({
                    sub: 'fake-user',
                    nonce: 'wrong-nonce-value',
                    aud: clientId(),
                    exp: Math.floor(Date.now() / 1000) + 3600,
                })).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
                const fakeIdToken = `${header}.${payload}.fakesignature`;

                res.body.id_token = fakeIdToken;
            });
        }).as('tokenCall');

        cy.get('#username').should('be.visible').type(email());
        cy.get('#password').should('be.visible').type(password());
        cy.get('#login-btn').click();

        cy.wait('@tokenCall');

        // The UI should show an authentication error (via PrimeNG toast)
        cy.contains('Authentication failed').should('be.visible');

        // Session should be cleared (auth token not set due to rejection)
        cy.window().then((win) => {
            expect(win.sessionStorage.getItem('auth-token')).to.be.null;
        });
    });
});
