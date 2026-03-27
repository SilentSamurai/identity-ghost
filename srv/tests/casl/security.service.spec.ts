import { Test, TestingModule } from '@nestjs/testing';
import { SecurityService } from '../../src/casl/security.service';
import { Environment } from '../../src/config/environment.service';
import { AuthUserService } from '../../src/casl/authUser.service';
import { CaslAbilityFactory } from '../../src/casl/casl-ability.factory';
import { AuthContext, GRANT_TYPES, InternalToken, TechnicalToken, TenantToken } from '../../src/casl/contexts';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { RoleEnum } from '../../src/entity/roleEnum';
import { Action } from '../../src/casl/actions.enum';
import { PureAbility, AbilityBuilder, MongoAbility, subject } from '@casl/ability';

describe('SecurityService', () => {
    let service: SecurityService;
    let authUserService: AuthUserService;
    let caslAbilityFactory: CaslAbilityFactory;
    let configService: Environment;

    const mockTenantToken = TenantToken.create({
        email: 'test@example.com',
        sub: 'test@example.com',
        userId: '1',
        name: 'Test User',
        tenant: {
            id: '1',
            name: 'Test Tenant',
            domain: 'test.com',
        },
        scopes: [RoleEnum.TENANT_ADMIN],
        grant_type: GRANT_TYPES.PASSWORD,
        userTenant: {
            id: '1',
            name: 'Test Tenant',
            domain: 'test.com',
        },
    });

    const mockTechnicalToken = TechnicalToken.create({
        sub: 'test@example.com',
        tenant: {
            id: '1',
            name: 'Test Tenant',
            domain: 'test.com',
        },
        scopes: [RoleEnum.TENANT_ADMIN],
    });

    const createMockAbility = () => {
        const { can, build } = new AbilityBuilder<MongoAbility>(PureAbility);
        can(Action.Read, 'User');
        return build();
    };

    const mockAuthContext: AuthContext = {
        SECURITY_CONTEXT: mockTenantToken,
        SCOPE_ABILITIES: createMockAbility(),
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                SecurityService,
                {
                    provide: Environment,
                    useValue: {
                        get: jest.fn().mockImplementation((key) => {
                            if (key === 'SUPER_TENANT_DOMAIN') return 'super.com';
                            return 'test-value';
                        }),
                    },
                },
                {
                    provide: AuthUserService,
                    useValue: {
                        findUserByEmail: jest.fn(),
                        findTenantByDomain: jest.fn(),
                        findMemberRoles: jest.fn(),
                    },
                },
                {
                    provide: CaslAbilityFactory,
                    useValue: {
                        createForSecurityContext: jest.fn(),
                        createContextForUserAuth: jest.fn(),
                    },
                },
            ],
        }).compile();

        service = module.get<SecurityService>(SecurityService);
        authUserService = module.get<AuthUserService>(AuthUserService);
        caslAbilityFactory = module.get<CaslAbilityFactory>(CaslAbilityFactory);
        configService = module.get<Environment>(Environment);
    });

    describe('getAbility', () => {
        it('should return abilities when SCOPE_ABILITIES exists', () => {
            const mockAbilities = createMockAbility();
            const context = { ...mockAuthContext, SCOPE_ABILITIES: mockAbilities };
            const result = service.getAbility(context);
            expect(result).toBe(mockAbilities);
        });

        it('should throw UnauthorizedException when SCOPE_ABILITIES is null', () => {
            const context = { ...mockAuthContext, SCOPE_ABILITIES: null };
            expect(() => service.getAbility(context)).toThrow(UnauthorizedException);
        });
    });

    describe('isAuthorized', () => {
        it('should check authorization without object', () => {
            const mockAbility = createMockAbility();
            const context = { ...mockAuthContext, SCOPE_ABILITIES: mockAbility };

            const result = service.isAuthorized(context, Action.Read, 'User');
            expect(result).toBe(true);
        });

        it('should check authorization with object', () => {
            const mockAbility = createMockAbility();
            const context = { ...mockAuthContext, SCOPE_ABILITIES: mockAbility };
            const obj = { id: 1, name: 'Test' };

            const result = service.isAuthorized(context, Action.Read, 'User', obj);
            expect(result).toBe(true);
        });
    });

    describe('check', () => {
        it('should throw ForbiddenException when not authorized', () => {
            const { can, build } = new AbilityBuilder<MongoAbility>(PureAbility);
            const mockAbility = build();
            const context = { ...mockAuthContext, SCOPE_ABILITIES: mockAbility };

            expect(() => service.check(context, Action.Read, 'User')).toThrow(ForbiddenException);
        });

        it('should return true when authorized', () => {
            const mockAbility = createMockAbility();
            const context = { ...mockAuthContext, SCOPE_ABILITIES: mockAbility };

            const result = service.check(context, Action.Read, 'User');
            expect(result).toBe(true);
        });
    });

    describe('getToken', () => {
        it('should return tenant token when valid', () => {
            const result = service.getToken(mockAuthContext);
            expect(result).toBe(mockTenantToken);
        });

        it('should throw ForbiddenException when not a tenant token', () => {
            const invalidContext = {
                ...mockAuthContext,
                SECURITY_CONTEXT: mockTechnicalToken,
            };
            expect(() => service.getToken(invalidContext)).toThrow(ForbiddenException);
        });
    });

    describe('isClientCredentials', () => {
        it('should return true for client credentials grant type', () => {
            const request = { SECURITY_CONTEXT: mockTechnicalToken };
            const result = service.isClientCredentials(request);
            expect(result).toBe(true);
        });

        it('should return false for other grant types', () => {
            const request = { SECURITY_CONTEXT: mockTenantToken };
            const result = service.isClientCredentials(request);
            expect(result).toBe(false);
        });
    });

    describe('getTechnicalToken', () => {
        it('should return technical token for client credentials', () => {
            const context = { ...mockAuthContext, SECURITY_CONTEXT: mockTechnicalToken };
            const result = service.getTechnicalToken(context);
            expect(result).toBe(mockTechnicalToken);
        });

        it('should throw ForbiddenException for non-client credentials', () => {
            expect(() => service.getTechnicalToken(mockAuthContext)).toThrow(ForbiddenException);
        });
    });

    describe('isSuperAdmin', () => {
        it('should return true for super admin in super tenant', () => {
            const superAdminToken = TenantToken.create({
                email: 'test@example.com',
                sub: 'test@example.com',
                userId: '1',
                name: 'Test User',
                tenant: {
                    id: '1',
                    name: 'Test Tenant',
                    domain: 'super.com',
                },
                scopes: [RoleEnum.SUPER_ADMIN],
                grant_type: GRANT_TYPES.PASSWORD,
                userTenant: {
                    id: '1',
                    name: 'Test Tenant',
                    domain: 'super.com',
                },
            });
            const result = service.isSuperAdmin(superAdminToken);
            expect(result).toBe(true);
        });

        it('should return false for non-super admin', () => {
            const result = service.isSuperAdmin(mockTenantToken);
            expect(result).toBe(false);
        });
    });

    describe('getContextForTokenIssuance', () => {
        it('should create scoped context for token issuance with read access to tenants/members/roles', async () => {
            const result = await service.getContextForTokenIssuance('tenant-123');

            expect(result.SECURITY_CONTEXT.isInternalToken()).toBe(true);
            expect((result.SECURITY_CONTEXT as InternalToken).purpose).toBe('token-issuance');
            expect((result.SECURITY_CONTEXT as InternalToken).scopedTenantId).toBe('tenant-123');
            expect(result.SCOPE_ABILITIES).toBeDefined();
            expect(result.SCOPE_ABILITIES.can(Action.Read, 'Tenant')).toBe(true);
            expect(result.SCOPE_ABILITIES.can(Action.Read, 'TenantMember')).toBe(true);
            expect(result.SCOPE_ABILITIES.can(Action.Read, 'Role')).toBe(true);
            // Should NOT be able to create or update
            expect(result.SCOPE_ABILITIES.can(Action.Create, 'User')).toBe(false);
            expect(result.SCOPE_ABILITIES.can(Action.Update, 'Tenant')).toBe(false);
        });
    });

    describe('getContextForMemberManagement', () => {
        it('should create scoped context for member management with user read/create access', async () => {
            const result = await service.getContextForMemberManagement('tenant-456');

            expect(result.SECURITY_CONTEXT.isInternalToken()).toBe(true);
            expect((result.SECURITY_CONTEXT as InternalToken).purpose).toBe('member-management');
            expect((result.SECURITY_CONTEXT as InternalToken).scopedTenantId).toBe('tenant-456');
            expect(result.SCOPE_ABILITIES.can(Action.Read, 'User')).toBe(true);
            expect(result.SCOPE_ABILITIES.can(Action.Create, 'User')).toBe(true);
            expect(result.SCOPE_ABILITIES.can(Action.Read, 'TenantMember')).toBe(true);
            // Should NOT have manage-all
            expect(result.SCOPE_ABILITIES.can(Action.Delete, 'Tenant')).toBe(false);
        });
    });

    describe('getContextForRegistration', () => {
        it('should create scoped context for registration with tenant/user/role management access', async () => {
            const result = await service.getContextForRegistration();

            expect(result.SECURITY_CONTEXT.isInternalToken()).toBe(true);
            expect((result.SECURITY_CONTEXT as InternalToken).purpose).toBe('registration');
            expect(result.SCOPE_ABILITIES.can(Action.Read, 'Tenant')).toBe(true);
            expect(result.SCOPE_ABILITIES.can(Action.Create, 'Tenant')).toBe(true);
            expect(result.SCOPE_ABILITIES.can(Action.Update, 'Tenant')).toBe(true);
            expect(result.SCOPE_ABILITIES.can(Action.Read, 'User')).toBe(true);
            expect(result.SCOPE_ABILITIES.can(Action.Create, 'User')).toBe(true);
            expect(result.SCOPE_ABILITIES.can(Action.Update, 'User')).toBe(true);
            expect(result.SCOPE_ABILITIES.can(Action.Create, 'Role')).toBe(true);
            // Should NOT have delete or manage-all
            expect(result.SCOPE_ABILITIES.can(Action.Delete, 'Tenant')).toBe(false);
            expect(result.SCOPE_ABILITIES.can(Action.Manage, 'all')).toBe(false);
        });
    });

    describe('getContextForStartup', () => {
        it('should create full-access context for startup seed operations', async () => {
            const result = await service.getContextForStartup();

            expect(result.SECURITY_CONTEXT.isInternalToken()).toBe(true);
            expect((result.SECURITY_CONTEXT as InternalToken).purpose).toBe('startup-seed');
            expect(result.SCOPE_ABILITIES.can(Action.Manage, 'all')).toBe(true);
        });
    });

    describe('getUserAuthContext', () => {
        it('should create user auth context', async () => {
            const mockUser = {
                id: '1',
                email: 'test@example.com',
                name: 'Test User',
            };
            const mockAbilities = createMockAbility();

            jest.spyOn(authUserService, 'findUserByEmail').mockResolvedValue(mockUser as any);
            jest.spyOn(caslAbilityFactory, 'createContextForUserAuth').mockReturnValue(mockAbilities);

            const result = await service.getUserAuthContext('test@example.com');

            expect(result.SECURITY_CONTEXT.asTenantToken().email).toBe(mockUser.email);
            expect(result.SECURITY_CONTEXT.asTenantToken().userId).toBe(mockUser.id);
            expect(result.SCOPE_ABILITIES).toBe(mockAbilities);
        });
    });

    describe('getUserTenantAuthContext', () => {
        it('should create user tenant auth context', async () => {
            const mockUser = {
                id: '1',
                email: 'test@example.com',
                name: 'Test User',
            };
            const mockTenant = {
                id: '1',
                name: 'Test Tenant',
                domain: 'test.com',
            };
            const mockRoles = [{ name: RoleEnum.TENANT_ADMIN }];
            const mockAbilities = createMockAbility();

            jest.spyOn(authUserService, 'findUserByEmail').mockResolvedValue(mockUser as any);
            jest.spyOn(authUserService, 'findTenantByDomain').mockResolvedValue(mockTenant as any);
            jest.spyOn(authUserService, 'findMemberRoles').mockResolvedValue(mockRoles as any);
            jest.spyOn(caslAbilityFactory, 'createForSecurityContext').mockResolvedValue(mockAbilities);

            const result = await service.getUserTenantAuthContext('test@example.com', 'test.com');

            expect(result.SECURITY_CONTEXT.asTenantToken().email).toBe(mockUser.email);
            expect(result.SECURITY_CONTEXT.asTenantToken().tenant.domain).toBe(mockTenant.domain);
            expect(result.SECURITY_CONTEXT.asTenantToken().scopes).toContain(RoleEnum.TENANT_ADMIN);
            expect(result.SCOPE_ABILITIES).toBe(mockAbilities);
        });
    });

    describe('getAuthContextFromSecurityContext', () => {
        it('should create auth context from security context', async () => {
            const mockAbilities = createMockAbility();
            jest.spyOn(caslAbilityFactory, 'createForSecurityContext').mockResolvedValue(mockAbilities);

            const result = await service.getAuthContextFromSecurityContext(mockTenantToken);

            expect(result.SECURITY_CONTEXT).toBe(mockTenantToken);
            expect(result.SCOPE_ABILITIES).toBe(mockAbilities);
        });
    });
}); 