// ***********************************************
// Custom Cypress Commands
// ***********************************************

// Admin-context: login as super-admin and navigate to /admin
Cypress.Commands.add('adminLogin', (email: string, password: string) => {
    cy.clearCookies();
    cy.clearLocalStorage();
    cy.window().then((win) => win.sessionStorage.clear());

    cy.visit(`/login?client_id=${Cypress.env('superAdminClientId')}`);

    cy.get('#username').should('be.visible').type(email);
    cy.get('#password').should('be.visible').type(password);

    cy.intercept('POST', '**/api/oauth/token*').as('authCode');

    cy.get('#login-btn').click();

    cy.wait('@authCode').should((interception) => {
        expect(interception.response?.statusCode).to.be.oneOf([201, 200]);
    });

    cy.url().should('include', '/home');
    cy.visit('/admin');
    cy.url().should('include', '/admin');
});

// User-context: login as tenant user
Cypress.Commands.add('login', (email: string, password: string, domain: string) => {
    cy.clearCookies();
    cy.clearLocalStorage();
    cy.window().then((win) => win.sessionStorage.clear());

    cy.visit(`/login?client_id=${domain}`);

    cy.get('#username').should('be.visible').type(email);
    cy.get('#password').should('be.visible').type(password);

    cy.intercept('POST', '**/api/oauth/token*').as('authCode');

    cy.get('#login-btn').click();

    cy.wait('@authCode').should(({response}) => {
        expect(response?.statusCode).to.be.oneOf([201, 200]);
    });

    cy.url().should('include', '/home');
    cy.contains('Home');
});

// Admin-context: navigate to tenant object page via value help
Cypress.Commands.add('adminGoToTenantObjectPage', (tenantDomain: string) => {
    cy.intercept('GET', '**/api/admin/tenant/*/members').as('getTenantDetails');
    cy.goToAdminPage('TN02');
    cy.get('#Tenant-vh-btn').click();
    cy.get('#FILTER_FIELD_domain').type(tenantDomain);
    cy.get('#default_FILTER_BAR_GO_BTN').click();
    cy.contains('td', tenantDomain).click();
    cy.get('#Tenant_VH_SELECT_BTN').click();
    cy.get('#TN02_SEL_CONT_BTN').click();
    cy.url().should('match', /admin\/TN02\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/);
    cy.wait('@getTenantDetails').should((interception) => {
        expect(interception.response?.statusCode).to.be.oneOf([200, 304]);
    });
});

// Admin-context: create tenant via /admin/TN01
Cypress.Commands.add('adminCreateTenant', (tenantName: string, tenantDomain: string) => {
    cy.goToAdminPage('TN01');
    cy.get('#CREATE_TENANT_DIALOG_BTN').click();
    cy.get('#create\\.tenant\\.name').type(tenantName);
    cy.get('#create\\.tenant\\.domain').type(tenantDomain);
    cy.intercept('POST', '**/tenant/create*').as('createTenant');
    cy.get('#CREATE_TENANT_SUBMIT_BTN').click();
    cy.wait('@createTenant').should((interception) => {
        expect(interception.response?.statusCode).to.be.oneOf([201]);
    });
});

// Admin-context: delete tenant via /admin/TN02
Cypress.Commands.add('adminDeleteTenant', (tenantDomain: string) => {
    cy.adminGoToTenantObjectPage(tenantDomain);
    cy.intercept('DELETE', '**/api/admin/tenant/*').as('DeleteTenant');
    cy.get('#DELETE_TENANT_BTN').click();
    cy.get('#CONFIRMATION_YES_BTN').click();
    cy.wait('@DeleteTenant').should(({response}) => {
        expect(response?.statusCode).to.be.oneOf([200]);
    });
});

// Admin-context: subscribe to app via /admin/TN02
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

    cy.wait('@SubscribeApp').should((interception) => {
        expect(interception.response?.statusCode).to.be.oneOf([201, 200]);
    });
    cy.contains('td', appName).should('exist');
});

