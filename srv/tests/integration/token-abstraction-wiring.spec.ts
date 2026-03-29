import {Test, TestingModule} from '@nestjs/testing';
import {RS256_TOKEN_GENERATOR, SIGNING_KEY_PROVIDER} from '../../src/core/token-abstraction';
import {RS256TokenGenerator} from '../../src/core/rs256-token-generator.service';
import {RS256SigningKeyProvider} from '../../src/core/rs256-signing-key-provider.service';
import {Environment} from '../../src/config/environment.service';
import {getRepositoryToken} from '@nestjs/typeorm';
import {Tenant} from '../../src/entity/tenant.entity';

describe('Token Abstraction DI Wiring', () => {
    let module: TestingModule;

    beforeAll(async () => {
        const mockRepo = {
            findOne: jest.fn(),
            save: jest.fn(),
            create: jest.fn(),
        };

        const mockConfig = {
            get: jest.fn(() => 'test'),
        };

        module = await Test.createTestingModule({
            providers: [
                RS256TokenGenerator,
                RS256SigningKeyProvider,
                {
                    provide: RS256_TOKEN_GENERATOR,
                    useClass: RS256TokenGenerator,
                },
                {
                    provide: SIGNING_KEY_PROVIDER,
                    useClass: RS256SigningKeyProvider,
                },
                {
                    provide: Environment,
                    useValue: mockConfig,
                },
                {
                    provide: getRepositoryToken(Tenant),
                    useValue: mockRepo,
                },
            ],
        }).compile();
    });

    afterAll(async () => {
        await module.close();
    });

    it('should resolve RS256_TOKEN_GENERATOR as RS256TokenGenerator', () => {
        const tokenGenerator = module.get(RS256_TOKEN_GENERATOR);
        expect(tokenGenerator).toBeDefined();
        expect(tokenGenerator).toBeInstanceOf(RS256TokenGenerator);
    });

    it('should resolve SIGNING_KEY_PROVIDER as RS256SigningKeyProvider', () => {
        const signingKeyProvider = module.get(SIGNING_KEY_PROVIDER);
        expect(signingKeyProvider).toBeDefined();
        expect(signingKeyProvider).toBeInstanceOf(RS256SigningKeyProvider);
    });
});
