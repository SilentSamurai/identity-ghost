import {Injectable, Logger, OnModuleInit} from "@nestjs/common";
import {Environment} from "./config/environment.service";
import {UsersService} from "./services/users.service";
import {RoleService} from "./services/role.service";
import {TenantService} from "./services/tenant.service";
import {GroupService} from "./services/group.service";
import {AppService} from "./services/app.service";
import {ClientService} from "./services/client.service";
import {User} from "./entity/user.entity";
import {readFile} from "fs/promises";
import {Tenant} from "./entity/tenant.entity";
import {RoleEnum} from "./entity/roleEnum";
import {DataSource} from "typeorm/data-source/DataSource";
import {SecurityService} from "./casl/security.service";

@Injectable()
export class StartUpService implements OnModuleInit {
    private readonly logger = new Logger("StartUpService");

    constructor(
        private readonly configService: Environment,
        private readonly usersService: UsersService,
        private readonly tenantService: TenantService,
        private readonly roleService: RoleService,
        private readonly groupService: GroupService,
        private readonly appService: AppService,
        private readonly clientService: ClientService,
        private readonly securityService: SecurityService,
        private dataSource: DataSource,
    ) {
    }

    async onModuleInit(): Promise<any> {
        await this.dataSource.runMigrations({
            transaction: "all",
        });
        if (!this.configService.isProduction()) {
            await this.populateDummyUsers();
            await this.createDummyTenantAndUser();
            await this.createDummyAppsGroupsRoles();
        }
        await this.createAdminUser();
        await this.populateGlobalTenant();
    }

    async createAdminUser() {
        try {
            let adminContext =
                await this.securityService.getContextForStartup();
            if (
                !(await this.usersService.existByEmail(
                    adminContext,
                    this.configService.get("SUPER_ADMIN_EMAIL"),
                ))
            ) {
                let user: User = await this.usersService.create(
                    adminContext,
                    this.configService.get("SUPER_ADMIN_PASSWORD"),
                    this.configService.get("SUPER_ADMIN_EMAIL"),
                    this.configService.get("SUPER_ADMIN_NAME"),
                );

                await this.usersService.updateVerified(
                    adminContext,
                    user.id,
                    true,
                );

                const isPresent = await this.usersService.existByEmail(
                    adminContext,
                    "admin@mail.com",
                );

                if (!isPresent) {

                    let normalUser: User = await this.usersService.create(
                        adminContext,
                        "admin9000",
                        "admin@mail.com",
                        "admin",
                    );

                    await this.usersService.updateVerified(
                        adminContext,
                        user.id,
                        true,
                    );
                }
            }
        } catch (exception: any) {
            // Catch user already created.
            console.error(exception);
        }
    }

    async createDummyTenantAndUser(): Promise<void> {
        try {
            // 1) Get admin context for creating data
            const adminContext =
                await this.securityService.getContextForStartup();

            // 3) Define a list of dummy tenants to create
            const dummyTenants = [
                {name: "Shire Tenant", domain: "shire.local", signUp: true},
                {name: "Bree Tenant", domain: "bree.local", signUp: false},
                {name: "Rivendell Tenant", domain: "rivendell.local", signUp: false},
                {name: "Mordor Tenant", domain: "mordor.local", signUp: false},
                {name: "Gondor Tenant", domain: "gondor.local", signUp: true},
                {name: "Rohan Tenant", domain: "rohan.local", signUp: true},
                {name: "Lothlorien Tenant", domain: "lothlorien.local", signUp: false},
                {name: "Mirkwood Tenant", domain: "mirkwood.local", signUp: true},
                {name: "Erebor Tenant", domain: "erebor.local", signUp: false},
                {name: "Isengard Tenant", domain: "isengard.local", signUp: false}
            ];

            // 4) Create each tenant and assign the existing user as owner
            for (const {name, domain, signUp} of dummyTenants) {
                const adminEmail = `admin@${domain}`;
                const isPresent = await this.usersService.existByEmail(
                    adminContext,
                    adminEmail,
                );
                if (isPresent) {
                    continue;
                }

                const adminUser: User = await this.usersService.create(
                    adminContext,
                    "admin9000",
                    adminEmail,
                    "Admin",
                );
                await this.usersService.updateVerified(
                    adminContext,
                    adminUser.id,
                    true,
                );

                const createdTenant: Tenant = await this.tenantService.create(
                    adminContext,
                    name,
                    domain,
                    adminUser,
                );

                if (signUp) {
                    await this.tenantService.updateTenant(
                        adminContext,
                        createdTenant.id,
                        {
                            allowSignUp: true,
                        },
                    );
                }
                this.logger.log(
                    `Created dummy tenant: ${createdTenant.name} (${createdTenant.domain})`,
                );
                this.logger.log(
                    "Admin user used for ownership:",
                    adminUser.email,
                );
            }
        } catch (error) {
            this.logger.error("Error creating multiple dummy tenants:", error);
        }
    }

