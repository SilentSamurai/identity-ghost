import * as fc from 'fast-check';
import * as jwt from 'jsonwebtoken';
import { createHash } from 'crypto';
import { IdTokenService, GenerateIdTokenParams } from '../src/auth/id-token.service';
import { TokenService, SigningKeyProvider } from '../src/core/token-abstraction';
import { Environment } from '../src/config/environment.service';
import { CryptUtil } from '../src/util/crypt.util';
import { ClaimsResolverService } from '../src/auth/claims-resolver.service';

/**
 * Feature: id-token-generation — Property-Based Tests (P1–P9)
 *
 * These tests exercise IdTokenService.generateIdToken() with randomly
 * generated inputs via fast-check, validating the correctness properties
 * defined in the design document.
 */

// ── Shared test infrastructure ──────────────────────────────────────────

const TEST_ISSUER = 'https://auth.test.example.com';
const TEST_KID = 'test-kid-001';
const { privateKey, publicKey } = CryptUtil.generateKeyPair();

function createConfigService(): Environment {
    return {
        get: jest.fn((key: string, defaultValue?: any) => {
            if (key === 'SUPER_TENANT_DOMAIN') return TEST_ISSUER;
            if (key === 'ID_TOKEN_EXPIRATION_TIME_IN_SECONDS') return '3600';
            if (key === 'TOKEN_EXPIRATION_TIME') return '1h';
            return defaultValue ?? null;
        }),
    } as unknown as Environment;
}

function createSigningKeyProvider(): SigningKeyProvider {
    return {
        getSigningKeyWithKid: jest.fn().mockResolvedValue({ privateKey, kid: TEST_KID }),
        getPrivateKey: jest.fn().mockResolvedValue(privateKey),
        getPublicKey: jest.fn().mockResolvedValue(publicKey),
        getPublicKeyByKid: jest.fn().mockResolvedValue(publicKey),
        generateKeyPair: jest.fn().mockReturnValue({ privateKey, publicKey }),
    } as unknown as SigningKeyProvider;
}

let idTokenService: IdTokenService;
let tokenGenerator: TokenService;
let signingKeyProvider: SigningKeyProvider;

beforeAll(() => {
    const configService = createConfigService();
    // Use a JwtService without expiresIn defaults — IdTokenService sets exp directly in claims
    const { JwtService } = require('@nestjs/jwt');
    const jwtService = new JwtService({
        signOptions: { algorithm: 'RS256' },
    });
    tokenGenerator = {
        sign: (payload: any, options: any) => jwtService.signAsync(payload, options),
        verify: (token: string, options: any) => jwtService.verifyAsync(token, options),
        decode: (token: string) => jwtService.decode(token, { json: true }),
        decodeComplete: (token: string) => {
            const decoded = jwtService.decode(token, { complete: true }) as any;
            return decoded ?? { header: {}, payload: {} };
        },
    } as TokenService;
    signingKeyProvider = createSigningKeyProvider();
    const claimsResolverService = new ClaimsResolverService();
    idTokenService = new IdTokenService(
        tokenGenerator,
        signingKeyProvider,
        configService,
        claimsResolverService,
    );
});

// ── Arbitraries ─────────────────────────────────────────────────────────

const OIDC_SCOPES = ['openid', 'profile', 'email', 'offline_access'];

const uuidArb = fc.uuid();
const emailArb = fc.emailAddress();
const nameArb = fc.string({ minLength: 1, maxLength: 80 });
const scopeSetArb = fc.subarray(OIDC_SCOPES, { minLength: 0 });
const scopeSetWithOpenidArb = fc.subarray(OIDC_SCOPES, { minLength: 0 }).map(
    (scopes) => (scopes.includes('openid') ? scopes : ['openid', ...scopes]),
);
const accessTokenArb = fc.string({ minLength: 10, maxLength: 256 });
const nonceArb = fc.option(fc.string({ minLength: 1, maxLength: 128 }), { nil: undefined });
const acrArb = fc.option(fc.string({ minLength: 1, maxLength: 64 }), { nil: undefined });
const amrArb = fc.array(fc.constantFrom('pwd', 'mfa', 'otp', 'sms', 'face', 'fpt'), { minLength: 1, maxLength: 3 });
const authTimeArb = fc.integer({ min: 1600000000, max: 2000000000 });
const sessionIdArb = fc.uuid();

function paramsArb(scopeArb: fc.Arbitrary<string[]>): fc.Arbitrary<GenerateIdTokenParams> {
    return fc.record({
        user: fc.record({
            id: uuidArb,
            email: emailArb,
            name: nameArb,
            verified: fc.boolean(),
        }),
        tenantId: uuidArb,
        clientId: uuidArb,
        grantedScopes: scopeArb,
        accessToken: accessTokenArb,
        nonce: nonceArb,
        authTime: authTimeArb,
        sessionId: sessionIdArb,
        amr: amrArb,
        acr: acrArb,
    });
}


