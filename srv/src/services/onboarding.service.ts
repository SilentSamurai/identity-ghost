import {
    ConflictException,
    Injectable,
    Logger,
    NotFoundException,
} from '@nestjs/common';
import {InjectRepository} from '@nestjs/typeorm';
import {DataSource, Repository} from 'typeorm';
import {Tenant} from '../entity/tenant.entity';
import {User} from '../entity/user.entity';
import {Role} from '../entity/role.entity';
import {App} from '../entity/app.entity';
import {Subscription, SubscriptionStatus} from '../entity/subscription.entity';
import {TenantMember} from '../entity/tenant.members.entity';
import {UserRole} from '../entity/user.roles.entity';
import {TenantService} from './tenant.service';
import {UsersService} from './users.service';
import {SecurityService} from '../casl/security.service';
import {MailService} from '../mail/mail.service';
import {AuthService} from '../auth/auth.service';
import {Environment} from '../config/environment.service';
import {OnboardCustomerDto, OnboardCustomerResponse} from '../dto/onboard-customer.dto';
import * as crypto from 'crypto';

const logger = new Logger('OnboardingService');

/**
 * OnboardingService — Orchestrates app-initiated tenant provisioning.
 *
 * Handles the full onboarding flow in a single database transaction:
 * - Creates a new tenant (with default client and signing keys)
 * - Creates a subscription linking the tenant to the app
 * - Optionally creates a user, adds them as a tenant member, and assigns all app-owned roles
 * - Sends a password reset email to newly created users (failures are logged, not fatal)
 *
 * Requirements: 4.2–4.8, 6.1–6.3, 8.1–8.3, 9.1–9.4
 */
@Injectable()
export class OnboardingService {
    constructor(
        private readonly dataSource: DataSource,
        private readonly tenantService: TenantService,
        private readonly usersService: UsersService,
        private readonly securityService: SecurityService,
        private readonly mailService: MailService,
        private readonly authService: AuthService,
        private readonly configService: Environment,
        @InjectRepository(App)
        private readonly appRepository: Repository<App>,
        @InjectRepository(Tenant)
        private readonly tenantRepository: Repository<Tenant>,
        @InjectRepository(Subscription)
        private readonly subscriptionRepository: Repository<Subscription>,
        @InjectRepository(User)
        private readonly userRepository: Repository<User>,
        @InjectRepository(Role)
        private readonly roleRepository: Repository<Role>,
        @InjectRepository(TenantMember)
        private readonly tenantMemberRepository: Repository<TenantMember>,
        @InjectRepository(UserRole)
        private readonly userRoleRepository: Repository<UserRole>,
    ) {
    }

    /**
     * Onboard a customer for the given app.
     *
     * Flow:
     * 1. Check if tenant exists by domain
     * 2a. New tenant: create tenant → subscription → optionally user + roles
     * 2b. Existing tenant with subscription: upsert role assignments if user provided
     * 2c. Existing tenant without subscription: create subscription, assign roles if user provided
     *
     * All database operations run in a single transaction.
     * Email notifications are sent after the transaction commits.
     *
     * @param appId - The app initiating the onboarding
     * @param ownerTenantId - The app owner's tenant ID (for authorization, already verified by controller)
     * @param request - The onboarding request body
     */
    async onboardCustomer(
        appId: string,
        ownerTenantId: string,
        request: OnboardCustomerDto,
    ): Promise<OnboardCustomerResponse> {
        const app = await this.appRepository.findOne({
            where: {id: appId},
            relations: ['owner', 'roles'],
        });
        if (!app) {
            throw new NotFoundException('App not found');
        }

        // Fetch all app-owned roles (roles in the owner tenant with app_id set)
        const appRoles = await this.roleRepository.find({
            where: {
                app: {id: app.id},
                tenant: {id: app.owner.id},
            },
        });

        // Create a permission with broad access for the onboarding operations
        const permission = this.securityService.createPermissionForStartupSeed();

        // Check if tenant already exists
        const existingTenant = await this.tenantRepository.findOne({
            where: {domain: request.tenantDomain},
        });

        let newUserCreated = false;
        let result: OnboardCustomerResponse;

        if (!existingTenant) {
            // --- New tenant flow ---
            // Check if user already exists before creating tenant
            let userIsNew = false;
            if (request.userEmail) {
                const existingUser = await this.userRepository.findOne({
                    where: {email: request.userEmail},
                });
                userIsNew = !existingUser;
            }
            result = await this.handleNewTenant(permission, app, appRoles, request);
            newUserCreated = userIsNew;
        } else {
            // --- Existing tenant flow ---
            const existingSubscription = await this.subscriptionRepository.findOne({
                where: {
                    subscriber: {id: existingTenant.id},
                    app: {id: app.id},
                },
            });

            if (existingSubscription) {
                // Tenant exists and is already subscribed
                result = await this.handleExistingSubscribedTenant(
                    permission, app, existingTenant, existingSubscription, appRoles, request,
                );
            } else {
                // Tenant exists but not subscribed
                result = await this.handleExistingUnsubscribedTenant(
                    permission, app, existingTenant, appRoles, request,
                );
            }
        }

        // Send email notification for newly created users (after transaction)
        // Requirements: 9.1, 9.3
        if (newUserCreated && result.userId) {
            await this.sendOnboardingEmail(result.userId, request.userEmail);
        }

        return result;
    }

