import * as fc from 'fast-check';
import {IdTokenHintValidator} from '../../src/auth/id-token-hint.validator';
import {SigningKeyProvider, TokenService} from '../../src/core/token-abstraction';
import {CryptUtil} from '../../src/util/crypt.util';
import {OAuthException} from '../../src/exceptions/oauth-exception';

/**
 * Feature: id-token-audience-validation, Property 1: id_token_hint validator
 *
 * Property: The IdTokenHintValidator accepts a token if and only if the `aud`
 * claim is a JSON array that contains the expected `client_id`.
 *
 * When `aud` is not an array (bare string, number, missing, or other type),
 * the validator SHALL reject with a descriptive error.
 *
 * When `aud` is an array but does not contain the expected `client_id`,
 * the validator SHALL reject with a descriptive error.
 *
 * **Validates: Requirements 5.1, 5.2, 5.3, 5.4**
 */

// ── Shared test infrastructure ──────────────────────────────────────────

const TEST_KID = 'test-kid-001';
const {privateKey, publicKey} = CryptUtil.generateKeyPair();

let tokenGenerator: TokenService;
let signingKeyProvider: SigningKeyProvider;
let validator: IdTokenHintValidator;

beforeAll(() => {
    // Use a JwtService for token operations
    const {JwtService} = require('@nestjs/jwt');
    const jwtService = new JwtService({
        signOptions: {algorithm: 'RS256'},
    });

    tokenGenerator = {
        sign: (payload: any, options: any) => jwtService.signAsync(payload, options),
        verify: (token: string, options: any) => jwtService.verifyAsync(token, options),
        decode: (token: string) => jwtService.decode(token, {json: true}),
        decodeComplete: (token: string) => {
            const decoded = jwtService.decode(token, {complete: true}) as any;
            return decoded ?? {header: {}, payload: {}};
        },
    } as TokenService;

    signingKeyProvider = {
        getSigningKeyWithKid: jest.fn().mockResolvedValue({privateKey, kid: TEST_KID}),
        getPrivateKey: jest.fn().mockResolvedValue(privateKey),
        getPublicKey: jest.fn().mockResolvedValue(publicKey),
        getPublicKeyByKid: jest.fn().mockResolvedValue(publicKey),
        generateKeyPair: jest.fn().mockReturnValue({privateKey, publicKey}),
    } as unknown as SigningKeyProvider;

    validator = new IdTokenHintValidator(tokenGenerator, signingKeyProvider);
});

// ── Arbitraries ─────────────────────────────────────────────────────────

const clientIdArb = fc.uuid();

// Various aud formats to test
const audArrayWithExpectedArb = (expectedClientId: string) =>
    fc.array(fc.uuid(), {minLength: 1}).map(arr => [expectedClientId, ...arr]);

const audArrayWithoutExpectedArb = (expectedClientId: string) =>
    fc.array(fc.uuid(), {minLength: 1}).filter(arr => !arr.includes(expectedClientId));

const audBareStringArb = fc.uuid();

const audNumberArb = fc.integer({min: 0, max: 1000000});

const audNullArb = fc.constantFrom(null as null);

const audUndefinedArb = fc.constantFrom(undefined as undefined);

const audObjectArb = fc.record({foo: fc.string()});

// ── Property 1: Accept/Reject Boundary ───────────────────────────────────

/**
 * Feature: id-token-audience-validation, Property 1: id_token_hint validator
 *
 * For any JWT payload and any expected clientId, the IdTokenHintValidator
 * SHALL accept the token if and only if the aud claim is a JSON array that
 * contains the expected clientId.
 */
