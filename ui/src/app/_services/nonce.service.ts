import {Injectable} from '@angular/core';

/**
 * Service for handling OIDC nonce generation, storage, and validation.
 * Prevents ID token replay attacks per OpenID Connect Core 1.0 §3.1.2.1.
 * The nonce binds a client session to an ID token — an attacker who intercepts
 * an ID token cannot replay it against a different session.
 */
@Injectable({
    providedIn: 'root',
})
export class NonceService {
    private readonly NONCE_KEY = 'oidc-nonce';

    /**
     * Generate a 32-byte cryptographically random nonce, base64url-encoded.
     * Uses window.crypto.getRandomValues() for cryptographic entropy.
     */
    generate(): string {
        const bytes = new Uint8Array(32);
        window.crypto.getRandomValues(bytes);
        return this.base64urlEncode(bytes);
    }

    /**
     * Store nonce in sessionStorage.
     */
    store(nonce: string): void {
        window.sessionStorage.setItem(this.NONCE_KEY, nonce);
    }

    /**
     * Retrieve stored nonce from sessionStorage.
     * Returns null if no nonce is stored.
     */
    retrieve(): string | null {
        return window.sessionStorage.getItem(this.NONCE_KEY);
    }

    /**
     * Clear stored nonce from sessionStorage.
     */
    clear(): void {
        window.sessionStorage.removeItem(this.NONCE_KEY);
    }

    /**
     * Validate that the nonce claim from the ID token matches the stored nonce.
     * Clears the stored nonce on success to prevent reuse.
     * Returns true if valid, false if mismatch or missing.
     */
    validate(idTokenNonceClaim: string | undefined): boolean {
        const storedNonce = this.retrieve();

        if (!storedNonce || !idTokenNonceClaim) {
            return false;
        }

        if (idTokenNonceClaim !== storedNonce) {
            return false;
        }

        this.clear();
        return true;
    }

    private base64urlEncode(bytes: Uint8Array): string {
        let str = '';
        for (let i = 0; i < bytes.byteLength; i++) {
            str += String.fromCharCode(bytes[i]);
        }
        return btoa(str)
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');
    }
}
