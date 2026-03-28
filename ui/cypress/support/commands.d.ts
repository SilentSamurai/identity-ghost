/// <reference types="cypress" />

declare namespace Cypress {
    interface Chainable<Subject = any> {
        // Admin-context commands (require adminLogin first, navigate to /admin/* routes)
        adminLogin(email: string, password: string): Chainable<any>;
        adminGoToTenantObjectPage(tenantDomain: string): Chainable<any>;
        adminCreateTenant(tenantName: string, tenantDomain: string): Chainable<any>;
        adminDeleteTenant(tenantDomain: string): Chainable<any>;
        adminSubscribeToApp(tenantDomain: string, appName: string): Chainable<any>;
        adminAddAppToTenant(domain: string, appName: string, appUrl: string, description: string): Chainable<any>;
        goToAdminPage(page: string): Chainable<any>;

        // User-context commands (require login first, navigate to /home and secure user routes)
        login(email: string, password: string, domain: string): Chainable<any>;
        loginWithAmbiguousUser(email: string, password: string, clientId: string): Chainable<any>;
        goToSecurePage(page: string): Chainable<any>;
        userOpenTenantOverview(): Chainable<any>;
        userOpenSubscribedApp(appName: string): Chainable<any>;
        userAddMemberToTenant(email: string): Chainable<any>;
        userPublishApp(appName: string): Chainable<any>;
        userOpenClientList(): Chainable<any>;

        // Context-neutral commands (work on whatever page you're already on)
        addAppFromOverview(appName: string, appUrl: string, description: string): Chainable<any>;
        subscribeAppFromOverview(appName: string): Chainable<any>;
        unsubscribeFromApp(appName: string): Chainable<any>;
        deleteAppFromOverview(appName: string): Chainable<any>;
        logout(): Chainable<any>;
    }
}
