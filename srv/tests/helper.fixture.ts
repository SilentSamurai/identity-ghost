import {TestFixture} from "./api-client/client";
import {TenantClient} from "./api-client/tenant-client";
import {RoleClient} from "./api-client/role-client";
import {GroupClient} from "./api-client/group-client";
import {UsersClient} from "./api-client/user-client";
import {AdminTenantClient} from "./api-client/admin-tenant-client";
import {ClientEntityClient} from "./api-client/client-entity-client";

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

}


export function setupConsole() {
    if (
        process.env.CUSTOM_LOG && process.env.CUSTOM_LOG.includes("1")
        // true
    ) {
        global.console = require('console');
    }
}