// ── P1: Conditional ID Token Generation ─────────────────────────────────

/**
 * Feature: id-token-generation, Property 1: Conditional ID token generation
 *
 * For any set of granted scopes, generateIdToken SHALL return a defined JWT
 * string if and only if the scope set contains "openid". When "openid" is
 * absent, the result SHALL be undefined.
 *
 * **Validates: Requirements 1.1, 1.2**
 */
describe('Feature: id-token-generation, Property 1: Conditional ID token generation', () => {
    it('returns a defined JWT iff openid is in the granted scopes', async () => {
        await fc.assert(
            fc.asyncProperty(paramsArb(scopeSetArb), async (params) => {
                const result = await idTokenService.generateIdToken(params);
                const hasOpenid = params.grantedScopes.includes('openid');

                if (hasOpenid) {
                    expect(result).toBeDefined();
                    expect(typeof result).toBe('string');
                    // Should be a valid JWT (3 dot-separated parts)
                    expect(result!.split('.').length).toBe(3);
                } else {
                    expect(result).toBeUndefined();
                }
            }),
            { numRuns: 100 },
        );
    });
});

// ── P2: Mandatory Claims Presence and Correctness ───────────────────────

/**
 * Feature: id-token-generation, Property 2: Mandatory claims presence and correctness
 *
 * For any valid GenerateIdTokenParams where openid is in the granted scopes,
 * the decoded ID token payload SHALL contain: iss equal to the configured
 * issuer, sub equal to user.id, aud as an array containing clientId, azp
 * equal to clientId, exp as a numeric timestamp greater than iat, and iat
 * as a numeric timestamp.
 *
 * **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 7.3**
 */
describe('Feature: id-token-generation, Property 2: Mandatory claims presence and correctness', () => {
    it('decoded token contains all mandatory claims with correct values', async () => {
        await fc.assert(
            fc.asyncProperty(paramsArb(scopeSetWithOpenidArb), async (params) => {
                const token = await idTokenService.generateIdToken(params);
                expect(token).toBeDefined();

                const decoded = jwt.decode(token!) as Record<string, any>;
                expect(decoded).toBeTruthy();

                // iss matches configured issuer
                expect(decoded.iss).toBe(TEST_ISSUER);
                // sub matches user.id
                expect(decoded.sub).toBe(params.user.id);
                // aud is an array containing clientId
                expect(Array.isArray(decoded.aud)).toBe(true);
                expect(decoded.aud).toContain(params.clientId);
                // azp equals clientId
                expect(decoded.azp).toBe(params.clientId);
                // iat is a number
                expect(typeof decoded.iat).toBe('number');
                // exp is a number greater than iat
                expect(typeof decoded.exp).toBe('number');
                expect(decoded.exp).toBeGreaterThan(decoded.iat);
            }),
            { numRuns: 100 },
        );
    });
});

// ── P3: Session and Authentication Context Claims ───────────────────────

/**
 * Feature: id-token-generation, Property 3: Session and authentication context claims
 *
 * For any valid GenerateIdTokenParams with openid scope, the decoded ID token
 * SHALL contain auth_time matching the provided value, sid matching the
 * provided session ID, and amr matching the provided array. The acr claim
 * SHALL be present if and only if a non-null acr value was provided.
 *
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5**
 */
describe('Feature: id-token-generation, Property 3: Session and authentication context claims', () => {
    it('session and auth context claims match provided values', async () => {
        await fc.assert(
            fc.asyncProperty(paramsArb(scopeSetWithOpenidArb), async (params) => {
                const token = await idTokenService.generateIdToken(params);
                const decoded = jwt.decode(token!) as Record<string, any>;

                // auth_time matches provided value
                expect(decoded.auth_time).toBe(params.authTime);
                // sid matches provided session ID
                expect(decoded.sid).toBe(params.sessionId);
                // amr matches provided array
                expect(decoded.amr).toEqual(params.amr);

                // acr present iff provided
                if (params.acr !== undefined) {
                    expect(decoded.acr).toBe(params.acr);
                } else {
                    expect(decoded.acr).toBeUndefined();
                }
            }),
            { numRuns: 100 },
        );
    });
});


// ── P4: Nonce Echo-Back ─────────────────────────────────────────────────

