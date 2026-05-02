import {defineConfig} from 'cypress'

export default defineConfig({

    e2e: {
        baseUrl: 'http://localhost:4200',
        experimentalStudio: true,
        chromeWebSecurity: false,
        experimentalOriginDependencies: true,
    },

    env: {
        superAdminEmail: 'admin@auth.server.com',
        superAdminPassword: 'admin9000',
        superAdminClientId: 'auth.server.com',
        shireTenantAdminEmail: 'admin@shire.local',
        shireTenantAdminPassword: 'admin9000',
        shireTenantAdminClientId: 'shire.local',
        adminTenantUserEmail: 'legolas@mail.com',
        adminTenantUserPassword: 'legolas9000',
    },

})
