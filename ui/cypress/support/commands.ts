// ***********************************************
// This example namespace declaration will help
// with Intellisense and code completion in your
// IDE or Text Editor.
// ***********************************************
// declare namespace Cypress {
//   interface Chainable<Subject = any> {
//     customCommand(param: any): typeof customCommand;
//   }
// }
//
// function customCommand(param: any): void {
//   console.warn(param);
// }
//
// NOTE: You can use it like so:
// Cypress.Commands.add('customCommand', customCommand);
//
// ***********************************************
// This example commands.js shows you how to
// create various custom commands and overwrite
// existing commands.
//
// For more comprehensive examples of custom
// commands please read more here:
// https://on.cypress.io/custom-commands
// ***********************************************
//
//
// -- This is a parent command --
// Cypress.Commands.add("login", (email, password) => { ... })
//
//
// -- This is a child command --
// Cypress.Commands.add("drag", { prevSubject: 'element'}, (subject, options) => { ... })
//
//
// -- This is a dual command --
// Cypress.Commands.add("dismiss", { prevSubject: 'optional'}, (subject, options) => { ... })
//
//
// -- This will overwrite an existing command --
// Cypress.Commands.overwrite("visit", (originalFn, url, options) => { ... })

// @ts-ignore
Cypress.Commands.add('adminLogin', (email: string, password: string) => {
    // Clear all storage so the login page doesn't auto-redirect to /home.
    // The app stores an auth code in sessionStorage that triggers an
    // automatic token exchange on page load if present.
    cy.clearCookies();
    cy.clearLocalStorage();
    cy.window().then((win) => win.sessionStorage.clear());

    // Log in through the regular login page with the auth server's own client_id
    cy.visit('/login?client_id=auth.server.com');

    cy.get('#username').should('be.visible').type(email);
    cy.get('#password').should('be.visible').type(password);

    cy.intercept('POST', '**/api/oauth/token*').as('authCode')

    cy.get('#login-btn').click();

    cy.wait('@authCode').should((interception: any) => {
        const {request, response} = interception;
        expect(response?.statusCode).to.be.oneOf([201, 200]);
    })

    cy.url().should('include', '/home');

    // Navigate to admin section
    cy.visit('/admin');
    cy.url().should('include', '/admin');
});

// @ts-ignore
Cypress.Commands.add('login', (email: string, password: string, domain: string) => {
    // Clear all storage to prevent auto-redirect from a stale auth code in sessionStorage
    cy.clearCookies();
    cy.clearLocalStorage();
    cy.window().then((win) => win.sessionStorage.clear());

    // Ensure we land on the login page with client_id preset so username/password are visible
    cy.visit(`/login?client_id=${domain}`);

    cy.get('#username').should('be.visible').type(email)
    cy.get('#password').should('be.visible').type(password)

    cy.intercept('POST', '**/api/oauth/token*').as('authCode')

    cy.get('#login-btn').click();

    cy.wait('@authCode').should(({request, response}) => {
        expect(response?.statusCode).to.be.oneOf([201, 200]);
        // expect(response && response.body).to.include('authentication_code')
    })

    cy.url().should('include', '/home');

    // Then assert the page title
    cy.contains('Home');
});

// Admin-context: navigate to tenant object page via /admin/TN02 value help
// @ts-ignore
Cypress.Commands.add('adminGoToTenantObjectPage', (tenantDomain: string) => {
    // Register intercept BEFORE any clicks that could trigger the request
    cy.intercept('GET', '**/api/admin/tenant/*/members').as('getTenantDetails');
    cy.goToAdminPage('TN02');
    cy.get('#Tenant-vh-btn').click();
    cy.get('#FILTER_FIELD_domain').type(tenantDomain);
    cy.get('#default_FILTER_BAR_GO_BTN').click();
    cy.contains('td', tenantDomain).click();
    cy.get('#Tenant_VH_SELECT_BTN').click();
    cy.get('#TN02_SEL_CONT_BTN').click();
    cy.url().should('match', /admin\/TN02\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/);
    cy.wait('@getTenantDetails').should((interception: any) => {
        const {response} = interception;
        expect(!!response && response.statusCode).to.be.oneOf([200, 304]);
    });
});