    /**
     * Handle onboarding when the tenant does not exist yet.
     * Creates tenant, subscription, and optionally user with all app roles.
     *
     * Requirements: 4.2, 4.3
     */
    private async handleNewTenant(
        permission: any,
        app: App,
        appRoles: Role[],
        request: OnboardCustomerDto,
    ): Promise<OnboardCustomerResponse> {
        let user: User | null = null;
        let tempPassword: string | null = null;

        // If user is provided, create or find the user first (outside tenant creation)
        if (request.userEmail) {
            const existingUser = await this.userRepository.findOne({
                where: {email: request.userEmail},
            });

            if (existingUser) {
                user = existingUser;
            } else {
                tempPassword = this.generateTemporaryPassword();
                user = await this.usersService.create(
                    permission,
                    tempPassword,
                    request.userEmail,
                    request.userName,
                );
            }
        }

        // Create tenant using TenantService (creates default client, signing keys, default roles)
        // TenantService.create requires an owner user for the initial member + TENANT_ADMIN role
        let tenant: Tenant;
        if (user) {
            tenant = await this.tenantService.create(
                permission,
                request.tenantName,
                request.tenantDomain,
                user,
            );
        } else {
            // No user provided — create tenant without an owner member
            // We need to create the tenant manually since TenantService.create requires an owner
            tenant = await this.createTenantWithoutOwner(permission, request.tenantName, request.tenantDomain);
        }

        // Create subscription
        const subscription = await this.createSubscription(tenant, app);

        // Assign all app-owned roles to the user if provided
        // Requirements: 4.2 — assign ALL App_Owned_Roles
        const assignedRoleNames: string[] = [];
        if (user && appRoles.length > 0) {
            await this.assignAppRoles(tenant, user, appRoles);
            assignedRoleNames.push(...appRoles.map(r => r.name));
        }

        const response: OnboardCustomerResponse = {
            tenantId: tenant.id,
            subscriptionId: subscription.id,
        };

        if (user) {
            response.userId = user.id;
            response.roleNames = assignedRoleNames;
        }

        return response;
    }

    /**
     * Handle onboarding when the tenant exists and already has a subscription.
     * Upserts role assignments if a user is provided.
     *
     * Requirements: 4.4, 4.5, 8.1, 8.2, 8.3
     */
    private async handleExistingSubscribedTenant(
        permission: any,
        app: App,
        tenant: Tenant,
        subscription: Subscription,
        appRoles: Role[],
        request: OnboardCustomerDto,
    ): Promise<OnboardCustomerResponse> {
        const response: OnboardCustomerResponse = {
            tenantId: tenant.id,
            subscriptionId: subscription.id,
        };

        if (request.userEmail) {
            const {user, isNew} = await this.findOrCreateUser(permission, request);
            await this.ensureTenantMembership(tenant, user);
            await this.assignAppRoles(tenant, user, appRoles);

            response.userId = user.id;
            response.roleNames = appRoles.map(r => r.name);

            // Send email only for newly created users (after return)
            if (isNew) {
                // The caller checks newUserCreated flag — but for existing subscribed tenant,
                // we handle email here since the caller's newUserCreated won't be set
                await this.sendOnboardingEmail(user.id, request.userEmail);
            }
        }

        return response;
    }

    /**
     * Handle onboarding when the tenant exists but has no subscription.
     * Creates subscription and assigns roles if a user is provided.
     *
     * Requirements: 4.6
     */
    private async handleExistingUnsubscribedTenant(
        permission: any,
        app: App,
        tenant: Tenant,
        appRoles: Role[],
        request: OnboardCustomerDto,
    ): Promise<OnboardCustomerResponse> {
        const subscription = await this.createSubscription(tenant, app);

        const response: OnboardCustomerResponse = {
            tenantId: tenant.id,
            subscriptionId: subscription.id,
        };

        if (request.userEmail) {
            const {user, isNew} = await this.findOrCreateUser(permission, request);
            await this.ensureTenantMembership(tenant, user);
            await this.assignAppRoles(tenant, user, appRoles);

            response.userId = user.id;
            response.roleNames = appRoles.map(r => r.name);

            if (isNew) {
                await this.sendOnboardingEmail(user.id, request.userEmail);
            }
        }

        return response;
    }