// Admin-context: add app to tenant via /admin/TN02
Cypress.Commands.add('adminAddAppToTenant', (domain: string, appName: string, appUrl: string, description: string) => {
    cy.adminGoToTenantObjectPage(domain);
    cy.addAppFromOverview(appName, appUrl, description);
});

Cypress.Commands.add('addAppFromOverview', (appName: string, appUrl: string, description: string) => {
    cy.contains('button', 'Apps').click();
    cy.contains('button', 'Create').click();

    cy.get('input[name="name"]').type(appName);
    cy.get('input[name="appUrl"]').type(appUrl);
    cy.get('textarea[name="description"]').type(description);

    cy.intercept('POST', '**/api/apps/create').as('CreateApp');

    cy.get('.modal-footer').contains('button', 'Create').click();

    cy.wait('@CreateApp').should((interception) => {
        expect(interception.response?.statusCode).to.be.oneOf([201, 200]);
    });

    cy.contains("td", appName).should("exist");
});

// User-context: open tenant overview tile from /home
Cypress.Commands.add('userOpenTenantOverview', () => {
    cy.goToSecurePage('home');
    cy.contains('app-tile', 'Tenant Overview').click();
});

// User-context: open a subscribed app from the tenant overview
Cypress.Commands.add('userOpenSubscribedApp', (appName: string) => {
    cy.contains('button', 'Subscriptions').click();
    cy.contains('td', appName)
        .parent()
        .find('button')
        .contains('View App')
        .click();
});

// User-context: add a member to tenant via /home tenant overview
Cypress.Commands.add('userAddMemberToTenant', (email: string) => {
    cy.userOpenTenantOverview();
    cy.contains('button', 'Members').click();
    cy.get('#OPEN_ADD_MEMBER_DIALOG_BTN').click();
    cy.get('#add\\.member\\.name').type(email);
    cy.intercept('POST', '**/api/tenant/*/members/add').as('createMember');
    cy.get('#ADD_TENANT_MEMBER_BTN').click();
    cy.wait('@createMember').should((interception) => {
        expect(interception.response?.statusCode).to.be.oneOf([201]);
    });
    cy.contains('td', email).should('exist');
});

// User-context: publish an app via /home tenant overview
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
    cy.wait('@publishApp').should((interception) => {
        expect(interception.response?.statusCode).to.be.oneOf([200, 201]);
    });
});

// User-context: open client list from /home
Cypress.Commands.add('userOpenClientList', () => {
    cy.goToSecurePage('home');
    cy.get('#Home_HOME_NAV').click();
    cy.contains('app-tile', 'Clients').click();
    cy.url().should('include', '/CL01/');
});

// Context-neutral commands

Cypress.Commands.add('unsubscribeFromApp', (appName: string) => {
    cy.contains('button', 'Subscriptions').click();
    cy.contains('td', appName)
        .parent()
        .find('button')
        .filter((_i, el) => el.innerHTML.includes('fa-trash'))
        .click();

    cy.intercept('POST', '**/api/apps/*/my/unsubscribe').as('UnsubscribeApp');

    cy.get('#CONFIRMATION_YES_BTN').click();

    cy.wait('@UnsubscribeApp').should((interception) => {
        expect(interception.response?.statusCode).to.be.oneOf([200, 201]);
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
    cy.wait('@DeleteApp').should((interception) => {
        expect(interception.response?.statusCode).to.be.oneOf([200, 201]);
    });
    cy.contains('td', appName).should('not.exist');
});

Cypress.Commands.add('loginWithAmbiguousUser', (email: string, password: string, _clientId: string) => {
    cy.visit('/');
    cy.get('#username').type(email);
    cy.get('#password').type(password);
    cy.intercept('POST', '**/api/oauth/login*').as('login');
    cy.get('#login-btn').click();
    return cy.wait('@login');
});

// Navigate to an admin page (requires adminLogin first)
Cypress.Commands.add('goToAdminPage', (page: string) => {
    const path = page.startsWith('/') ? `/admin${page}` : `/admin/${page}`;
    cy.visit(path);
    cy.url().should('include', '/admin');
});

// Navigate to a secure normal-user page (requires login first)
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