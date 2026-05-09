const LOCALHOST_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

export function isValidRedirectUri(appUrl: string): boolean {
    if (!appUrl || typeof appUrl !== 'string') return false;
    const trimmed = appUrl.trim();
    if (trimmed.length === 0) return false;

    let url: URL;
    try {
        url = new URL(trimmed);
    } catch {
        return false;
    }

    if (url.protocol === 'https:') return !url.hash;
    if (url.protocol === 'http:') {
        if (!url.hostname) return false;
        if (LOCALHOST_HOSTNAMES.has(url.hostname)) return !url.hash;
        return false;
    }
    if (url.protocol && url.protocol !== ':') {
        return !!url.hostname && !url.hash;
    }
    return false;
}
