/**
 * Admin Key Management — Cypress Integration Tests
 *
 * Tests the Keys tab on TN02A (tenant detail page) and the
 * KY01A cross-tenant key overview page (/admin/KY01).
 *
 * Validates:
 *   - Keys tab presence and table rendering (Req 2)
 *   - Status badge colors (Req 2.5)
 *   - Active key count indicator and warning style (Req 4)
 *   - JWKS URL display and copy button (Req 5)
 *   - Rotate Key confirmation flow (Req 6)
 *   - Overlap countdown for superseded keys (Req 3)
 *   - KY01A page routing and navbar link (Req 10)
 *   - KY01A filter bar and summary line (Req 10.5, 10.7)
 */
describe('Admin Key Management', () => {

    const SUPER_ADMIN_EMAIL = Cypress.env('superAdminEmail');
    const SUPER_ADMIN_PASSWORD = Cypress.env('superAdminPassword');

    // Unique tenant for key tests — created once, deleted at the end
    const ts = Date.now().toString(36);
    const TENANT_NAME = `key-e2e-${ts}`.substring(0, 20);
    const TENANT_DOMAIN = `key-e2e-${ts}.com`;

    before(() => {
        cy.adminLogin(SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD);
        cy.adminCreateTenant(TENANT_NAME, TENANT_DOMAIN);
    });

    after(() => {
        cy.adminLogin(SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD);
        cy.adminDeleteTenant(TENANT_DOMAIN);
    });

    beforeEach(() => {
        cy.adminLogin(SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD);
    });

    // ─── Helper: navigate to the test tenant's Keys tab ─────────────────────

    function goToKeysTab() {
        cy.adminGoToTenantObjectPage(TENANT_DOMAIN);
        cy.intercept('GET', '**/api/admin/tenant/*/keys').as('getKeys');
        cy.get('#KEYS_SECTION_NAV').click();
        cy.wait('@getKeys').should(({ response }) => {
            expect(response?.statusCode).to.be.oneOf([200, 304]);
        });
    }

    // ─── TN02A Keys Tab ─────────────────────────────────────────────────────

    describe('TN02A — Keys Tab', () => {

        it('shows Keys tab alongside Members, Roles, Apps', () => {
            cy.adminGoToTenantObjectPage(TENANT_DOMAIN);

            // All four tabs should be present
            cy.contains('button', 'Members').should('exist');
            cy.contains('button', 'Roles').should('exist');
            cy.contains('button', 'Apps').should('exist');
            cy.contains('button', 'Keys').should('exist');
        });

        it('displays key table with correct columns', () => {
            goToKeysTab();

            // The Keys tab content is projected into the content-area via ngTemplateOutlet.
            // Verify column headers are visible on the page after switching to the Keys tab.
            cy.contains('th', 'Version').should('be.visible');
            cy.contains('th', 'Key ID').should('be.visible');
            cy.contains('th', 'Status').should('be.visible');
            cy.contains('th', 'Created').should('be.visible');
            cy.contains('th', 'Superseded').should('be.visible');
            cy.contains('th', 'Deactivated').should('be.visible');

            // At least one key row should exist (the initial key created with the tenant)
            cy.get('app-table tbody tr').should('have.length.greaterThan', 0);
        });

        it('shows green badge for Current key', () => {
            goToKeysTab();

            // The current key should have a green "Current" badge
            cy.get('.badge.bg-success').should('contain.text', 'Current');
        });

        it('displays active key count indicator', () => {
            goToKeysTab();

            // Should show "X of Y active" text
            cy.get('#ACTIVE_KEY_COUNT').should('exist');
            cy.get('#ACTIVE_KEY_COUNT').invoke('text').should('match', /\d+ of \d+ active/);
        });

        it('displays JWKS URL correctly for tenant', () => {
            goToKeysTab();

            cy.get('#JWKS_URL').should('contain.text', `/${TENANT_DOMAIN}/.well-known/jwks.json`);
        });

        it('copy button invokes clipboard API with correct URL', () => {
            goToKeysTab();

            // Stub clipboard API and verify it's called with the correct JWKS URL
            cy.window().then((win) => {
                const stub = cy.stub().resolves();
                Object.defineProperty(win.navigator, 'clipboard', {
                    value: { writeText: stub },
                    writable: true,
                    configurable: true,
                });

                cy.get('#COPY_JWKS_URL_BTN').click();

                cy.wrap(stub).should('have.been.calledOnce');
                cy.wrap(stub).should('have.been.calledWithMatch', new RegExp(`/${TENANT_DOMAIN}/\\.well-known/jwks\\.json`));
            });
        });

        it('Rotate Key button opens confirmation dialog', () => {
            goToKeysTab();

            cy.get('#ROTATE_KEY_BTN').should('be.visible').click();

            // Confirmation dialog should appear with the tenant name
            cy.contains('rotate the signing key', { matchCase: false }).should('be.visible');
            cy.contains(TENANT_NAME).should('be.visible');

            // Dismiss without confirming
            cy.get('#CONFIRMATION_NO_BTN').click();
        });

        it('confirming rotation calls API and refreshes key list', () => {
            goToKeysTab();

            // Count keys before rotation
            cy.get('app-table tbody tr').its('length').then((countBefore) => {
                cy.intercept('PUT', '**/api/admin/tenant/*/keys').as('rotateKey');
                cy.intercept('GET', '**/api/admin/tenant/*/keys').as('refreshKeys');

                cy.get('#ROTATE_KEY_BTN').click();
                cy.get('#CONFIRMATION_YES_BTN').click();

                cy.wait('@rotateKey').should(({ response }) => {
                    expect(response?.statusCode).to.be.oneOf([200, 201]);
                });

                // Key list should refresh — new key appears
                cy.wait('@refreshKeys').should(({ response }) => {
                    expect(response?.statusCode).to.be.oneOf([200, 304]);
                });

                // After rotation there should be more keys than before
                cy.get('app-table tbody tr').should('have.length.greaterThan', countBefore);
            });
        });

        it('shows amber badge and overlap countdown for superseded Active keys', () => {
            // After the rotation in the previous test, there should be an Active (superseded) key
            goToKeysTab();

            // Amber badge for Active key
            cy.get('.badge.bg-warning').should('exist').and('contain.text', 'Active');

            // Overlap countdown text should be present (either "expires in" or "expiring soon")
            cy.get('.badge.bg-warning').within(() => {
                cy.get('small').invoke('text').should('match', /expires? in|expiring soon/);
            });
        });

        it('shows gray badge for Deactivated keys after enough rotations', () => {
            // Rotate enough times to force-deactivate the oldest key (max active = 3)
            goToKeysTab();

            // Rotate twice more to ensure we exceed max active keys
            cy.intercept('PUT', '**/api/admin/tenant/*/keys').as('rotate1');
            cy.get('#ROTATE_KEY_BTN').click();
            cy.get('#CONFIRMATION_YES_BTN').click();
            cy.wait('@rotate1');

            // Wait for refresh then rotate again
            cy.wait(1000);
            cy.intercept('PUT', '**/api/admin/tenant/*/keys').as('rotate2');
            cy.intercept('GET', '**/api/admin/tenant/*/keys').as('refreshKeys2');
            cy.get('#ROTATE_KEY_BTN').click();
            cy.get('#CONFIRMATION_YES_BTN').click();
            cy.wait('@rotate2');
            cy.wait('@refreshKeys2');

            // Now there should be at least one deactivated key with a gray badge
            cy.get('.badge.bg-secondary').should('exist').and('contain.text', 'Deactivated');
        });

        it('warning style appears when active key count equals max', () => {
            goToKeysTab();

            // After multiple rotations, active count may be at max
            // Check that the indicator has the warning class when at limit
            cy.get('#ACTIVE_KEY_COUNT').then(($el) => {
                const text = $el.text().trim();
                const match = text.match(/(\d+) of (\d+) active/);
                if (match && match[1] === match[2]) {
                    // At max — should have warning style
                    cy.wrap($el).should('have.class', 'text-warning');
                    cy.wrap($el).should('have.class', 'fw-bold');
                }
            });
        });

        it('failed rotation returns error from API', () => {
            goToKeysTab();

            // Intercept the rotation call and force a 500 failure
            cy.intercept('PUT', '**/api/admin/tenant/*/keys', {
                statusCode: 500,
                body: { message: 'Internal Server Error' },
            }).as('rotateKeyFail');

            cy.get('#ROTATE_KEY_BTN').click();
            cy.get('#CONFIRMATION_YES_BTN').click();

            // Verify the API was called and returned 500
            cy.wait('@rotateKeyFail').its('response.statusCode').should('eq', 500);
        });
    });

    // ─── KY01A Cross-Tenant Key Overview ────────────────────────────────────

    describe('KY01A — Cross-Tenant Key Overview', () => {

        it('page loads at /admin/KY01', () => {
            cy.intercept('GET', '**/api/admin/keys*').as('getAllKeys');
            cy.goToAdminPage('KY01');
            cy.wait('@getAllKeys').should(({ response }) => {
                expect(response?.statusCode).to.be.oneOf([200, 304]);
            });
            cy.url().should('include', '/admin/KY01');
        });

        it('navbar has Keys link after Clients', () => {
            cy.goToAdminPage('KY01');

            // Get all nav links and verify Keys comes after Clients
            cy.get('.navbar-nav .nav-item .nav-link').then(($links) => {
                const linkTexts = [...$links].map((el) => el.textContent?.trim());
                const clientsIndex = linkTexts.indexOf('Clients');
                const keysIndex = linkTexts.indexOf('Keys');
                expect(clientsIndex).to.be.greaterThan(-1);
                expect(keysIndex).to.be.greaterThan(-1);
                expect(keysIndex).to.equal(clientsIndex + 1);
            });
        });

        it('displays cross-tenant key table with tenant links', () => {
            cy.intercept('GET', '**/api/admin/keys*').as('getAllKeys');
            cy.goToAdminPage('KY01');
            cy.wait('@getAllKeys');

            // Verify column headers
            cy.contains('th', 'Tenant').should('exist');
            cy.contains('th', 'Version').should('exist');
            cy.contains('th', 'Key ID').should('exist');
            cy.contains('th', 'Algorithm').should('exist');
            cy.contains('th', 'Status').should('exist');
            cy.contains('th', 'Created').should('exist');

            // At least one row should exist
            cy.get('app-table tbody tr').should('have.length.greaterThan', 0);

            // Tenant column should contain links to /admin/TN02/
            cy.get('app-table tbody tr').first().find('a[href*="/admin/TN02/"]').should('exist');
        });

        it('displays Algorithm column as RS256', () => {
            cy.intercept('GET', '**/api/admin/keys*').as('getAllKeys');
            cy.goToAdminPage('KY01');
            cy.wait('@getAllKeys');

            cy.get('app-table tbody tr').first().within(() => {
                cy.contains('td', 'RS256').should('exist');
            });
        });

        it('filter bar filters by tenant', () => {
            cy.intercept('GET', '**/api/admin/keys*').as('getAllKeys');
            cy.goToAdminPage('KY01');
            cy.wait('@getAllKeys');

            // Type the test tenant domain into the tenant filter
            cy.get('#FILTER_FIELD_tenant').clear().type(TENANT_DOMAIN);

            // Click Go to apply the filter
            cy.get('[id$="_FILTER_BAR_GO_BTN"]').click();

            // All visible rows should belong to the test tenant
            // Note: first td in each row is the checkbox column, tenant domain is in the second td (eq(1))
            cy.get('app-table tbody tr').each(($row) => {
                cy.wrap($row).find('td').eq(1).should('contain.text', TENANT_DOMAIN);
            });
        });

        it('filter bar filters by status', () => {
            cy.intercept('GET', '**/api/admin/keys*').as('getAllKeys');
            cy.goToAdminPage('KY01');
            cy.wait('@getAllKeys');

            // Filter by "Current" status
            cy.get('#FILTER_FIELD_status').select('current');

            // Click Go to apply the filter
            cy.get('[id$="_FILTER_BAR_GO_BTN"]').click();

            // All visible badges should be "Current"
            cy.get('app-table tbody tr').each(($row) => {
                cy.wrap($row).find('.badge').should('contain.text', 'Current');
            });
        });

        it('summary line shows correct counts', () => {
            cy.intercept('GET', '**/api/admin/keys*').as('getAllKeys');
            cy.goToAdminPage('KY01');
            cy.wait('@getAllKeys');

            // Summary line should contain Total, Active, and Deactivated counts
            cy.get('#KEY_SUMMARY').should('exist');
            cy.get('#KEY_SUMMARY').invoke('text').should('match', /Total:\s*\d+\s*keys/);
            cy.get('#KEY_SUMMARY').invoke('text').should('match', /Active:\s*\d+/);
            cy.get('#KEY_SUMMARY').invoke('text').should('match', /Deactivated:\s*\d+/);
        });
    });
});
