/**
 * Shared utilities for tests that use the native `fetch` API
 * (as opposed to supertest) — e.g. openid-client compliance tests.
 */

/**
 * Extract the `name=value` portion of a Set-Cookie header from a fetch Response.
 * Returns the cookie value string (e.g. `flow_id=abc123`) or undefined if not found.
 */
export function extractCookie(res: Response, name: string): string | undefined {
    const headers = res.headers as any;
    const cookies: string[] = typeof headers.getSetCookie === 'function'
        ? headers.getSetCookie()
        : (headers.get('set-cookie') ? [headers.get('set-cookie') as string] : []);

    const match = cookies.find((c: string) => c.trim().startsWith(`${name}=`));
    return match ? match.trim().split(';')[0] : undefined;
}

/**
 * Extract the CSRF token from a `/authorize` redirect response.
 *
 * When `/authorize` is called without a session, the server responds with a 302
 * whose Location header contains a `csrf_token` query param. This helper extracts it.
 *
 * @param res          The fetch Response from GET /api/oauth/authorize (redirect: 'manual')
 * @param fallbackBase Base URL used to resolve relative Location headers (e.g. `http://127.0.0.1:9001`)
 * @returns `{ flowIdCookie, csrfToken }` — flowIdCookie is the raw `flow_id=...` value
 *          (without attributes), csrfToken is the token string. Either may be empty if
 *          the server didn't provide them.
 */
export function extractFlowContext(res: Response, fallbackBase: string): { flowIdCookie: string; csrfToken: string } {
    const flowIdCookie = extractCookie(res, 'flow_id') ?? '';
    const location = res.headers.get('location') ?? '';
    const csrfToken = location
        ? new URL(location, fallbackBase).searchParams.get('csrf_token') ?? ''
        : '';
    return { flowIdCookie, csrfToken };
}

// ---------------------------------------------------------------------------
// OAuth browser-flow helpers
// ---------------------------------------------------------------------------
// These helpers model the individual steps of the browser-driven OAuth flow
// (GET /authorize → POST /login → POST /consent → GET /authorize) using the
// native fetch API. They are intentionally stateless — all context is passed
// explicitly so they can be reused across test suites.
// ---------------------------------------------------------------------------

/**
 * Step 1 — Start an authorization flow without a session.
 *
 * Hits GET `authUrl` with no cookies. The server mints a `flow_id` cookie
 * (stable for the entire flow) and embeds a `csrf_token` in the redirect
 * location (derived via HMAC from the flow_id, so also stable).
 *
 * @param authUrl Full `/authorize` URL including all OAuth params
 * @returns `{ flowIdCookie, csrfToken }` to carry through the rest of the flow
 */
export async function extractFlowIdCookieAndCsrf(authUrl: string): Promise<{ flowIdCookie: string; csrfToken: string }> {
    const res = await fetch(authUrl, {redirect: 'manual'});
    expect(res.status).toBe(302);

    const flowIdCookie = extractCookie(res, 'flow_id') ?? '';
    const location = res.headers.get('location') ?? '';
    const csrfToken = location
        ? new URL(location).searchParams.get('csrf_token') ?? ''
        : '';

    return {flowIdCookie, csrfToken};
}

/**
 * Step 2 — POST credentials to create a session.
 *
 * Sends email + password to POST `/api/oauth/login`, carrying the `flow_id`
 * cookie so the server can verify the `csrf_token`. Returns the signed `sid`
 * cookie from the response.
 *
 * @param baseUrl      Server base URL (e.g. `http://127.0.0.1:9001`)
 * @param clientId     OAuth `client_id`
 * @param email        User email
 * @param password     User password
 * @param flowIdCookie The `flow_id=...` cookie value from `extractFlowIdAndCsrf`
 * @param csrfToken    The csrf token from `extractFlowIdAndCsrf`
 * @returns The signed `sid=...` cookie value
 */
export async function login(
    baseUrl: string,
    clientId: string,
    email: string,
    password: string,
    flowIdCookie: string,
    csrfToken: string,
): Promise<string> {
    const res = await fetch(`${baseUrl}/api/oauth/login`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...(flowIdCookie && {cookie: flowIdCookie}),
        },
        body: JSON.stringify({email, password, client_id: clientId, csrf_token: csrfToken}),
    });

    if (!res.ok) {
        throw new Error(`POST /api/oauth/login failed with status ${res.status}`);
    }

    const sidCookie = extractCookie(res, 'sid');
    if (!sidCookie) throw new Error('sid cookie not found after login');

    return sidCookie;
}

