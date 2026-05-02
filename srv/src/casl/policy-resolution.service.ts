import {Injectable, Logger} from "@nestjs/common";
import {InjectRepository} from "@nestjs/typeorm";
import {Repository} from "typeorm";
import {Policy} from "../entity/authorization.entity";
import {Role} from "../entity/role.entity";
import {App} from "../entity/app.entity";
import {UserRole} from "../entity/user.roles.entity";

/**
 * Service for resolving policies for app-owned roles.
 *
 * App-owned roles are identified by the `{appName}:{roleName}` format in tokens.
 * This service fetches the associated Policy records from the owner tenant
 * (where policy.tenant_id = owner_tenant.id).
 *
 * Feature: app-tenant-onboarding
 * Requirements: 3.1
 */
@Injectable()
export class PolicyResolutionService {
    private readonly logger = new Logger(PolicyResolutionService.name);

    constructor(
        @InjectRepository(Policy)
        private readonly policyRepository: Repository<Policy>,
        @InjectRepository(Role)
        private readonly roleRepository: Repository<Role>,
        @InjectRepository(App)
        private readonly appRepository: Repository<App>,
        @InjectRepository(UserRole)
        private readonly userRoleRepository: Repository<UserRole>,
    ) {
    }

    /**
     * Parses an app-owned role name in `{appName}:{roleName}` format.
     * Returns null if the format is invalid.
     */
    parseAppOwnedRoleName(appRoleName: string): { appName: string; roleName: string } | null {
        const separatorIndex = appRoleName.indexOf(':');
        if (separatorIndex === -1) {
            return null;
        }

        const appName = appRoleName.substring(0, separatorIndex);
        const roleName = appRoleName.substring(separatorIndex + 1);

        if (!appName || !roleName) {
            return null;
        }

        return {appName, roleName};
    }

    /**
     * Resolves policies for app-owned roles.
     *
     * For each role name in `{appName}:{roleName}` format:
     * 1. Parse the app name and role name
     * 2. Look up the App by name to get the owner tenant
     * 3. Query the Role entity where app_id IS NOT NULL and name matches
     * 4. Fetch associated Policy records from the owner tenant
     *
     * Handles graceful degradation:
     * - If a role is deleted, it is skipped (no error thrown)
     * - If an app is not found, the role is skipped
     * - If parsing fails, the role is skipped
     *
     * @param appRoleNames Array of role names in `{appName}:{roleName}` format
     * @returns Array of Policy records from the owner tenant(s)
     */
    async resolveAppOwnedPolicies(appRoleNames: string[]): Promise<Policy[]> {
        const allPolicies: Policy[] = [];

        for (const appRoleName of appRoleNames) {
            try {
                const parsed = this.parseAppOwnedRoleName(appRoleName);
                if (!parsed) {
                    this.logger.debug(`Skipping invalid app-owned role format: ${appRoleName}`);
                    continue;
                }

                const {appName, roleName} = parsed;

                // Find the app by name to get the owner tenant
                const app = await this.appRepository.findOne({
                    where: {name: appName},
                    relations: ['owner'],
                });

                if (!app) {
                    this.logger.debug(`App not found for role ${appRoleName}, skipping`);
                    continue;
                }

                // Find the role in the owner tenant with app_id set
                const role = await this.roleRepository.findOne({
                    where: {
                        name: roleName,
                        app: {id: app.id},
                        tenant: {id: app.owner.id},
                    },
                    relations: ['tenant', 'app'],
                });

                if (!role) {
                    this.logger.debug(`Role ${roleName} not found for app ${appName}, skipping`);
                    continue;
                }

                // Fetch policies for this role from the owner tenant
                const policies = await this.policyRepository.find({
                    where: {
                        role: {id: role.id},
                        tenant: {id: app.owner.id},
                    },
                    relations: ['role', 'tenant'],
                });

                allPolicies.push(...policies);
            } catch (error) {
                // Graceful degradation: log and skip on any error
                this.logger.warn(`Error resolving policies for role ${appRoleName}: ${error.message}`);
            }
        }

        return allPolicies;
    }

