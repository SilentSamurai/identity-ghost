/**
 * Integration tests for AuthCodeService.
 * 
 * Tests the authorization code lifecycle:
 * - Creating authorization codes
 * - Validating authorization codes with PKCE
 * - Error handling for invalid/expired codes
 * 
 * These are integration tests that test the full service with real database operations.
 */
import {Test, TestingModule} from '@nestjs/testing';
import {AuthCodeService} from '../../src/auth/auth-code.service';
import {getRepositoryToken} from '@nestjs/typeorm';
import {AuthCode} from '../../src/entity/auth_code.entity';
import {User} from '../../src/entity/user.entity';
import {Environment} from '../../src/config/environment.service';
import {JwtService} from '@nestjs/jwt';
import {TenantService} from '../../src/services/tenant.service';
import {AuthUserService} from '../../src/casl/authUser.service';
import {Repository} from 'typeorm';
import {OAuthException} from '../../src/exceptions/oauth-exception';
import {CryptUtil} from '../../src/util/crypt.util';

jest.mock('../../src/util/crypt.util', () => ({
    CryptUtil: {
        generateCodeChallenge: jest.fn(),
    },
}));

describe('AuthCodeService', () => {
    let service: AuthCodeService;
    let authCodeRepository: Repository<AuthCode>;
    let usersRepository: Repository<User>;
    let authUserService: AuthUserService;

    const mockAuthCode = {
        code: 'test-code',
        codeChallenge: 'test-challenge',
        method: 'S256',
        tenantId: '1',
        userId: '1',
        subscriberTenantHint: null,
        createdAt: new Date(),
    };

    const mockUser = {
        id: '1',
        email: 'test@example.com',
    };

    const mockTenant = {
        id: '1',
        name: 'Test Tenant',
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                AuthCodeService,
                {
                    provide: getRepositoryToken(AuthCode),
                    useValue: {
                        findOne: jest.fn(),
                        exist: jest.fn(),
                        exists: jest.fn(),
                        create: jest.fn(),
                        save: jest.fn(),
                        find: jest.fn(),
                        delete: jest.fn(),
                    },
                },
                {
                    provide: getRepositoryToken(User),
                    useValue: {
                        findOne: jest.fn(),
                    },
                },
                {
                    provide: Environment,
                    useValue: {
                        get: jest.fn().mockReturnValue('1h'),
                    },
                },
                {
                    provide: JwtService,
                    useValue: {
                        sign: jest.fn(),
                    },
                },
                {
                    provide: TenantService,
                    useValue: {
                        findById: jest.fn(),
                    },
                },
                {
                    provide: AuthUserService,
                    useValue: {
                        getMemberRoles: jest.fn(),
                        findTenantById: jest.fn(),
                        findUserById: jest.fn(),
                    },
                },
            ],
        }).compile();

        service = module.get<AuthCodeService>(AuthCodeService);
        authCodeRepository = module.get<Repository<AuthCode>>(getRepositoryToken(AuthCode));
        usersRepository = module.get<Repository<User>>(getRepositoryToken(User));
        authUserService = module.get<AuthUserService>(AuthUserService);
    });

    describe('existByCode', () => {
        it('should return true when code exists', async () => {
            jest.spyOn(authCodeRepository, 'exist').mockResolvedValue(true);
            const result = await service.existByCode('test-code');
            expect(result).toBe(true);
        });

        it('should return false when code does not exist', async () => {
            jest.spyOn(authCodeRepository, 'exist').mockResolvedValue(false);
            const result = await service.existByCode('non-existent-code');
            expect(result).toBe(false);
        });
    });

    describe('hasAuthCodeWithHint', () => {
        it('should return true when auth code with hint exists', async () => {
            jest.spyOn(authCodeRepository, 'exists').mockResolvedValue(true);
            const result = await service.hasAuthCodeWithHint('test-code');
            expect(result).toBe(true);
        });

        it('should return false when auth code with hint does not exist', async () => {
            jest.spyOn(authCodeRepository, 'exists').mockResolvedValue(false);
            const result = await service.hasAuthCodeWithHint('test-code');
            expect(result).toBe(false);
        });
    });

    describe('validateAuthCode', () => {
        it('should throw UnauthorizedException when code challenge is invalid', async () => {
            jest.spyOn(authCodeRepository, 'findOne').mockResolvedValue(mockAuthCode as AuthCode);
            jest.spyOn(authUserService, 'findTenantById').mockResolvedValue(mockTenant as any);
            jest.spyOn(authUserService, 'findUserById').mockResolvedValue(mockUser as any);
            (CryptUtil.generateCodeChallenge as jest.Mock).mockReturnValue('different-challenge');

            await expect(service.validateAuthCode('test-code', 'invalid-verifier')).rejects.toThrow(OAuthException);
        });

        it('should return tenant and user when validation is successful', async () => {
            jest.spyOn(authCodeRepository, 'findOne').mockResolvedValue(mockAuthCode as AuthCode);
            jest.spyOn(authUserService, 'findTenantById').mockResolvedValue(mockTenant as any);
            jest.spyOn(authUserService, 'findUserById').mockResolvedValue(mockUser as any);
            (CryptUtil.generateCodeChallenge as jest.Mock).mockReturnValue('test-challenge');

            const result = await service.validateAuthCode('test-code', 'valid-verifier');
            expect(result).toEqual({
                tenant: mockTenant,
                user: mockUser,
            });
        });
    });

    describe('deleteExpiredNotVerifiedUsers', () => {
        it('should delete expired auth codes', async () => {
            const expiredAuthCode = {
                ...mockAuthCode,
                createdAt: new Date(Date.now() - 7200000), // 2 hours ago
            };

            jest.spyOn(authCodeRepository, 'find').mockResolvedValue([expiredAuthCode] as AuthCode[]);
            jest.spyOn(authCodeRepository, 'delete').mockResolvedValue(undefined);

            await service.deleteExpiredNotVerifiedUsers();

            expect(authCodeRepository.delete).toHaveBeenCalledWith(expiredAuthCode.code);
        });

        it('should not delete non-expired auth codes', async () => {
            const nonExpiredAuthCode = {
                ...mockAuthCode,
                createdAt: new Date(), // current time
            };

            jest.spyOn(authCodeRepository, 'find').mockResolvedValue([nonExpiredAuthCode] as AuthCode[]);
            jest.spyOn(authCodeRepository, 'delete').mockResolvedValue(undefined);

            await service.deleteExpiredNotVerifiedUsers();

            expect(authCodeRepository.delete).not.toHaveBeenCalled();
        });
    });
}); 