/**
 * PKCE Enforcement E2E Tests
 *
 * Verifies PKCE behavior through the full UI flow using the external app:
 * - Client with requirePkce=false can complete OAuth flow without PKCE
 *   (user clicks login on external app, enters credentials, gets redirected back with token)
 * - Client with requirePkce=true gets an error redirect when no PKCE is provided
 *
 * Uses the isolated "pkce-e2e-test.local" tenant (requirePkce=false by default)
 * and the "Shire PKCE Required" client (requirePkce=true).
 */
describe('PKCE Enforcement', () => {

    const PKCE_E2E_EMAIL = 'admin@pkce-e2e-test.local';
    const PKCE_E2E_PASSWORD = 'admin9000';

    beforeEach(() => {
        cy.visit('/');
    });

    // Full UI flow: external app (no PKCE) → /authorize → enter credentials → redirect back with token
    // Uses the isolated pkce-e2e-test.local tenant which has never used S256
    it('requirePkce=false: full OAuth flow succeeds without PKCE', () => {
        // Visit the external app's no-PKCE page (defaults to pkce-e2e-test.local client)
        cy.visit('http://localhost:3000/no-pkce.html');

        // Click login — this redirects to /api/oauth/authorize without code_challenge
        cy.get('#login-btn').click();

        // Intercept the token exchange to verify it succeeds
        cy.intercept('POST', '**/api/oauth/token*').as('authToken');

        // Should land on the /authorize UI page
        cy.url().should('include', '/authorize');

        // Enter credentials and submit
        cy.get('#username').type(PKCE_E2E_EMAIL);
        cy.get('#password').type(PKCE_E2E_PASSWORD);
        cy.get('#login-btn').click();

        // Wait for token exchange to complete (no code_verifier sent)
        cy.wait('@authToken').should(({response}) => {
            expect(response).to.exist;
            expect(response!.statusCode).to.eq(200);
            expect(response!.body.access_token).to.exist;
        });

        // Should redirect back to external app with decoded token displayed
        cy.url().should('include', 'localhost:3000');
        cy.get('#decodedToken').should('contain', 'pkce-e2e-test.local');
    });

    // Full UI flow: requirePkce=true client → error redirect when no PKCE provided
    it('requirePkce=true: OAuth flow returns error without PKCE', () => {
        // Log in to get the PKCE-required client ID
        cy.login(
            Cypress.env('shireTenantAdminEmail'),
            Cypress.env('shireTenantAdminPassword'),
            Cypress.env('shireTenantAdminClientId'),
        );

        cy.window().then((win) => {
            const token = win.sessionStorage.getItem('auth-token')!;

            cy.request({
                method: 'GET',
                url: '/api/clients/my/clients',
                headers: {Authorization: `Bearer ${token}`},
            }).then((resp) => {
                const pkceClient = resp.body.find((c: any) => c.name === 'Shire PKCE Required');
                expect(pkceClient, 'Seeded client "Shire PKCE Required" not found').to.exist;

                const redirectUri = 'https://pkce-required-e2e.example.com/callback';

                // Call authorize endpoint without code_challenge for a requirePkce=true client
                cy.request({
                    method: 'GET',
                    url: '/api/oauth/authorize',
                    qs: {
                        response_type: 'code',
                        client_id: pkceClient.clientId,
                        redirect_uri: redirectUri,
                        state: 'pkce-required-test',
                        scope: 'openid profile email',
                    },
                    followRedirect: false,
                }).then((authResp) => {
                    // Should redirect with error (not to the login UI)
                    expect(authResp.status).to.eq(302);
                    const location = authResp.headers['location'] as string;
                    const url = new URL(location);
                    expect(url.searchParams.get('error')).to.eq('invalid_request');
                    expect(url.searchParams.get('error_description')).to.contain('code_challenge');
                    expect(url.searchParams.get('state')).to.eq('pkce-required-test');
                });
            });
        });
    });
});
