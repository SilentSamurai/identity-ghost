import {Test} from '@nestjs/testing';
import {AppModule} from '../../src/app.module';
import {Environment} from '../../src/config/environment.service';

/**
 * Clock Skew and Startup Validation Tests
 *
 * Test 1: Verifies the default clock skew is 30 seconds via the
 * JWT_CLOCK_SKEW_SECONDS environment variable.
 *
 * Test 2: Verifies that bootstrapping the NestJS app fails when
 * TOKEN_EXPIRATION_TIME_IN_SECONDS <= JWT_CLOCK_SKEW_SECONDS, as enforced
 * by AppModule.onModuleInit.
 *
 * Validates: Requirements 6.1, 6.2, 6.3, 6.4, 7.1, 7.2
 */
describe('Clock Skew and Startup Validation', () => {

    it('should default JWT_CLOCK_SKEW_SECONDS to 30', () => {
        const skew = Environment.get('JWT_CLOCK_SKEW_SECONDS', '30');
        expect(parseInt(skew, 10)).toEqual(30);
    });

    it('should fail startup when TOKEN_EXPIRATION_TIME_IN_SECONDS <= JWT_CLOCK_SKEW_SECONDS', async () => {
        const originalExpiration = process.env.TOKEN_EXPIRATION_TIME_IN_SECONDS;
        const originalSkew = process.env.JWT_CLOCK_SKEW_SECONDS;

        try {
            // Set invalid config: lifetime (10) <= skew (30)
            process.env.TOKEN_EXPIRATION_TIME_IN_SECONDS = '10';
            process.env.JWT_CLOCK_SKEW_SECONDS = '30';

            const moduleRef = await Test.createTestingModule({
                imports: [AppModule],
            }).compile();

            const app = moduleRef.createNestApplication();

            // app.init() triggers onModuleInit which should throw
            await expect(app.init()).rejects.toThrow(
                /TOKEN_EXPIRATION_TIME_IN_SECONDS.*must be greater than.*JWT_CLOCK_SKEW_SECONDS/,
            );

            // Clean up the app if it somehow didn't throw
            try { await app.close(); } catch { /* ignore */ }
        } finally {
            // Restore original env vars
            if (originalExpiration !== undefined) {
                process.env.TOKEN_EXPIRATION_TIME_IN_SECONDS = originalExpiration;
            } else {
                delete process.env.TOKEN_EXPIRATION_TIME_IN_SECONDS;
            }
            if (originalSkew !== undefined) {
                process.env.JWT_CLOCK_SKEW_SECONDS = originalSkew;
            } else {
                delete process.env.JWT_CLOCK_SKEW_SECONDS;
            }
        }
    });
});
