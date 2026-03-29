import * as fc from 'fast-check';
import { ES256TokenGenerator } from '../../src/core/es256-token-generator.service';
import { PS256TokenGenerator } from '../../src/core/ps256-token-generator.service';
import { Environment } from '../../src/config/environment.service';
import { CryptUtil } from '../../src/util/crypt.util';

describe('Additional Token Generators (ES256, PS256)', () => {
    let es256Generator: ES256TokenGenerator;
    let ps256Generator: PS256TokenGenerator;
    const ecKeyPair = CryptUtil.generateECKeyPair();
    const rsaKeyPair = CryptUtil.generateKeyPair();

    beforeAll(() => {
        const configService = {
            get: jest.fn((key) => {
                if (key === 'TOKEN_EXPIRATION_TIME') return '1h';
                if (key === 'SUPER_TENANT_DOMAIN') return 'auth.server.com';
                return null;
            }),
        } as unknown as Environment;
        es256Generator = new ES256TokenGenerator(configService);
        ps256Generator = new PS256TokenGenerator(configService);
    });

    describe('ES256TokenGenerator', () => {
        it('should maintain all fields after sign-verify-decode round trip', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.dictionary(
                        fc.string({ minLength: 1 }).filter(k => 
                            !['iat', 'exp', 'iss', 'sub', 'aud', 'nbf', 'jti', 'valueOf', 'toString', 'hasOwnProperty', '__proto__', 'constructor'].includes(k)
                        ),
                        fc.oneof(fc.string(), fc.integer(), fc.boolean())
                    ),
                    async (payload) => {
                        const token = await es256Generator.sign(payload, { privateKey: ecKeyPair.privateKey });
                        const verified = await es256Generator.verify(token, { publicKey: ecKeyPair.publicKey });
                        const decoded = es256Generator.decode(token);

                        expect(verified).toMatchObject(payload);
                        expect(decoded).toMatchObject(payload);
                    }
                )
            );
        });
    });

    describe('PS256TokenGenerator', () => {
        it('should maintain all fields after sign-verify-decode round trip', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.dictionary(
                        fc.string({ minLength: 1 }).filter(k => 
                            !['iat', 'exp', 'iss', 'sub', 'aud', 'nbf', 'jti', 'valueOf', 'toString', 'hasOwnProperty', '__proto__', 'constructor'].includes(k)
                        ),
                        fc.oneof(fc.string(), fc.integer(), fc.boolean())
                    ),
                    async (payload) => {
                        const token = await ps256Generator.sign(payload, { privateKey: rsaKeyPair.privateKey });
                        const verified = await ps256Generator.verify(token, { publicKey: rsaKeyPair.publicKey });
                        const decoded = ps256Generator.decode(token);

                        expect(verified).toMatchObject(payload);
                        expect(decoded).toMatchObject(payload);
                    }
                )
            );
        });
    });
});
