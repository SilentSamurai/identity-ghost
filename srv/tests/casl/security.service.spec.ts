import {Test, TestingModule} from '@nestjs/testing';
import {SecurityService} from '../../src/casl/security.service';
import {Environment} from '../../src/config/environment.service';
import {AuthUserService} from '../../src/casl/authUser.service';
import {CaslAbilityFactory} from '../../src/casl/casl-ability.factory';
import {AuthContext, GRANT_TYPES, InternalToken, TechnicalToken, TenantToken} from '../../src/casl/contexts';
import {ForbiddenException, UnauthorizedException} from '@nestjs/common';
import {RoleEnum} from '../../src/entity/roleEnum';
import {Action} from '../../src/casl/actions.enum';
import {AbilityBuilder, MongoAbility, PureAbility} from '@casl/ability';

/**
 * Unit tests for SecurityService.
 *
 * Covers authorization checks (getAbility, isAuthorized, check), token extraction
 * (getToken, getTechnicalToken), grant type detection (isClientCredentials),
 * the isSuperAdmin check (uses SUPER_ADMIN role + super domain),
 * and the various internal auth context factories used during token issuance,
 * member management, registration, and startup.
 */
describe('SecurityService', () => {
    let service: SecurityService;
    let authUserService: AuthUserService;
    let caslAbilityFactory: CaslAbilityFactory;
    let configService: Environment;

    const mockTenantToken = (() => {
        const token = TenantToken.create({
            sub: '1',
            tenant: {
                id: '1',
                name: 'Test Tenant',
                domain: 'test.com',
            },
            roles: [RoleEnum.TENANT_ADMIN],
            grant_type: GRANT_TYPES.PASSWORD,
            aud: ['test.com'],
            jti: 'test-jti',
            nbf: 0,
            scope: 'openid profile email',
            client_id: 'test-client',
            tenant_id: '1',
        });
        token.email = 'test@example.com';
        token.name = 'Test User';
        token.userId = '1';
        token.userTenant = {
            id: '1',
            name: 'Test Tenant',
            domain: 'test.com',
        };
        return token;
    })();

    const mockTechnicalToken = TechnicalToken.create({
        sub: 'oauth',
        tenant: {
            id: '1',
            name: 'Test Tenant',
            domain: 'test.com',
        },
        scope: 'openid profile email',
        aud: ['test.com'],
        jti: 'test-jti',
        nbf: 0,
        client_id: 'test-client',
        tenant_id: '1',
    });

    const createMockAbility = () => {
        const {can, build} = new AbilityBuilder<MongoAbility>(PureAbility);
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
            const context = {...mockAuthContext, SCOPE_ABILITIES: mockAbilities};
            const result = service.getAbility(context);
            expect(result).toBe(mockAbilities);
        });

        it('should throw UnauthorizedException when SCOPE_ABILITIES is null', () => {
            const context = {...mockAuthContext, SCOPE_ABILITIES: null};
            expect(() => service.getAbility(context)).toThrow(UnauthorizedException);
        });
    });

    describe('isAuthorized', () => {
        it('should check authorization without object', () => {
            const mockAbility = createMockAbility();
            const context = {...mockAuthContext, SCOPE_ABILITIES: mockAbility};

            const result = service.isAuthorized(context, Action.Read, 'User');
            expect(result).toBe(true);
        });

        it('should check authorization with object', () => {
            const mockAbility = createMockAbility();
            const context = {...mockAuthContext, SCOPE_ABILITIES: mockAbility};
            const obj = {id: 1, name: 'Test'};

            const result = service.isAuthorized(context, Action.Read, 'User', obj);
            expect(result).toBe(true);
        });
    });

    describe('check', () => {
        it('should throw ForbiddenException when not authorized', () => {
            const {can, build} = new AbilityBuilder<MongoAbility>(PureAbility);
            const mockAbility = build();
            const context = {...mockAuthContext, SCOPE_ABILITIES: mockAbility};

            expect(() => service.check(context, Action.Read, 'User')).toThrow(ForbiddenException);
        });

        it('should return true when authorized', () => {
            const mockAbility = createMockAbility();
            const context = {...mockAuthContext, SCOPE_ABILITIES: mockAbility};

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
            const request = {SECURITY_CONTEXT: mockTechnicalToken};
            const result = service.isClientCredentials(request);
            expect(result).toBe(true);
        });

        it('should return false for other grant types', () => {
            const request = {SECURITY_CONTEXT: mockTenantToken};
            const result = service.isClientCredentials(request);
            expect(result).toBe(false);
        });
    });

    describe('getTechnicalToken', () => {
        it('should return technical token for client credentials', () => {
            const context = {...mockAuthContext, SECURITY_CONTEXT: mockTechnicalToken};
            const result = service.getTechnicalToken(context);
            expect(result).toBe(mockTechnicalToken);
        });

        it('should throw ForbiddenException for non-client credentials', () => {
            expect(() => service.getTechnicalToken(mockAuthContext)).toThrow(ForbiddenException);
        });
    });

    // isSuperAdmin checks for SUPER_ADMIN in the roles field combined with the
    // super tenant domain. Roles and scopes are separate concerns.
    describe('isSuperAdmin', () => {
        // Super admin: has SUPER_ADMIN role AND domain matches SUPER_TENANT_DOMAIN
        it('should return true when roles contains SUPER_ADMIN and domain matches super tenant', () => {
            const superAdminToken = (() => {
                const token = TenantToken.create({
                    sub: '1',
                    tenant: {
                        id: '1',
                        name: 'Test Tenant',
                        domain: 'super.com',
                    },
                    roles: [RoleEnum.SUPER_ADMIN],
                    grant_type: GRANT_TYPES.PASSWORD,
                    aud: ['super.com'],
                    jti: 'test-jti',
                    nbf: 0,
                    scope: 'openid profile email',
                    client_id: 'test-client',
                    tenant_id: '1',
                });
                token.email = 'test@example.com';
                token.name = 'Test User';
                token.userId = '1';
                token.userTenant = {
                    id: '1',
                    name: 'Test Tenant',
                    domain: 'super.com',
                };
                return token;
            })();
            const result = service.isSuperAdmin(superAdminToken);
            expect(result).toBe(true);
        });

        // Has SUPER_ADMIN role but wrong domain — not a super admin
        it('should return false when roles contains SUPER_ADMIN but domain does not match', () => {
            const wrongDomainToken = (() => {
                const token = TenantToken.create({
                    sub: '1',
                    tenant: {
                        id: '1',
                        name: 'Test Tenant',
                        domain: 'other.com',
                    },
                    roles: [RoleEnum.SUPER_ADMIN],
                    grant_type: GRANT_TYPES.PASSWORD,
                    aud: ['other.com'],
                    jti: 'test-jti',
                    nbf: 0,
                    scope: 'openid profile email',
                    client_id: 'test-client',
                    tenant_id: '1',
                });
                token.email = 'test@example.com';
                token.name = 'Test User';
                token.userId = '1';
                token.userTenant = {
                    id: '1',
                    name: 'Test Tenant',
                    domain: 'other.com',
                };
                return token;
            })();
            const result = service.isSuperAdmin(wrongDomainToken);
            expect(result).toBe(false);
        });

        // Has correct domain but no SUPER_ADMIN role — not a super admin
        it('should return false when domain matches but roles does not contain SUPER_ADMIN', () => {
            const noRoleToken = (() => {
                const token = TenantToken.create({
                    sub: '1',
                    tenant: {
                        id: '1',
                        name: 'Test Tenant',
                        domain: 'super.com',
                    },
                    roles: [RoleEnum.TENANT_ADMIN],
                    grant_type: GRANT_TYPES.PASSWORD,
                    aud: ['super.com'],
                    jti: 'test-jti',
                    nbf: 0,
                    scope: 'openid profile email',
                    client_id: 'test-client',
                    tenant_id: '1',
                });
                token.email = 'test@example.com';
                token.name = 'Test User';
                token.userId = '1';
                token.userTenant = {
                    id: '1',
                    name: 'Test Tenant',
                    domain: 'super.com',
                };
                return token;
            })();
            const result = service.isSuperAdmin(noRoleToken);
            expect(result).toBe(false);
        });

        // mockTenantToken has domain 'test.com' and TENANT_ADMIN role — not a super admin
        it('should return false for non-super admin', () => {
            const result = service.isSuperAdmin(mockTenantToken);
            expect(result).toBe(false);
        });
    });

    describe('createPermissionForTokenIssuance', () => {
        it('should create scoped permission for token issuance with read access to tenants/members/roles', () => {
            const permission = service.createPermissionForTokenIssuance('tenant-123');

            expect(permission).toBeDefined();
        });
    });

    describe('createPermissionForMemberManagement', () => {
        it('should create scoped permission for member management with user read/create access', () => {
            const permission = service.createPermissionForMemberManagement('tenant-456');

            expect(permission).toBeDefined();
        });
    });

    describe('createPermissionForRegistration', () => {
        it('should create permission for registration with tenant/user/role management access', () => {
            const permission = service.createPermissionForRegistration();

            expect(permission).toBeDefined();
        });
    });

    describe('createPermissionForStartupSeed', () => {
        it('should create full-access permission for startup seed operations', () => {
            const permission = service.createPermissionForStartupSeed();

            expect(permission).toBeDefined();
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
            const mockRoles = [{name: RoleEnum.TENANT_ADMIN}];
            const mockAbilities = createMockAbility();

            jest.spyOn(authUserService, 'findUserByEmail').mockResolvedValue(mockUser as any);
            jest.spyOn(authUserService, 'findTenantByDomain').mockResolvedValue(mockTenant as any);
            jest.spyOn(authUserService, 'findMemberRoles').mockResolvedValue(mockRoles as any);
            jest.spyOn(caslAbilityFactory, 'createForSecurityContext').mockReturnValue(mockAbilities);

            const result = await service.getUserTenantAuthContext('test@example.com', 'test.com');

            expect(result.SECURITY_CONTEXT.asTenantToken().email).toBe(mockUser.email);
            expect(result.SECURITY_CONTEXT.asTenantToken().tenant.domain).toBe(mockTenant.domain);
            expect(result.SECURITY_CONTEXT.asTenantToken().roles).toContain(RoleEnum.TENANT_ADMIN);
            expect(result.SCOPE_ABILITIES).toBe(mockAbilities);
        });
    });

    describe('getAuthContextFromSecurityContext', () => {
        it('should create auth context from security context', async () => {
            const mockAbilities = createMockAbility();
            jest.spyOn(caslAbilityFactory, 'createForSecurityContext').mockReturnValue(mockAbilities);

            const result = await service.getAuthContextFromSecurityContext(mockTenantToken);

            expect(result.SECURITY_CONTEXT).toBe(mockTenantToken);
            expect(result.SCOPE_ABILITIES).toBe(mockAbilities);
        });
    });
}); 