// Admin-context: create tenant via /admin/TN01
// @ts-ignore
Cypress.Commands.add('adminCreateTenant', (tenantName: string, tenantDomain: string) => {
    cy.goToAdminPage('TN01');
    cy.get('#CREATE_TENANT_DIALOG_BTN').click();
    cy.get('#create\\.tenant\\.name').type(tenantName);
    cy.get('#create\\.tenant\\.domain').type(tenantDomain);
    cy.intercept('POST', '**/tenant/create*').as('createTenant');
    cy.get('#CREATE_TENANT_SUBMIT_BTN').click();
    cy.wait('@createTenant').should((interception: any) => {
        const {response} = interception;
        expect(!!response && response.statusCode).to.be.oneOf([201]);
    });
});

// Admin-context: delete tenant via /admin/TN02
// @ts-ignore
Cypress.Commands.add('adminDeleteTenant', (tenantDomain: string) => {
    cy.adminGoToTenantObjectPage(tenantDomain);
    cy.intercept('DELETE', '**/api/admin/tenant/*').as('DeleteTenant');
    cy.get('#DELETE_TENANT_BTN').click();
    cy.get('#CONFIRMATION_YES_BTN').click();
    cy.wait('@DeleteTenant').should(({response}) => {
        expect(response && response.statusCode).to.be.oneOf([200]);
    });
});

// Admin-context: subscribe to app via /admin/TN02
// @ts-ignore
Cypress.Commands.add('adminSubscribeToApp', (tenantDomain: string, appName: string) => {
    cy.adminGoToTenantObjectPage(tenantDomain);
    cy.subscribeAppFromOverview(appName);
});

Cypress.Commands.add('subscribeAppFromOverview', (appName: string) => {
    cy.contains('button', 'Subscriptions').click();
    cy.get('#CREATE_SUBSCRIPTION_BTN').click();
    cy.get('.modal-body')
        .contains('td', appName)
        .parent()
        .find('button')
        .contains('Select').click();

    cy.intercept('POST', '**/api/apps/*/my/subscribe').as('SubscribeApp');

    cy.get('#SUBSCRIBE_BTN').click();


    cy.wait('@SubscribeApp').should((interception: any) => {
        const {request, response} = interception;
        expect(!!response && (response.statusCode === 201 || response.statusCode === 200)).to.be.true;
    });
    cy.contains('td', appName).should('exist');
});

// Admin-context: add app to tenant via /admin/TN02
// @ts-ignore
Cypress.Commands.add('adminAddAppToTenant', (domain: string, appName: string, appUrl: string, description: string) => {
    cy.adminGoToTenantObjectPage(domain);
    cy.addAppFromOverview(appName, appUrl, description);
});

Cypress.Commands.add('addAppFromOverview', (appName: string, appUrl: string, description: string) => {

    // Go to the Apps section (assumes already on the tenant object page)
    cy.contains('button', 'Apps').click();
    cy.contains('button', 'Create').click();

    cy.get('input[name="name"]').type(appName);
    cy.get('input[name="appUrl"]').type(appUrl);
    cy.get('textarea[name="description"]').type(description);

    cy.intercept('POST', '**/api/apps/create').as('CreateApp');

    cy.get('.modal-footer').contains('button', 'Create').click();

    cy.wait('@CreateApp').should((interception: any) => {
        const {request, response} = interception;
        expect(!!response && response.statusCode).to.be.oneOf([201, 200]);
    });

    cy.contains("td", appName).should("exist");
});

// User-context: open tenant overview tile from /home
// @ts-ignore
Cypress.Commands.add('userOpenTenantOverview', () => {
    cy.goToSecurePage('home');
    cy.contains('app-tile', 'Tenant Overview').click();
});

// User-context: open a subscribed app from the tenant overview
// @ts-ignore
Cypress.Commands.add('userOpenSubscribedApp', (appName: string) => {
    cy.contains('button', 'Subscriptions').click();
    cy.contains('td', appName)
        .parent()
        .find('button')
        .contains('View App')
        .click();
});

