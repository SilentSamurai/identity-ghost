import {RS256TokenGenerator} from '../../src/core/rs256-token-generator.service';
import {Environment} from '../../src/config/environment.service';
import {CryptUtil} from '../../src/util/crypt.util';
import * as fc from 'fast-check';

describe('RS256TokenGenerator cross-key rejection', () => {
    let tokenGenerator: RS256TokenGenerator;

    beforeAll(() => {
        const configService = {
            get: jest.fn(() => '1h'),
        } as unknown as Environment;
        tokenGenerator = new RS256TokenGenerator(configService);
    });

    it('should reject tokens signed with a different key', async () => {
        await fc.assert(
            fc.asyncProperty(
                fc.dictionary(
                    fc.string({minLength: 1}).filter(k =>
                        !['valueOf', 'toString', 'hasOwnProperty', '__proto__', 'constructor'].includes(k)
                    ),
                    fc.string({minLength: 1})
                ),
                async (payload) => {
                    if (Object.keys(payload).length === 0) return;
                    const pairA = CryptUtil.generateKeyPair();
                    const pairB = CryptUtil.generateKeyPair();

                    const tokenA = await tokenGenerator.sign(payload, {privateKey: pairA.privateKey});

                    await expect(tokenGenerator.verify(tokenA, {publicKey: pairB.publicKey}))
                        .rejects.toThrow();
                }
            ),
            {numRuns: 20}
        );
    });
});
