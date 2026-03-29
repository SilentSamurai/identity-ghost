import * as fc from 'fast-check';
import {RS256TokenGenerator} from '../../src/core/rs256-token-generator.service';
import {Environment} from '../../src/config/environment.service';
import {CryptUtil} from '../../src/util/crypt.util';

describe('RS256TokenGenerator sign-verify-decode round trip', () => {
    let tokenGenerator: RS256TokenGenerator;
    const {privateKey, publicKey} = CryptUtil.generateKeyPair();

    beforeAll(() => {
        const configService = {
            get: jest.fn((key) => {
                if (key === 'TOKEN_EXPIRATION_TIME') return '1h';
                if (key === 'SUPER_TENANT_DOMAIN') return 'auth.server.com';
                return null;
            }),
        } as unknown as Environment;
        tokenGenerator = new RS256TokenGenerator(configService);
    });

    it('should maintain all fields after sign-verify-decode round trip', async () => {
        await fc.assert(
            fc.asyncProperty(
                fc.dictionary(
                    fc.string({minLength: 1}).filter(k =>
                        !['iat', 'exp', 'iss', 'sub', 'aud', 'nbf', 'jti', 'valueOf', 'toString', 'hasOwnProperty', '__proto__', 'constructor'].includes(k)
                    ),
                    fc.oneof(fc.string(), fc.integer(), fc.boolean())
                ),
                async (payload) => {
                    const token = await tokenGenerator.sign(payload, {privateKey});
                    const verified = await tokenGenerator.verify(token, {publicKey});
                    const decoded = tokenGenerator.decode(token);

                    expect(verified).toMatchObject(payload);
                    expect(decoded).toMatchObject(payload);
                }
            )
        );
    });
});