// User-context: add a member to tenant via /home tenant overview
// @ts-ignore
Cypress.Commands.add('userAddMemberToTenant', (email: string) => {
    cy.userOpenTenantOverview();
    cy.contains('button', 'Members').click();
    cy.get('#OPEN_ADD_MEMBER_DIALOG_BTN').click();
    cy.get('#add\\.member\\.name').type(email);
    cy.intercept('POST', '**/api/tenant/*/members/add').as('createMember');
    cy.get('#ADD_TENANT_MEMBER_BTN').click();
    cy.wait('@createMember').should((interception: any) => {
        const {response} = interception;
        expect(response?.statusCode).to.be.oneOf([201]);
    });
    cy.contains('td', email).should('exist');
});

// User-context: publish an app via /home tenant overview
// @ts-ignore
Cypress.Commands.add('userPublishApp', (appName: string) => {
    cy.userOpenTenantOverview();
    cy.contains('button', 'Apps').click();
    cy.intercept('PATCH', '**/api/apps/*/publish').as('publishApp');
    cy.contains('td', appName)
        .parent()
        .find('button')
        .contains('Publish')
        .click();
    cy.get('#CONFIRMATION_YES_BTN').click();
    cy.wait('@publishApp').should((interception: any) => {
        const {response} = interception;
        expect(response?.statusCode).to.be.oneOf([200, 201]);
    });
});

// User-context: open client list from /home
// @ts-ignore
Cypress.Commands.add('userOpenClientList', () => {
    cy.goToSecurePage('home');
    cy.get('#Home_HOME_NAV').click();
    cy.contains('app-tile', 'Clients').click();
    cy.url().should('include', '/CL01/');
});

// Context-neutral commands (work on whatever page you're already on)

Cypress.Commands.add('unsubscribeFromApp', (appName: string) => {
    cy.contains('button', 'Subscriptions').click();
    cy.contains('td', appName)
        .parent()
        .find('button')
        .filter((_i, el) => el.innerHTML.includes('fa-trash'))
        .click();

    cy.intercept('POST', '**/api/apps/*/my/unsubscribe').as('UnsubscribeApp');

    cy.get('#CONFIRMATION_YES_BTN').click();

    cy.wait('@UnsubscribeApp').should((interception: any) => {
        const {response} = interception;
        expect(!!response && (response.statusCode === 200 || response.statusCode === 201)).to.be.true;
    });

    cy.contains('td', appName).should('not.exist');
});

Cypress.Commands.add('deleteAppFromOverview', (appName: string) => {
    cy.contains('button', 'Apps').click();
    cy.contains('td', appName)
        .parent()
        .find('button[data-test-id="delete"]')
        .click();
    cy.intercept('DELETE', '**/api/apps/*').as('DeleteApp');
    cy.get('#CONFIRMATION_YES_BTN').click();
    cy.wait('@DeleteApp').should((interception: any) => {
        const {response} = interception;
        expect(!!response && (response.statusCode === 200 || response.statusCode === 201)).to.be.true;
    });
    cy.contains('td', appName).should('not.exist');
});

// @ts-ignore
Cypress.Commands.add('loginWithAmbiguousUser', (email: string, password: string, _clientId: string) => {
    cy.visit('/');
    cy.get('#username').type(email);
    cy.get('#password').type(password);
    cy.intercept('POST', '**/api/oauth/login*').as('login');
    cy.get('#login-btn').click();
    return cy.wait('@login');
});

// Navigate to an admin page (requires adminLogin first)
// e.g. cy.goToAdminPage('TN01') → /admin/TN01
Cypress.Commands.add('goToAdminPage', (page: string) => {
    const path = page.startsWith('/') ? `/admin${page}` : `/admin/${page}`;
    cy.visit(path);
    cy.url().should('include', '/admin');
});

// Navigate to a secure normal-user page (requires login first)
// e.g. cy.goToSecurePage('home') → /home
Cypress.Commands.add('goToSecurePage', (page: string) => {
    const path = page.startsWith('/') ? page : `/${page}`;
    cy.visit(path);
    cy.url().should('not.include', '/login');
});

Cypress.Commands.add('logout', () => {
    cy.get('#dropdownUser1').click();
    cy.contains('a.dropdown-item', 'Sign Out').click();
    cy.url().should('include', '/login');
});