    /**
     * Checks if a role name is in app-owned format (contains ':' separator).
     */
    isAppOwnedRoleName(roleName: string): boolean {
        return roleName.includes(':');
    }

    /**
     * Filters an array of role names to return only app-owned roles.
     */
    filterAppOwnedRoles(roleNames: string[]): string[] {
        return roleNames.filter(name => this.isAppOwnedRoleName(name));
    }

    /**
     * Resolves app-owned role policies for a specific user in a tenant context.
     *
     * This method queries the `user_roles` table directly to find app-owned role
     * assignments for the user, then fetches the associated policies from the
     * owner tenant. This is needed because the standard `getMemberRoles` method
     * uses the TypeORM ManyToMany relation which joins on the role's tenant_id,
     * making it unable to find cross-tenant app-owned role assignments.
     *
     * Used by `/tenant-user/permissions` where roles come from the database
     * rather than from a JWT token.
     *
     * @param userId The user's ID
     * @param tenantId The tenant context (subscriber tenant)
     * @returns Array of Policy records from the owner tenant(s)
     *
     * Feature: app-tenant-onboarding
     * Requirements: 3.1, 3.4
     */
    async resolveAppOwnedPoliciesForUser(userId: string, tenantId: string): Promise<Policy[]> {
        // Find all user_roles entries for this user in this tenant
        const userRoles = await this.userRoleRepository.find({
            where: {
                userId,
                tenantId,
            },
        });

        if (userRoles.length === 0) return [];

        const allPolicies: Policy[] = [];

        for (const userRole of userRoles) {
            try {
                // Fetch the role with app and tenant relations
                const role = await this.roleRepository.findOne({
                    where: {id: userRole.roleId},
                    relations: ['app', 'tenant'],
                });

                if (!role || !role.app) {
                    // Not an app-owned role, skip (tenant-local roles are handled separately)
                    continue;
                }

                // Fetch policies for this app-owned role from the owner tenant
                const policies = await this.policyRepository.find({
                    where: {
                        role: {id: role.id},
                        tenant: {id: role.tenant.id},
                    },
                    relations: ['role', 'tenant'],
                });

                allPolicies.push(...policies);
            } catch (error) {
                // Graceful degradation: log and skip on any error
                this.logger.warn(`Error resolving app-owned policies for user role ${userRole.roleId}: ${error.message}`);
            }
        }

        return allPolicies;
    }

    /**
     * Fetches app-owned roles for a specific user in a tenant context.
     *
     * This method queries the `user_roles` table directly to find app-owned role
     * assignments for the user. This is needed because the standard `getMemberRoles`
     * method uses the TypeORM ManyToMany relation which joins on the role's tenant_id,
     * making it unable to find cross-tenant app-owned role assignments.
     *
     * Used by token issuance to include app-owned roles in the JWT.
     *
     * @param userId The user's ID
     * @param tenantId The tenant context (subscriber tenant)
     * @returns Array of Role entities with app relation loaded
     *
     * Feature: app-tenant-onboarding
     * Requirements: 7.1, 7.2, 7.3
     */
    async getAppOwnedRolesForUser(userId: string, tenantId: string): Promise<Role[]> {
        // Find all user_roles entries for this user in this tenant
        const userRoles = await this.userRoleRepository.find({
            where: {
                userId,
                tenantId,
            },
        });

        if (userRoles.length === 0) return [];

        const appOwnedRoles: Role[] = [];

        for (const userRole of userRoles) {
            try {
                // Fetch the role with app and tenant relations
                const role = await this.roleRepository.findOne({
                    where: {id: userRole.roleId},
                    relations: ['app', 'tenant'],
                });

                if (!role || !role.app) {
                    // Not an app-owned role, skip
                    continue;
                }

                appOwnedRoles.push(role);
            } catch (error) {
                // Graceful degradation: log and skip on any error
                this.logger.warn(`Error fetching app-owned role ${userRole.roleId}: ${error.message}`);
            }
        }

        return appOwnedRoles;
    }
}
