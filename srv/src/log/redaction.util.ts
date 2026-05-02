/**
 * Redaction utilities for sanitizing sensitive data in logs.
 *
 * These functions ensure that sensitive OAuth fields (passwords, tokens, secrets)
 * are never written to logs in plaintext, protecting against credential exposure
 * if log storage is compromised.
 *
 * @module redaction.util
 */

/**
 * Set of field names that must be redacted from logs.
 * These are OAuth/OIDC sensitive fields that contain credentials or secrets.
 */
export const SENSITIVE_FIELDS = new Set([
    'password',
    'client_secret',
    'code',
    'access_token',
    'refresh_token',
    'id_token',
    'token',
    'code_verifier',
]);

/**
 * Redacts sensitive field values in a request body object.
 *
 * Creates a shallow clone of the input object with all sensitive field values
 * replaced with "[REDACTED]". Non-sensitive fields retain their original values.
 *
 * @param body - The request body object to redact
 * @returns A new object with sensitive fields redacted
 *
 * @example
 * ```typescript
 * redactBody({ client_id: 'abc', client_secret: 'secret123' });
 * // Returns: { client_id: 'abc', client_secret: '[REDACTED]' }
 * ```
 */
export function redactBody(body: Record<string, any>): Record<string, any> {
    const redacted: Record<string, any> = {};
    for (const [key, value] of Object.entries(body)) {
        redacted[key] = SENSITIVE_FIELDS.has(key) ? '[REDACTED]' : value;
    }
    return redacted;
}

/**
 * Masks an authorization code for safe logging.
 *
 * Returns the first 4 characters (or fewer if the code is shorter) followed by "****".
 * This provides enough context for debugging while preventing the full code from
 * appearing in logs.
 *
 * @param code - The authorization code to mask
 * @returns The masked code string
 *
 * @example
 * ```typescript
 * maskAuthCode('aBcD1234xyz');
 * // Returns: 'aBcD****'
 *
 * maskAuthCode('ab');
 * // Returns: 'ab****'
 * ```
 */
export function maskAuthCode(code: string): string {
    const prefixLength = Math.min(4, code.length);
    const prefix = code.substring(0, prefixLength);
    return `${prefix}****`;
}

/**
 * Redacts an Authorization header value for safe logging.
 *
 * Returns "[REDACTED]" for any non-empty header value, preserving the fact
 * that an Authorization header was present without exposing the credential.
 *
 * @param headerValue - The Authorization header value to redact
 * @returns "[REDACTED]" if the header has content, empty string otherwise
 *
 * @example
 * ```typescript
 * redactAuthorizationHeader('Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...');
 * // Returns: '[REDACTED]'
 *
 * redactAuthorizationHeader('');
 * // Returns: ''
 * ```
 */
export function redactAuthorizationHeader(headerValue: string): string {
    if (!headerValue || headerValue.length === 0) {
        return '';
    }
    return '[REDACTED]';
}