describe('Feature: id-token-audience-validation, Property 1: id_token_hint validator', () => {
    it('accepts iff aud is an array containing the expected client_id', async () => {
        await fc.assert(
            fc.asyncProperty(
                fc.oneof(
                    // aud as array with expected clientId
                    clientIdArb.chain(expectedClientId =>
                        audArrayWithExpectedArb(expectedClientId).map(aud => ({
                            expectedClientId,
                            audValue: aud as any,
                        }))
                    ),
                    // aud as array without expected clientId
                    clientIdArb.chain(expectedClientId =>
                        audArrayWithoutExpectedArb(expectedClientId).map(aud => ({
                            expectedClientId,
                            audValue: aud as any,
                        }))
                    ),
                    // aud as bare string
                    fc.tuple(clientIdArb, audBareStringArb).map(([expectedClientId, audValue]) => ({
                        expectedClientId,
                        audValue: audValue as any,
                    })),
                    // aud as number
                    fc.tuple(clientIdArb, audNumberArb).map(([expectedClientId, audValue]) => ({
                        expectedClientId,
                        audValue: audValue as any,
                    })),
                    // aud as null
                    fc.tuple(clientIdArb, audNullArb).map(([expectedClientId, audValue]) => ({
                        expectedClientId,
                        audValue: audValue as any,
                    })),
                    // aud as undefined
                    fc.tuple(clientIdArb, audUndefinedArb).map(([expectedClientId, audValue]) => ({
                        expectedClientId,
                        audValue: audValue as any,
                    })),
                    // aud as object
                    fc.tuple(clientIdArb, audObjectArb).map(([expectedClientId, audValue]) => ({
                        expectedClientId,
                        audValue: audValue as any,
                    })),
                ),
                async ({expectedClientId, audValue}) => {
                    // Build JWT payload with the generated aud
                    const payload: Record<string, any> = {
                        sub: 'user-123',
                        iss: 'https://auth.test.example.com',
                        iat: Math.floor(Date.now() / 1000),
                        exp: Math.floor(Date.now() / 1000) + 3600,
                    };

                    // Only add aud if not undefined (undefined means the claim is absent)
                    if (audValue !== undefined) {
                        payload.aud = audValue;
                    }

                    // Sign the JWT
                    const token = await tokenGenerator.sign(payload, {
                        privateKey,
                        keyid: TEST_KID,
                    });

                    // Determine expected behavior
                    const shouldAccept =
                        Array.isArray(audValue) && audValue.includes(expectedClientId);

                    // Validate
                    try {
                        const result = await validator.validate(token, expectedClientId);

                        if (shouldAccept) {
                            // Should have accepted
                            expect(result).toBeDefined();
                            expect(result.sub).toBe(payload.sub);
                            expect(result.payload).toBeDefined();
                        } else {
                            // Should have rejected but didn't — fail the property
                            throw new Error(
                                `Expected rejection but accepted: aud=${JSON.stringify(audValue)}, expectedClientId=${expectedClientId}`,
                            );
                        }
                    } catch (error) {
                        if (shouldAccept) {
                            // Should have accepted but rejected — fail the property
                            throw new Error(
                                `Expected acceptance but rejected: aud=${JSON.stringify(audValue)}, expectedClientId=${expectedClientId}, error=${error.message}`,
                            );
                        } else {
                            // Should have rejected — verify it's an OAuthException
                            expect(error).toBeInstanceOf(OAuthException);
                            expect(error.errorCode).toBe('invalid_request');
                        }
                    }
                },
            ),
            {numRuns: 100},
        );
    });

    // ── Additional edge case tests ────────────────────────────────────────

    it('rejects when aud is an empty array', async () => {
        const payload = {
            sub: 'user-123',
            aud: [], // Empty array
            iss: 'https://auth.test.example.com',
            iat: Math.floor(Date.now() / 1000),
            exp: Math.floor(Date.now() / 1000) + 3600,
        };

        const token = await tokenGenerator.sign(payload, {
            privateKey,
            keyid: TEST_KID,
        });

        await expect(validator.validate(token, 'any-client-id')).rejects.toThrow(OAuthException);
    });

    it('rejects when aud claim is missing entirely', async () => {
        const payload = {
            sub: 'user-123',
            // No aud claim
            iss: 'https://auth.test.example.com',
            iat: Math.floor(Date.now() / 1000),
            exp: Math.floor(Date.now() / 1000) + 3600,
        };

        const token = await tokenGenerator.sign(payload, {
            privateKey,
            keyid: TEST_KID,
        });

        await expect(validator.validate(token, 'any-client-id')).rejects.toThrow(OAuthException);
    });

    it('accepts expired id_token_hint (per OIDC Core §3.1.2.1)', async () => {
        const expectedClientId = 'client-123';
        const payload = {
            sub: 'user-123',
            aud: [expectedClientId],
            iss: 'https://auth.test.example.com',
            iat: Math.floor(Date.now() / 1000) - 7200, // 2 hours ago
            exp: Math.floor(Date.now() / 1000) - 3600, // Expired 1 hour ago
        };

        const token = await tokenGenerator.sign(payload, {
            privateKey,
            keyid: TEST_KID,
        });

        // Should accept even though expired
        const result = await validator.validate(token, expectedClientId);
        expect(result).toBeDefined();
        expect(result.sub).toBe('user-123');
    });

    it('rejects when kid is missing from JWT header', async () => {
        const payload = {
            sub: 'user-123',
            aud: ['client-123'],
            iss: 'https://auth.test.example.com',
            iat: Math.floor(Date.now() / 1000),
            exp: Math.floor(Date.now() / 1000) + 3600,
        };

        // Sign without kid
        const token = await tokenGenerator.sign(payload, {
            privateKey,
            // No keyid
        });

        await expect(validator.validate(token, 'client-123')).rejects.toThrow(OAuthException);
    });

    it('rejects when kid is unknown', async () => {
        const payload = {
            sub: 'user-123',
            aud: ['client-123'],
            iss: 'https://auth.test.example.com',
            iat: Math.floor(Date.now() / 1000),
            exp: Math.floor(Date.now() / 1000) + 3600,
        };

        const token = await tokenGenerator.sign(payload, {
            privateKey,
            keyid: 'unknown-kid-999',
        });

        // Mock getPublicKeyByKid to throw for unknown kid
        (signingKeyProvider.getPublicKeyByKid as jest.Mock).mockImplementationOnce(async (kid: string) => {
            if (kid === 'unknown-kid-999') {
                throw new Error('Key not found');
            }
            return publicKey;
        });

        await expect(validator.validate(token, 'client-123')).rejects.toThrow(OAuthException);
    });

    it('rejects when signature is invalid', async () => {
        const payload = {
            sub: 'user-123',
            aud: ['client-123'],
            iss: 'https://auth.test.example.com',
            iat: Math.floor(Date.now() / 1000),
            exp: Math.floor(Date.now() / 1000) + 3600,
        };

        // Sign with a different key
        const {privateKey: otherPrivateKey} = CryptUtil.generateKeyPair();
        const token = await tokenGenerator.sign(payload, {
            privateKey: otherPrivateKey,
            keyid: TEST_KID,
        });

        await expect(validator.validate(token, 'client-123')).rejects.toThrow(OAuthException);
    });

    it('rejects when sub is missing', async () => {
        const payload = {
            // No sub claim
            aud: ['client-123'],
            iss: 'https://auth.test.example.com',
            iat: Math.floor(Date.now() / 1000),
            exp: Math.floor(Date.now() / 1000) + 3600,
        };

        const token = await tokenGenerator.sign(payload, {
            privateKey,
            keyid: TEST_KID,
        });

        await expect(validator.validate(token, 'client-123')).rejects.toThrow(OAuthException);
    });
});
