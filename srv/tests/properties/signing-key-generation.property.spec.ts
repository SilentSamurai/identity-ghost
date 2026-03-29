import {RS256SigningKeyProvider} from '../../src/core/rs256-signing-key-provider.service';
import {Repository} from 'typeorm';
import {Tenant} from '../../src/entity/tenant.entity';
import {JwtService} from '@nestjs/jwt';
import * as fc from 'fast-check';

describe('RS256SigningKeyProvider key generation', () => {
    let provider: RS256SigningKeyProvider;

    beforeAll(() => {
        provider = new RS256SigningKeyProvider({} as Repository<Tenant>);
    });

    it('should produce valid RSA 2048-bit PEM keys', async () => {
        await fc.assert(
            fc.asyncProperty(fc.integer(), async () => {
                const {privateKey, publicKey} = provider.generateKeyPair();

                expect(privateKey).toContain('-----BEGIN PRIVATE KEY-----');
                expect(publicKey).toContain('-----BEGIN PUBLIC KEY-----');

                // Verify they can actually sign and verify
                const jwtService = new JwtService({
                    signOptions: {algorithm: 'RS256'}
                });
                const payload = {test: 'data'};
                const token = jwtService.sign(payload, {privateKey});
                const verified = jwtService.verify(token, {publicKey});

                expect(verified).toMatchObject(payload);
            }),
            {numRuns: 100}
        );
    });
});
