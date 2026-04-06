import * as fc from 'fast-check';
import {createHash} from 'crypto';

/**
 * Feature: pkce-compliance, Property 3: S256 cross-implementation consistency (UI ↔ Server)
 *
 * For any valid code verifier, the pure JS SHA-256 (UI fallback) produces the same
 * challenge as Node.js crypto.createHash('sha256') (server).
 *
 * Validates: Requirements 3.1, 3.5
 */

/**
 * Pure JavaScript SHA-256 implementation — identical to the one in
 * ui/src/app/_services/pkce.service.ts (sha256Fallback).
 * Duplicated here so the property test validates the algorithm itself
 * against Node's native crypto without depending on UI build tooling.
 */
function sha256Fallback(message: Uint8Array): Uint8Array {
    const K: number[] = [
        0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5,
        0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
        0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
        0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
        0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
        0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
        0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
        0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
        0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
        0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
        0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3,
        0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
        0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5,
        0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
        0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
        0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
    ];

    function rotr(n: number, x: number): number {
        return (x >>> n) | (x << (32 - n));
    }
    function ch(x: number, y: number, z: number): number {
        return (x & y) ^ (~x & z);
    }
    function maj(x: number, y: number, z: number): number {
        return (x & y) ^ (x & z) ^ (y & z);
    }
    function sigma0(x: number): number {
        return rotr(2, x) ^ rotr(13, x) ^ rotr(22, x);
    }
    function sigma1(x: number): number {
        return rotr(6, x) ^ rotr(11, x) ^ rotr(25, x);
    }
    function gamma0(x: number): number {
        return rotr(7, x) ^ rotr(18, x) ^ (x >>> 3);
    }
    function gamma1(x: number): number {
        return rotr(17, x) ^ rotr(19, x) ^ (x >>> 10);
    }

    const msgLen = message.length;
    const bitLen = msgLen * 8;
    const totalLen = Math.ceil((msgLen + 9) / 64) * 64;
    const padded = new Uint8Array(totalLen);
    padded.set(message);
    padded[msgLen] = 0x80;
    const view = new DataView(padded.buffer);
    view.setUint32(totalLen - 4, bitLen, false);

    let h0 = 0x6a09e667;
    let h1 = 0xbb67ae85;
    let h2 = 0x3c6ef372;
    let h3 = 0xa54ff53a;
    let h4 = 0x510e527f;
    let h5 = 0x9b05688c;
    let h6 = 0x1f83d9ab;
    let h7 = 0x5be0cd19;

    for (let offset = 0; offset < totalLen; offset += 64) {
        const W = new Array<number>(64);
        for (let t = 0; t < 16; t++) {
            W[t] = view.getUint32(offset + t * 4, false);
        }
        for (let t = 16; t < 64; t++) {
            W[t] = (gamma1(W[t - 2]) + W[t - 7] + gamma0(W[t - 15]) + W[t - 16]) | 0;
        }

        let a = h0, b = h1, c = h2, d = h3;
        let e = h4, f = h5, g = h6, h = h7;

        for (let t = 0; t < 64; t++) {
            const T1 = (h + sigma1(e) + ch(e, f, g) + K[t] + W[t]) | 0;
            const T2 = (sigma0(a) + maj(a, b, c)) | 0;
            h = g; g = f; f = e;
            e = (d + T1) | 0;
            d = c; c = b; b = a;
            a = (T1 + T2) | 0;
        }

        h0 = (h0 + a) | 0;
        h1 = (h1 + b) | 0;
        h2 = (h2 + c) | 0;
        h3 = (h3 + d) | 0;
        h4 = (h4 + e) | 0;
        h5 = (h5 + f) | 0;
        h6 = (h6 + g) | 0;
        h7 = (h7 + h) | 0;
    }

    const result = new Uint8Array(32);
    const rv = new DataView(result.buffer);
    rv.setUint32(0, h0, false);
    rv.setUint32(4, h1, false);
    rv.setUint32(8, h2, false);
    rv.setUint32(12, h3, false);
    rv.setUint32(16, h4, false);
    rv.setUint32(20, h5, false);
    rv.setUint32(24, h6, false);
    rv.setUint32(28, h7, false);
    return result;
}

function base64urlencode(buffer: ArrayBuffer): string {
    let str = '';
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.byteLength; i++) {
        str += String.fromCharCode(bytes[i]);
    }
    return Buffer.from(str, 'binary')
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
}

function serverS256(verifier: string): string {
    const hash = createHash('sha256').update(verifier).digest();
    return hash
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
}

function uiFallbackS256(verifier: string): string {
    const encoder = new TextEncoder();
    const data = encoder.encode(verifier);
    const hash = sha256Fallback(data);
    return base64urlencode(hash.buffer as ArrayBuffer);
}

describe('Property 3: S256 cross-implementation consistency (UI ↔ Server)', () => {

    const UNRESERVED_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
    const unreservedCharArb = fc.constantFrom(...UNRESERVED_CHARS.split(''));
    const validVerifierArb = fc.integer({min: 43, max: 128}).chain((len: number) =>
        fc.array(unreservedCharArb, {minLength: len, maxLength: len})
            .map((chars: string[]) => chars.join('')),
    );

    it('pure JS SHA-256 (UI fallback) produces the same challenge as Node.js crypto (server)', () => {
        fc.assert(
            fc.property(validVerifierArb, (verifier: string) => {
                const serverChallenge = serverS256(verifier);
                const uiChallenge = uiFallbackS256(verifier);

                expect(uiChallenge).toEqual(serverChallenge);
            }),
            {numRuns: 100},
        );
    });

    it('both implementations produce valid base64url output of 43 chars', () => {
        fc.assert(
            fc.property(validVerifierArb, (verifier: string) => {
                const serverChallenge = serverS256(verifier);
                const uiChallenge = uiFallbackS256(verifier);

                // SHA-256 → 32 bytes → base64url without padding = 43 chars
                expect(serverChallenge.length).toBe(43);
                expect(uiChallenge.length).toBe(43);

                // Valid base64url characters only
                expect(serverChallenge).toMatch(/^[A-Za-z0-9_-]+$/);
                expect(uiChallenge).toMatch(/^[A-Za-z0-9_-]+$/);
            }),
            {numRuns: 100},
        );
    });
});
