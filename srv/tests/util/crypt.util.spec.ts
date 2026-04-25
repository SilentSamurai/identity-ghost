import {CryptUtil} from '../../src/util/crypt.util';
import * as otpGenerator from 'otp-generator';

describe('CryptUtil', () => {
    describe('generateKeyPair', () => {
        it('should generate an RSA key pair', () => {
            const keyPair = CryptUtil.generateKeyPair();
            expect(keyPair).toHaveProperty('publicKey');
            expect(keyPair).toHaveProperty('privateKey');
            expect(typeof keyPair.publicKey).toBe('string');
            expect(typeof keyPair.privateKey).toBe('string');
        });
    });

    describe('generateCodeVerifier', () => {
        it('should generate a code verifier of given length', () => {
            const verifier = CryptUtil.generateCodeVerifier(32);
            expect(typeof verifier).toBe('string');
            expect(verifier.length).toBe(32);
        });
    });

    describe('generateCodeChallenge', () => {
        it('should return S256 code challenge', () => {
            const verifier = 'testverifier';
            const challenge = CryptUtil.generateCodeChallenge(verifier, 'S256');
            expect(typeof challenge).toBe('string');
            expect(challenge.length).toBeGreaterThan(0);
        });
        it('should return OWH32 code challenge', () => {
            const verifier = 'testverifier';
            const challenge = CryptUtil.generateCodeChallenge(verifier, 'OWH32');
            expect(challenge).toBe(CryptUtil.oneWayHash(verifier));
        });
        it('should return verifier for unknown method', () => {
            const verifier = 'testverifier';
            const challenge = CryptUtil.generateCodeChallenge(verifier, 'plain');
            expect(challenge).toBe(verifier);
        });
    });

    describe('oneWayHash', () => {
        it('should return a string hash', () => {
            const hash = CryptUtil.oneWayHash('test');
            expect(typeof hash).toBe('string');
            expect(Number.isNaN(Number(hash))).toBe(false);
        });
    });

    describe('generateRandomString', () => {
        it('should generate a string of given length', () => {
            const str = CryptUtil.generateRandomString(10);
            expect(typeof str).toBe('string');
            expect(str.length).toBe(10);
        });
    });

    describe('generateOTP', () => {
        it('should generate an OTP of given length', () => {
            jest.spyOn(otpGenerator, 'generate').mockReturnValue('123456');
            const otp = CryptUtil.generateOTP(6);
            expect(otp).toBe('123456');
        });
    });
});
