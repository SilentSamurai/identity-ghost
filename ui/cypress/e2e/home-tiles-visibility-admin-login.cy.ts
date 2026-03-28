/// <reference types="cypress" />

// E2E: Log in as admin@shire.local through the real UI and assert that
// global tiles (guarded by 'all') are NOT visible for a tenant admin.
//
// Requirements:
// - Backend must be running locally
// - Cypress env vars must include ADMIN_EMAIL and ADMIN_PASSWORD for the admin user
//
// Usage examples:
//   npx cypress run --spec cypress/e2e/home-tiles-visibility-admin-login.cy.ts \
//     --env ADMIN_EMAIL=admin@shire.local,ADMIN_PASSWORD=YourPassword
//
//   or set in cypress.config / cypress.env.json.

const CLIENT_ID = 'shire.local';
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

function shouldMaybeSeeTiles(ids: string[]) {
  // Not asserting visibility strictly; only that the test doesn't fail locating them if present
  ids.forEach((id) => cy.contains(id, { matchCase: false }).should('exist'));
}

/**
 * Home Tiles Visibility Test
 *
 * Verifies that a tenant admin (non-super-admin) logged in via /login
 * does NOT see global admin tiles (TN01, UR01, RL01, etc.) on the /home page.
 * These tiles should only be visible to super-admins.
 * Requires ADMIN_EMAIL and ADMIN_PASSWORD Cypress env vars.
 */
describe('Home tiles visibility after real login (tenant admin should not see global tiles)', function () {
  // Logs in as a tenant admin and asserts that all global-scope tiles are hidden
  it('logs in as admin@shire.local and hides global tiles', function () {
    const email = (Cypress.env('ADMIN_EMAIL') as string) || '';
    const password = (Cypress.env('ADMIN_PASSWORD') as string) || '';

    if (!email || !password) {
      cy.log('Skipping: ADMIN_EMAIL and/or ADMIN_PASSWORD not provided');
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

    // Optionally confirm tenant-level tile may exist (TN02), no hard requirement here
    // cy.contains(Tiles.TN02).should('exist');
  });
});