    async populateDummyUsers(): Promise<void> {
        try {
            const data: string = await readFile("./users.json", "utf8");
            const adminContext =
                await this.securityService.getContextForStartup();
            const users = JSON.parse(data);

            for (const record of users.records) {
                try {
                    const isPresent = await this.usersService.existByEmail(
                        adminContext,
                        record.email,
                    );
                    if (!isPresent) {
                        const user: User = await this.usersService.create(
                            adminContext,
                            record.password,
                            record.email,
                            record.name,
                        );
                        await this.usersService.updateVerified(
                            adminContext,
                            user.id,
                            true,
                        );
                    }
                } catch (exception: any) {
                    console.error(exception);
                }
            }
        } catch (error) {
            console.error("Error populating dummy users:", error);
        }
    }

    async populateGlobalTenant() {
        try {
            let adminContext =
                await this.securityService.getContextForStartup();
            let globalTenantExists = await this.tenantService.existByDomain(
                adminContext,
                this.configService.get("SUPER_TENANT_DOMAIN"),
            );
            if (!globalTenantExists) {
                const user = await this.usersService.findByEmail(
                    adminContext,
                    this.configService.get("SUPER_ADMIN_EMAIL"),
                );
                const tenant: Tenant = await this.tenantService.create(
                    adminContext,
                    this.configService.get("SUPER_TENANT_NAME"),
                    this.configService.get("SUPER_TENANT_DOMAIN"),
                    user,
                );
                const adminRole = await this.roleService.findByNameAndTenant(
                    adminContext,
                    RoleEnum.TENANT_ADMIN,
                    tenant,
                );
                const viewerRole = await this.roleService.findByNameAndTenant(
                    adminContext,
                    RoleEnum.TENANT_VIEWER,
                    tenant,
                );
                const superAdminRole = await this.roleService.create(
                    adminContext,
                    RoleEnum.SUPER_ADMIN,
                    tenant,
                    false,
                );
                await this.roleService.updateUserRoles(
                    adminContext,
                    [adminRole.name, viewerRole.name, superAdminRole.name],
                    tenant,
                    user,
                );

                const normalUser = await this.usersService.findByEmail(
                    adminContext,
                    "admin@mail.com",
                );

                const isMember = await this.tenantService.isMember(adminContext, tenant.id, normalUser)
                if (!isMember) {
                    await this.tenantService.addMember(adminContext, tenant.id, normalUser);

                    await this.roleService.updateUserRoles(
                        adminContext,
                        [viewerRole.name],
                        tenant,
                        normalUser,
                    );
                }
            }
        } catch (e) {
            console.error(e);
        }
    }

