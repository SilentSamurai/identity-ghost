/**
 * Authorize Endpoint E2E Tests
 *
 * Verifies the GET /api/oauth/authorize endpoint from the browser's perspective:
 * - Valid requests redirect to the login UI with all params forwarded
 * - Pre-redirect errors (unknown client, bad redirect URI) return JSON errors
 * - Post-redirect errors (missing state, PKCE violations) redirect with error params
 *
 * Uses the seeded "Shire Authorize Test" client (public, redirect URI:
 * https://authorize-e2e.example.com/callback, scopes: openid profile email).
 */
describe('GET /api/oauth/authorize', () => {

    const API_BASE = '/api/oauth/authorize';
    const REDIRECT_URI = 'https://authorize-e2e.example.com/callback';
    const CLIENT_NAME = 'Shire Authorize Test';

    let testClientId: string;

    before(() => {
        // Log in as shire tenant admin to get an access token
        cy.login(
            Cypress.env('shireTenantAdminEmail'),
            Cypress.env('shireTenantAdminPassword'),
            Cypress.env('shireTenantAdminClientId'),
        );

        // Fetch the tenant's clients and find the seeded test client by name
        cy.window().then((win) => {
            const token = win.sessionStorage.getItem('auth-token')!;
            expect(token).to.be.a('string').and.not.be.empty;

            cy.request({
                method: 'GET',
                url: '/api/clients/my/clients',
                headers: { Authorization: `Bearer ${token}` },
            }).then((resp) => {
                expect(resp.status).to.eq(200);
                const client = resp.body.find((c: any) => c.name === CLIENT_NAME);
                expect(client, `Seeded client "${CLIENT_NAME}" not found`).to.exist;
                testClientId = client.clientId;
            });
        });
    });

    // ─── Happy Path ──────────────────────────────────────────────────

    describe('happy path', () => {
        it('redirects to login UI with all params forwarded', () => {
            cy.request({
                method: 'GET',
                url: API_BASE,
                qs: {
                    response_type: 'code',
                    client_id: testClientId,
                    redirect_uri: REDIRECT_URI,
                    state: 'cypress-state-123',
                    scope: 'openid profile',
                    nonce: 'my-nonce-value',
                },
                followRedirect: false,
            }).then((resp) => {
                expect(resp.status).to.eq(302);
                const location = resp.headers['location'] as string;
                expect(location).to.exist;

                const url = new URL(location, Cypress.config('baseUrl'));
                expect(url.pathname).to.eq('/authorize');
                expect(url.searchParams.get('client_id')).to.eq(testClientId);
                expect(url.searchParams.get('redirect_uri')).to.eq(REDIRECT_URI);
                expect(url.searchParams.get('state')).to.eq('cypress-state-123');
                expect(url.searchParams.get('scope')).to.contain('openid');
                expect(url.searchParams.get('nonce')).to.eq('my-nonce-value');
            });
        });
    });

    // ─── Pre-Redirect Errors ─────────────────────────────────────────

    describe('pre-redirect errors (JSON, no redirect)', () => {
        it('returns JSON error for unknown client_id', () => {
            cy.request({
                method: 'GET',
                url: API_BASE,
                qs: {
                    response_type: 'code',
                    client_id: 'totally-unknown-client-id',
                    state: 'test',
                },
                failOnStatusCode: false,
                followRedirect: false,
            }).then((resp) => {
                expect(resp.status).to.eq(400);
                expect(resp.body.error).to.eq('invalid_request');
                expect(resp.body.error_description).to.exist;
            });
        });

        it('returns JSON error for missing response_type', () => {
            cy.request({
                method: 'GET',
                url: API_BASE,
                qs: {
                    client_id: testClientId,
                    redirect_uri: REDIRECT_URI,
                    state: 'test',
                },
                failOnStatusCode: false,
                followRedirect: false,
            }).then((resp) => {
                expect(resp.status).to.eq(400);
                expect(resp.body.error).to.eq('unsupported_response_type');
            });
        });

        it('returns JSON error for invalid response_type', () => {
            cy.request({
                method: 'GET',
                url: API_BASE,
                qs: {
                    response_type: 'token',
                    client_id: testClientId,
                    redirect_uri: REDIRECT_URI,
                    state: 'test',
                },
                failOnStatusCode: false,
                followRedirect: false,
            }).then((resp) => {
                expect(resp.status).to.eq(400);
                expect(resp.body.error).to.eq('unsupported_response_type');
            });
        });

        it('returns JSON error for invalid redirect_uri', () => {
            cy.request({
                method: 'GET',
                url: API_BASE,
                qs: {
                    response_type: 'code',
                    client_id: testClientId,
                    redirect_uri: 'https://evil.example.com/steal',
                    state: 'test',
                },
                failOnStatusCode: false,
                followRedirect: false,
            }).then((resp) => {
                expect(resp.status).to.eq(400);
                expect(resp.body.error).to.eq('invalid_request');
            });
        });
    });

    // ─── Post-Redirect Errors ────────────────────────────────────────

    describe('post-redirect errors (redirect with error params)', () => {
        it('redirects with error when state is missing', () => {
            cy.request({
                method: 'GET',
                url: API_BASE,
                qs: {
                    response_type: 'code',
                    client_id: testClientId,
                    redirect_uri: REDIRECT_URI,
                },
                followRedirect: false,
            }).then((resp) => {
                expect(resp.status).to.eq(302);
                const url = new URL(resp.headers['location'] as string);
                expect(url.origin + url.pathname).to.eq(REDIRECT_URI);
                expect(url.searchParams.get('error')).to.eq('invalid_request');
                expect(url.searchParams.get('error_description')).to.exist;
            });
        });
    });

    // ─── State Round-Trip ────────────────────────────────────────────

    describe('state round-trip', () => {
        it('preserves state exactly in success redirect', () => {
            const stateValue = 'complex-state_with.special/chars=123';
            cy.request({
                method: 'GET',
                url: API_BASE,
                qs: {
                    response_type: 'code',
                    client_id: testClientId,
                    redirect_uri: REDIRECT_URI,
                    state: stateValue,
                },
                followRedirect: false,
            }).then((resp) => {
                expect(resp.status).to.eq(302);
                const url = new URL(resp.headers['location'] as string, Cypress.config('baseUrl'));
                expect(url.searchParams.get('state')).to.eq(stateValue);
            });
        });
    });

    // ─── Scope Handling ──────────────────────────────────────────────

    describe('scope handling', () => {
        it('uses default scopes when scope is omitted', () => {
            cy.request({
                method: 'GET',
                url: API_BASE,
                qs: {
                    response_type: 'code',
                    client_id: testClientId,
                    redirect_uri: REDIRECT_URI,
                    state: 'default-scope',
                },
                followRedirect: false,
            }).then((resp) => {
                expect(resp.status).to.eq(302);
                const url = new URL(resp.headers['location'] as string, Cypress.config('baseUrl'));
                const scope = url.searchParams.get('scope');
                expect(scope).to.exist;
                expect(scope).to.contain('openid');
            });
        });
    });

    // ─── Nonce Validation ────────────────────────────────────────────

    describe('nonce validation', () => {
        it('rejects nonce exceeding 512 characters', () => {
            const longNonce = 'a'.repeat(513);
            cy.request({
                method: 'GET',
                url: API_BASE,
                qs: {
                    response_type: 'code',
                    client_id: testClientId,
                    redirect_uri: REDIRECT_URI,
                    state: 'nonce-too-long',
                    nonce: longNonce,
                },
                followRedirect: false,
            }).then((resp) => {
                expect(resp.status).to.eq(302);
                const url = new URL(resp.headers['location'] as string);
                expect(url.searchParams.get('error')).to.eq('invalid_request');
                expect(url.searchParams.get('error_description')).to.contain('nonce');
                expect(url.searchParams.get('state')).to.eq('nonce-too-long');
            });
        });
    });
});
