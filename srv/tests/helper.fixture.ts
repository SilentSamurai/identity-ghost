import {TestFixture} from "./api-client/client";
import {TenantClient} from "./api-client/tenant-client";
import {RoleClient} from "./api-client/role-client";
import {GroupClient} from "./api-client/group-client";
import {UsersClient} from "./api-client/user-client";
import {AdminTenantClient} from "./api-client/admin-tenant-client";
import {ClientEntityClient} from "./api-client/client-entity-client";
import {expect2xx} from "./api-client/client";
import {TokenFixture} from "./token.fixture";

export class HelperFixture {

    public tenant: TenantClient;
    public role: RoleClient;
    public group: GroupClient;
    public user: UsersClient;
    private readonly app: TestFixture;
    private accessToken: string;

    constructor(app: TestFixture, accessToken: string) {
        this.app = app;
        this.accessToken = accessToken;
        this.tenant = new TenantClient(app, accessToken);
        this.role = new RoleClient(app, accessToken);
        this.group = new GroupClient(app, accessToken);
        this.user = new UsersClient(app, accessToken);
    }

    /**
     * Enables the password grant on the default client for a tenant.
     * New tenants are created with allowPasswordGrant=false on their default client,
     * so this must be called before using fetchAccessToken with the tenant domain.
     */
    async enablePasswordGrant(tenantId: string, domain: string): Promise<void> {
        const adminClient = new AdminTenantClient(this.app, this.accessToken);
        const clientEntityClient = new ClientEntityClient(this.app, this.accessToken);
        const tenantClients = await adminClient.getTenantClients(tenantId);
        const defaultClient = tenantClients.find((c: any) => c.alias === domain);
        await clientEntityClient.updateClient(defaultClient.clientId, {allowPasswordGrant: true});
    }

    /**
     * Enables the password grant on a client identified by its UUID clientId.
     * Use this for seeded tenants whose client was created before the alias system,
     * where the client_id used in token requests is the Client entity's clientId (UUID).
     */
    async enablePasswordGrantByClientId(tenantId: string, clientUuid: string): Promise<void> {
        const adminClient = new AdminTenantClient(this.app, this.accessToken);
        const clientEntityClient = new ClientEntityClient(this.app, this.accessToken);
        const tenantClients = await adminClient.getTenantClients(tenantId);
        const target = tenantClients.find((c: any) => c.clientId === clientUuid);
        if (target) {
            await clientEntityClient.updateClient(target.clientId, {allowPasswordGrant: true});
        }
    }

    /**
     * Sets a user's password via the super admin endpoint.
     * Requires the caller to have super admin privileges.
     * 
     * @param userId - The user's ID
     * @param password - The new password to set
     */
    async setUserPassword(userId: string, password: string): Promise<void> {
        const response = await this.app.getHttpServer()
            .put(`/api/users/${userId}/password`)
            .set('Authorization', `Bearer ${this.accessToken}`)
            .set('Accept', 'application/json')
            .send({password, confirmPassword: password});
        expect2xx(response);
    }

    /**
     * Verifies a user's email via the super admin endpoint.
     * Requires the caller to have super admin privileges.
     * 
     * @param email - The user's email address
     * @param verify - Whether to verify (true) or unverify (false) the user
     */
    async verifyUser(email: string, verify: boolean = true): Promise<void> {
        const response = await this.app.getHttpServer()
            .put('/api/users/verify-user')
            .set('Authorization', `Bearer ${this.accessToken}`)
            .set('Accept', 'application/json')
            .send({email, verify});
        expect2xx(response);
    }

    /**
     * Convenience method to create a tenant, enable password grant, add admin, and promote to TENANT_ADMIN.
     * This is a common pattern used across many test suites.
     * 
     * @param name - Tenant name
     * @param domain - Tenant domain
     * @param adminEmail - Admin user email
     * @returns The created tenant and admin user ID
     */
    async createTenantWithAdmin(
        name: string,
        domain: string,
        adminEmail: string,
    ): Promise<{ tenant: any; adminUserId: string }> {
        const adminClient = new AdminTenantClient(this.app, this.accessToken);
        
        // Create tenant
        const tenant = await this.tenant.createTenant(name, domain);
        
        // Enable password grant
        await this.enablePasswordGrant(tenant.id, domain);
        
        // Add admin member
        const addResult = await adminClient.addMembers(tenant.id, [adminEmail]);
        const adminUserId = addResult.members.find((m: any) => m.email === adminEmail).id;
        
        // Promote to TENANT_ADMIN
        await adminClient.updateMemberRoles(tenant.id, adminUserId, ['TENANT_ADMIN']);
        
        return { tenant, adminUserId };
    }

    /**
     * Convenience method to add a user to a tenant with specific roles.
     * 
     * @param tenantId - Target tenant ID
     * @param email - User email
     * @param roles - Roles to assign (e.g., ['TENANT_VIEWER'])
     * @returns The user ID
     */
    async addUserWithRoles(
        tenantId: string,
        email: string,
        roles: string[],
    ): Promise<string> {
        const adminClient = new AdminTenantClient(this.app, this.accessToken);
        
        const addResult = await adminClient.addMembers(tenantId, [email]);
        const userId = addResult.members.find((m: any) => m.email === email).id;
        
        if (roles.length > 0) {
            await adminClient.updateMemberRoles(tenantId, userId, roles);
        }
        
        return userId;
    }

    /**
     * Login as a user and return access token.
     * Convenience wrapper around TokenFixture.fetchAccessToken.
     * 
     * @param email - User email
     * @param password - User password
     * @param domain - Tenant domain (used as client_id)
     * @returns Access token response
     */
    async login(
        email: string,
        password: string,
        domain: string,
    ): Promise<{ accessToken: string; refreshToken: string; jwt: any }> {
        const tokenFixture = new TokenFixture(this.app);
        return tokenFixture.fetchPasswordGrantAccessToken(email, password, domain);
    }

}


export function setupConsole() {
    if (
        process.env.CUSTOM_LOG && process.env.CUSTOM_LOG.includes("1")
        // true
    ) {
        global.console = require('console');
    }
}
