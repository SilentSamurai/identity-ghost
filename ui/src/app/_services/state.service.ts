import {Injectable} from '@angular/core';

/**
 * Service for handling OAuth 2.0 state parameter generation, storage, and validation.
 * Prevents CSRF attacks on authorization redirects per RFC 6749 §10.12.
 * The state parameter binds an authorization response to the originating request —
 * an attacker who injects a forged authorization response cannot complete the flow.
 */
@Injectable({
    providedIn: 'root',
})
export class StateService {
    private readonly STATE_KEY = 'oauth-state';

    /**
     * Generate a 32-byte cryptographically random state, base64url-encoded.
     * Uses window.crypto.getRandomValues() for cryptographic entropy.
     */
    generate(): string {
        const bytes = new Uint8Array(32);
        window.crypto.getRandomValues(bytes);
        return this.base64urlEncode(bytes);
    }

    /**
     * Store state in sessionStorage.
     */
    store(state: string): void {
        window.sessionStorage.setItem(this.STATE_KEY, state);
    }

    /**
     * Retrieve stored state from sessionStorage.
     * Returns null if no state is stored.
     */
    retrieve(): string | null {
        return window.sessionStorage.getItem(this.STATE_KEY);
    }

    /**
     * Clear stored state from sessionStorage.
     */
    clear(): void {
        window.sessionStorage.removeItem(this.STATE_KEY);
    }

    /**
     * Validate that the returned state matches the stored state.
     * Clears the stored state on success to prevent reuse.
     * Retains the stored state on mismatch for diagnostic purposes.
     * Returns true if valid, false if mismatch or missing.
     */
    validate(returnedState: string | undefined): boolean {
        const storedState = this.retrieve();

        if (!storedState || !returnedState) {
            return false;
        }

        if (returnedState !== storedState) {
            // Retain stored value for diagnostic purposes
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
