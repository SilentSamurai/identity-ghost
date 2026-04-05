/// <reference types="cypress" />

// E2E: Log in as admin@shire.local through the real UI and assert that
// global tiles (guarded by 'all') are NOT visible for a tenant admin.
//
// Requirements:
// - Backend must be running locally
// - Cypress env vars must include tenantAdminEmail and tenantAdminPassword

const CLIENT_ID = Cypress.env('shireTenantAdminClientId');
const Tiles = {
  TN01: 'TN01',
  TNRL01: 'TNRL01',
  TN02: 'TN02',
  UR01: 'UR01',
  UR02: 'UR02',
  RL01: 'RL01',
  RL02: 'RL02',
  AP01: 'AP01',
  GP01: 'GP01',
  GP02: 'GP02',
};

function loginViaUi(username: string, password: string) {
  // Provide client_id to skip step 1 in login form
  cy.visit(`/login?client_id=${CLIENT_ID}`);
  cy.url().should('include', '/login');

  cy.get('input#username').clear().type(username);
  cy.get('input#password').clear().type(password);
  cy.get('button#login-btn').click();

  cy.url({ timeout: 20000 }).should('include', '/home');
}

function shouldNotSeeTiles(ids: string[]) {
  ids.forEach((id) => cy.contains(id).should('not.exist'));
}

/**
 * Home Tiles Visibility Test
 *
 * Verifies that a tenant admin (non-super-admin) logged in via /login
 * does NOT see global admin tiles (TN01, UR01, RL01, etc.) on the /home page.
 * These tiles should only be visible to super-admins.
 */
describe('Home tiles visibility after real login (tenant admin should not see global tiles)', function () {
  // Logs in as a tenant admin and asserts that all global-scope tiles are hidden
  it('logs in as tenant admin and hides global tiles', function () {
    const email = Cypress.env('shireTenantAdminEmail');
    const password = Cypress.env('shireTenantAdminPassword');

    if (!email || !password) {
      cy.log('Skipping: shireTenantAdminEmail and/or shireTenantAdminPassword not provided');
      this.skip();
      return;
    }

    loginViaUi(email, password);

    // Assert that global tiles (guarded by 'all') are NOT visible for tenant admin
    shouldNotSeeTiles([
      Tiles.TN01,
      Tiles.TNRL01,
      Tiles.UR01,
      Tiles.UR02,
      Tiles.RL01,
      Tiles.RL02,
      Tiles.AP01,
      Tiles.GP01,
      Tiles.GP02,
    ]);
  });
});