    async createDummyAppsGroupsRoles(): Promise<void> {
        try {
            const adminContext = await this.securityService.getContextForStartup();

            const dummyData = [
                {
                    domain: "shire.local",
                    roles: ["Editor", "Reviewer"],
                    groups: ["Hobbits", "Gardeners"],
                    apps: [
                        {name: "Shire Portal", appUrl: "https://portal.shire.local", description: "Main portal for Shire residents"},
                        {name: "Harvest Tracker", appUrl: "https://harvest.shire.local", description: "Track crop yields"},
                    ],
                    clients: [
                        {name: "Shire Web App", redirectUris: ["https://portal.shire.local/callback"], allowedScopes: "openid profile email"},
                        {name: "Shire Mobile", redirectUris: ["https://mobile.shire.local/callback"], allowedScopes: "openid profile", isPublic: true},
                    ],
                },
                {
                    domain: "gondor.local",
                    roles: ["Commander", "Scribe", "Diplomat"],
                    groups: ["Rangers", "Tower Guard", "Council"],
                    apps: [
                        {name: "Gondor Defense", appUrl: "https://defense.gondor.local", description: "Military coordination"},
                        {name: "Archive System", appUrl: "https://archive.gondor.local", description: "Historical records"},
                        {name: "Trade Ledger", appUrl: "https://trade.gondor.local", description: "Commerce tracking"},
                    ],
                    clients: [
                        {name: "Gondor Defense Client", redirectUris: ["https://defense.gondor.local/callback"], allowedScopes: "openid profile"},
                    ],
                },
                {
                    domain: "rohan.local",
                    roles: ["Marshal", "Stable Master"],
                    groups: ["Riders", "Horse Breeders"],
                    apps: [
                        {name: "Rohan Dispatch", appUrl: "https://dispatch.rohan.local", description: "Rider coordination"},
                    ],
                    clients: [],
                },
                {
                    domain: "rivendell.local",
                    roles: ["Loremaster", "Healer"],
                    groups: ["Scholars", "Healers Guild"],
                    apps: [
                        {name: "Library of Imladris", appUrl: "https://library.rivendell.local", description: "Knowledge repository"},
                    ],
                    clients: [
                        {name: "Rivendell Library Client", redirectUris: ["https://library.rivendell.local/callback"], allowedScopes: "openid profile"},
                    ],
                },
            ];

            for (const entry of dummyData) {
                let tenant: Tenant;
                try {
                    tenant = await this.tenantService.findByDomain(adminContext, entry.domain);
                } catch {
                    this.logger.warn(`Tenant ${entry.domain} not found, skipping`);
                    continue;
                }

                for (const roleName of entry.roles) {
                    try {
                        const exists = await this.roleService.findByNameAndTenant(adminContext, roleName, tenant);
                        if (exists) continue;
                    } catch {
                        await this.roleService.create(adminContext, roleName, tenant);
                        this.logger.log(`Created role: ${roleName} in ${entry.domain}`);
                    }
                }

                for (const groupName of entry.groups) {
                    try {
                        const exists = await this.groupService.existsByNameAndTenantId(adminContext, groupName, tenant.id);
                        if (exists) continue;
                        await this.groupService.create(adminContext, groupName, tenant);
                        this.logger.log(`Created group: ${groupName} in ${entry.domain}`);
                    } catch (e) {
                        this.logger.warn(`Group ${groupName} in ${entry.domain} may already exist`);
                    }
                }

                for (const app of entry.apps) {
                    try {
                        await this.appService.createApp(adminContext, tenant.id, app.name, app.appUrl, app.description);
                        this.logger.log(`Created app: ${app.name} in ${entry.domain}`);
                    } catch (e) {
                        this.logger.warn(`App ${app.name} in ${entry.domain} may already exist`);
                    }
                }

                for (const client of entry.clients) {
                    try {
                        await this.clientService.createClient(
                            adminContext,
                            tenant.id,
                            client.name,
                            client.redirectUris,
                            client.allowedScopes,
                            undefined,
                            undefined,
                            undefined,
                            client.isPublic,
                        );
                        this.logger.log(`Created client: ${client.name} in ${entry.domain}`);
                    } catch (e) {
                        this.logger.warn(`Client ${client.name} in ${entry.domain} may already exist`);
                    }
                }
            }
        } catch (error) {
            this.logger.error("Error creating dummy apps/groups/roles:", error);
        }
    }
}
