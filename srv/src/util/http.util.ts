/**
 * Parses HTTP Basic Authentication credentials from an Authorization header.
 *
 * Handles the `Basic <base64(id:secret)>` scheme per RFC 7617.
 * Returns null if the header is absent, not a Basic scheme, or malformed.
 *
 * @param authorizationHeader - The raw value of the Authorization header
 * @returns Parsed `{ username, password }` or `null`
 */
export function parseBasicAuthHeader(
    authorizationHeader: string | undefined,
): { username: string; password: string } | null {
    if (!authorizationHeader || !authorizationHeader.startsWith('Basic ')) {
        return null;
    }
    try {
        const base64Credentials = authorizationHeader.split(' ')[1];
        const decoded = Buffer.from(base64Credentials, 'base64').toString('utf-8');
        const colonIndex = decoded.indexOf(':');
        if (colonIndex === -1) return null;
        const username = decoded.substring(0, colonIndex);
        const password = decoded.substring(colonIndex + 1);
        if (!username || !password) return null;
        return { username, password };
    } catch {
        return null;
    }
}