/**
 * Step 3a — Grant consent for a third-party client if required.
 *
 * Checks whether the current `authorizeLocation` is a consent redirect
 * (`view=consent`). If not, returns the inputs unchanged — the caller can
 * always call this unconditionally.
 *
 * When consent is required: POSTs `decision=grant` to `/api/oauth/consent`,
 * then retries GET /authorize so the server can proceed to session-confirm
 * or code issuance.
 *
 * The `csrf_token` is read from `authorizeLocation` — it is the same
 * HMAC-derived value as the one from `extractFlowIdCookieAndCsrf` since the
 * `flow_id` cookie is stable across the whole flow.
 *
 * @param baseUrl            Server base URL
 * @param clientId           OAuth `client_id`
 * @param scope              Space-separated scopes being requested
 * @param sessionCookies     Combined `sid=...; flow_id=...` cookie string
 * @param authorizeLocation  The Location header from the current /authorize redirect
 * @param authUrlWithConfirm The /authorize URL with `session_confirmed=true` appended
 * @returns `{ authorizeRes, authorizeLocation }` — updated if consent was granted, unchanged otherwise
 */
export async function grantConsent(
    baseUrl: string,
    clientId: string,
    scope: string,
    sessionCookies: string,
    authorizeLocation: string,
    authUrlWithConfirm: string,
): Promise<{ authorizeRes: Response | null; authorizeLocation: string }> {
    if (!authorizeLocation.includes('view=consent')) {
        return {authorizeRes: null, authorizeLocation};
    }

    const csrfToken = new URL(authorizeLocation, baseUrl).searchParams.get('csrf_token') ?? '';

    const consentRes = await fetch(`${baseUrl}/api/oauth/consent`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            cookie: sessionCookies,
        },
        body: JSON.stringify({
            decision: 'grant',
            client_id: clientId,
            scope,
            csrf_token: csrfToken,
        }),
    });

    if (!consentRes.ok) {
        throw new Error(`POST /api/oauth/consent failed with status ${consentRes.status}`);
    }

    // Retry /authorize — consent is now recorded; server will either issue the
    // code (if session-confirm is skipped/confirmed) or redirect to session-confirm.
    const authorizeRes = await fetch(authUrlWithConfirm, {
        redirect: 'manual',
        headers: {cookie: sessionCookies},
    });

    expect(authorizeRes.status).toBe(302);

    return {authorizeRes, authorizeLocation: authorizeRes.headers.get('location') ?? ''};
}

/**
 * Step 3b — Acknowledge an existing session (session-confirm) if required.
 *
 * Checks whether the current `authorizeLocation` is a session-confirm redirect
 * (`view=session-confirm`). If not, returns the inputs unchanged — the caller
 * can always call this unconditionally.
 *
 * When session-confirm is required: retries GET /authorize with
 * `session_confirmed=true` (already present in `authUrlWithConfirm`) to
 * signal the user's acknowledgement.
 *
 * @param authUrlWithConfirm The /authorize URL with `session_confirmed=true` appended
 * @param sessionCookies     Combined `sid=...; flow_id=...` cookie string
 * @param authorizeLocation  The Location header from the current /authorize redirect
 * @returns `{ authorizeRes, authorizeLocation }` — updated if confirmation was needed, unchanged otherwise
 */
export async function confirmSession(
    authUrlWithConfirm: string,
    sessionCookies: string,
    authorizeLocation: string,
): Promise<{ authorizeRes: Response | null; authorizeLocation: string }> {
    if (!authorizeLocation.includes('view=session-confirm')) {
        return {authorizeRes: null, authorizeLocation};
    }

    const authorizeRes = await fetch(authUrlWithConfirm, {
        redirect: 'manual',
        headers: {cookie: sessionCookies},
    });

    expect(authorizeRes.status).toBe(302);

    return {authorizeRes, authorizeLocation: authorizeRes.headers.get('location') ?? ''};
}