/**
 * Feature: id-token-generation, Property 4: Nonce echo-back
 *
 * For any valid GenerateIdTokenParams with openid scope, the decoded ID token
 * SHALL contain the nonce claim with the exact provided value if and only if
 * a nonce was provided. When no nonce is provided, the nonce key SHALL be
 * absent from the payload.
 *
 * **Validates: Requirements 4.1, 4.2**
 */
describe('Feature: id-token-generation, Property 4: Nonce echo-back', () => {
    it('nonce is present with exact value iff provided, absent otherwise', async () => {
        await fc.assert(
            fc.asyncProperty(paramsArb(scopeSetWithOpenidArb), async (params) => {
                const token = await idTokenService.generateIdToken(params);
                const decoded = jwt.decode(token!) as Record<string, any>;

                if (params.nonce !== undefined) {
                    expect(decoded.nonce).toBe(params.nonce);
                } else {
                    expect(decoded.nonce).toBeUndefined();
                }
            }),
            { numRuns: 100 },
        );
    });
});

// ── P5: Access Token Hash Correctness ───────────────────────────────────

/**
 * Feature: id-token-generation, Property 5: Access token hash correctness
 *
 * For any access token string, the at_hash claim in the decoded ID token
 * SHALL equal the base64url encoding (without padding) of the left half of
 * the SHA-256 hash of the ASCII access token string.
 *
 * **Validates: Requirements 5.1, 5.2**
 */
describe('Feature: id-token-generation, Property 5: Access token hash correctness', () => {
    it('at_hash matches independent SHA-256 left-half base64url computation', async () => {
        await fc.assert(
            fc.asyncProperty(paramsArb(scopeSetWithOpenidArb), async (params) => {
                const token = await idTokenService.generateIdToken(params);
                const decoded = jwt.decode(token!) as Record<string, any>;

                // Independent at_hash computation
                const hash = createHash('sha256').update(params.accessToken, 'ascii').digest();
                const leftHalf = hash.subarray(0, hash.length / 2);
                const expectedAtHash = leftHalf.toString('base64url');

                expect(decoded.at_hash).toBe(expectedAtHash);
            }),
            { numRuns: 100 },
        );
    });
});

// ── P6: Scope-Dependent Identity Claims ─────────────────────────────────

/**
 * Feature: id-token-generation, Property 6: Scope-dependent identity claims
 *
 * For any valid GenerateIdTokenParams with openid scope: the name claim SHALL
 * be present iff profile is in the granted scopes; the email and email_verified
 * claims SHALL be present iff email is in the granted scopes. When present,
 * values SHALL match the user object.
 *
 * **Validates: Requirements 6.1, 6.2, 6.3, 6.4**
 */
describe('Feature: id-token-generation, Property 6: Scope-dependent identity claims', () => {
    it('name present iff profile scope; email/email_verified present iff email scope', async () => {
        await fc.assert(
            fc.asyncProperty(paramsArb(scopeSetWithOpenidArb), async (params) => {
                const token = await idTokenService.generateIdToken(params);
                const decoded = jwt.decode(token!) as Record<string, any>;

                const hasProfile = params.grantedScopes.includes('profile');
                const hasEmail = params.grantedScopes.includes('email');

                // name claim (voluntary omission: empty name → omitted)
                if (hasProfile && params.user.name) {
                    expect(decoded.name).toBe(params.user.name);
                } else {
                    expect(decoded.name).toBeUndefined();
                }

                // email and email_verified claims (voluntary omission: empty email → omitted)
                if (hasEmail && params.user.email) {
                    expect(decoded.email).toBe(params.user.email);
                    expect(decoded.email_verified).toBe(params.user.verified);
                } else {
                    expect(decoded.email).toBeUndefined();
                    expect(decoded.email_verified).toBeUndefined();
                }
            }),
            { numRuns: 100 },
        );
    });
});


// ── P7: JWT Signing Structure ───────────────────────────────────────────

/**
 * Feature: id-token-generation, Property 7: JWT signing structure
 *
 * For any generated ID token, the JWT header SHALL have alg equal to "RS256"
 * and SHALL contain a kid field matching the key identifier returned by the
 * SigningKeyProvider.
 *
 * **Validates: Requirements 7.1, 7.2**
 */
describe('Feature: id-token-generation, Property 7: JWT signing structure', () => {
    it('JWT header has alg RS256 and kid matching the signing key provider', async () => {
        await fc.assert(
            fc.asyncProperty(paramsArb(scopeSetWithOpenidArb), async (params) => {
                const token = await idTokenService.generateIdToken(params);
                expect(token).toBeDefined();

                const decoded = jwt.decode(token!, { complete: true }) as jwt.Jwt;
                expect(decoded).toBeTruthy();

                expect(decoded.header.alg).toBe('RS256');
                expect(decoded.header.kid).toBe(TEST_KID);
            }),
            { numRuns: 100 },
        );
    });
});