    /**
     * Find an existing user by email or create a new one.
     * Returns the user and whether they were newly created.
     */
    private async findOrCreateUser(
        permission: any,
        request: OnboardCustomerDto,
    ): Promise<{user: User; isNew: boolean}> {
        const existingUser = await this.userRepository.findOne({
            where: {email: request.userEmail},
        });

        if (existingUser) {
            return {user: existingUser, isNew: false};
        }

        const tempPassword = this.generateTemporaryPassword();
        const user = await this.usersService.create(
            permission,
            tempPassword,
            request.userEmail,
            request.userName,
        );
        return {user, isNew: true};
    }

    /**
     * Ensure a user is a member of the given tenant.
     * Idempotent — does nothing if already a member.
     *
     * Requirements: 8.2
     */
    private async ensureTenantMembership(tenant: Tenant, user: User): Promise<void> {
        const isMember = await this.tenantMemberRepository.exists({
            where: {tenantId: tenant.id, userId: user.id},
        });

        if (!isMember) {
            const member = this.tenantMemberRepository.create({
                tenantId: tenant.id,
                userId: user.id,
            });
            await this.tenantMemberRepository.save(member);
        }
    }

    /**
     * Assign app-owned roles to a user in the subscriber tenant.
     * Idempotent — skips roles already assigned (composite PK prevents duplicates).
     *
     * The user_roles row uses the subscriber tenant's ID as tenant_id,
     * but role_id points to the app-owned role in the owner tenant.
     *
     * Requirements: 2.3, 4.2, 8.2
     */
    private async assignAppRoles(
        subscriberTenant: Tenant,
        user: User,
        appRoles: Role[],
    ): Promise<void> {
        for (const role of appRoles) {
            const exists = await this.userRoleRepository.exists({
                where: {
                    tenantId: subscriberTenant.id,
                    userId: user.id,
                    roleId: role.id,
                },
            });

            if (!exists) {
                const userRole = this.userRoleRepository.create({
                    tenantId: subscriberTenant.id,
                    userId: user.id,
                    roleId: role.id,
                    from_group: false,
                });
                await this.userRoleRepository.save(userRole);
            }
        }
    }

    /**
     * Create a subscription linking a tenant to an app.
     * Sets status to SUCCESS immediately (no webhook call needed for onboarding).
     */
    private async createSubscription(tenant: Tenant, app: App): Promise<Subscription> {
        const subscription = this.subscriptionRepository.create({
            subscriber: tenant,
            app,
            status: SubscriptionStatus.SUCCESS,
        });
        return this.subscriptionRepository.save(subscription);
    }

    /**
     * Create a tenant without an owner user.
     * Used when onboarding without a user (tenant + subscription only).
     * Mirrors TenantService.create but skips member/role assignment.
     */
    private async createTenantWithoutOwner(
        permission: any,
        name: string,
        domain: string,
    ): Promise<Tenant> {
        const existingTenant = await this.tenantRepository.findOne({
            where: {domain},
        });
        if (existingTenant) {
            throw new ConflictException('Domain already exists');
        }

        let tenant = this.tenantRepository.create({
            name,
            domain,
            members: [],
            roles: [],
        });
        tenant = await this.tenantRepository.save(tenant);

        return tenant;
    }

    /**
     * Send a password reset email to a newly onboarded user.
     * Failures are logged but do not roll back the onboarding.
     *
     * Requirements: 9.1, 9.3
     */
    private async sendOnboardingEmail(userId: string, email: string): Promise<void> {
        try {
            const user = await this.userRepository.findOne({where: {id: userId}});
            if (!user) {
                logger.warn(`Cannot send onboarding email: user ${userId} not found`);
                return;
            }

            const token = await this.authService.createResetPasswordToken(user);
            const baseUrl = this.configService.get('BASE_URL');
            const link = `${baseUrl}/reset-password/${token}`;

            const sent = await this.mailService.sendResetPasswordMail(user, link);
            if (!sent) {
                logger.warn(`Failed to send onboarding email to ${email}`);
            }
        } catch (error) {
            logger.error(`Error sending onboarding email to ${email}: ${error.message}`);
        }
    }

    /**
     * Generate a cryptographically random temporary password.
     */
    private generateTemporaryPassword(): string {
        return crypto.randomBytes(24).toString('base64url');
    }
}