// ── P8: Sign-Decode Round-Trip Integrity ────────────────────────────────

/**
 * Feature: id-token-generation, Property 8: Sign-decode round-trip integrity
 *
 * For any valid set of ID token claims, signing the claims into a JWT and
 * then decoding the JWT SHALL produce a payload where every original claim
 * key is present and its value is equivalent to the original.
 *
 * **Validates: Requirements 8.1**
 */
describe('Feature: id-token-generation, Property 8: Sign-decode round-trip integrity', () => {
    it('sign then decode preserves all original claims', async () => {
        await fc.assert(
            fc.asyncProperty(paramsArb(scopeSetWithOpenidArb), async (params) => {
                const token = await idTokenService.generateIdToken(params);
                const decoded = jwt.decode(token!) as Record<string, any>;

                // Verify all expected claims are preserved
                expect(decoded.iss).toBe(TEST_ISSUER);
                expect(decoded.sub).toBe(params.user.id);
                expect(decoded.aud).toEqual([params.clientId]);
                expect(decoded.azp).toBe(params.clientId);
                expect(typeof decoded.iat).toBe('number');
                expect(typeof decoded.exp).toBe('number');
                expect(decoded.auth_time).toBe(params.authTime);
                expect(decoded.sid).toBe(params.sessionId);
                expect(decoded.amr).toEqual(params.amr);

                // at_hash is present
                expect(decoded.at_hash).toBeDefined();

                // Conditional claims preserved correctly
                if (params.nonce !== undefined) {
                    expect(decoded.nonce).toBe(params.nonce);
                }
                if (params.acr !== undefined) {
                    expect(decoded.acr).toBe(params.acr);
                }
                if (params.grantedScopes.includes('profile') && params.user.name) {
                    expect(decoded.name).toBe(params.user.name);
                }
                if (params.grantedScopes.includes('email') && params.user.email) {
                    expect(decoded.email).toBe(params.user.email);
                    expect(decoded.email_verified).toBe(params.user.verified);
                }
            }),
            { numRuns: 100 },
        );
    });
});

// ── P9: Idempotent Re-Signing ───────────────────────────────────────────

/**
 * Feature: id-token-generation, Property 9: Idempotent re-signing
 *
 * For any valid set of ID token claims, signing → decoding → re-signing
 * (with the same iat and exp) → decoding SHALL produce a payload equivalent
 * to the first decoded payload.
 *
 * **Validates: Requirements 8.2**
 */
describe('Feature: id-token-generation, Property 9: Idempotent re-signing', () => {
    it('sign → decode → re-sign → decode produces equivalent payloads', async () => {
        await fc.assert(
            fc.asyncProperty(paramsArb(scopeSetWithOpenidArb), async (params) => {
                // First sign
                const token1 = await idTokenService.generateIdToken(params);
                const decoded1 = jwt.decode(token1!) as Record<string, any>;

                // Re-sign the decoded payload (strip JWT-added fields, keep iat/exp)
                const { iat, exp, ...restClaims } = decoded1;
                const token2 = await tokenGenerator.sign(
                    { ...restClaims, iat, exp },
                    { privateKey, keyid: TEST_KID },
                );
                const decoded2 = jwt.decode(token2) as Record<string, any>;

                // Payloads should be equivalent
                expect(decoded2.iss).toBe(decoded1.iss);
                expect(decoded2.sub).toBe(decoded1.sub);
                expect(decoded2.aud).toEqual(decoded1.aud);
                expect(decoded2.azp).toBe(decoded1.azp);
                expect(decoded2.iat).toBe(decoded1.iat);
                expect(decoded2.exp).toBe(decoded1.exp);
                expect(decoded2.auth_time).toBe(decoded1.auth_time);
                expect(decoded2.sid).toBe(decoded1.sid);
                expect(decoded2.amr).toEqual(decoded1.amr);
                expect(decoded2.at_hash).toBe(decoded1.at_hash);

                // Conditional claims
                if (decoded1.nonce !== undefined) {
                    expect(decoded2.nonce).toBe(decoded1.nonce);
                }
                if (decoded1.acr !== undefined) {
                    expect(decoded2.acr).toBe(decoded1.acr);
                }
                if (decoded1.name !== undefined) {
                    expect(decoded2.name).toBe(decoded1.name);
                }
                if (decoded1.email !== undefined) {
                    expect(decoded2.email).toBe(decoded1.email);
                    expect(decoded2.email_verified).toBe(decoded1.email_verified);
                }
            }),
            { numRuns: 100 },
        );
    });
});
