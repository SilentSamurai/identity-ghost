/// <reference types="cypress" />

/**
 * Cypress support helper for the Unified OAuth Authorization UI.
 *
 * Provides three utilities that the `ui/cypress/e2e/unified-authorize/` specs
 * rely on:
 *
 *   - `visitAuthorize(opts)`     — builds a `/authorize?...` URL from the
 *                                  supplied view + OAuth parameters + CSRF
 *                                  token and delegates to `cy.visit`.
 *   - `interceptAll()`           — registers `cy.intercept` handlers for every
 *                                  endpoint the unified component talks to and
 *                                  exposes them as aliases so individual tests
 *                                  can `cy.wait('@<alias>')` and inspect the
 *                                  captured request body.
 *   - `assertNoCredentialLeak(email, password)`
 *                                — checks every browser-side store the design
 *                                  forbids credentials from entering (see
 *                                  Property 2 "No credential leak to persistent
 *                                  storage" and Requirements 11.1–11.3).
 *
 * This file intentionally contains no test cases. It is imported once from
 * `ui/cypress/support/e2e.ts` so its types and helpers are available to every
 * spec under `ui/cypress/e2e/`.
 */

import type {OAuthParameters} from '../../src/app/open-pages/authorize/authorize.types';

/**
 * Options accepted by {@link visitAuthorize}.
 *
 * All fields are optional. Only defined values are serialised onto the URL;
 * `undefined` values are dropped so callers can pass `Partial<OAuthParameters>`
 * without polluting the query string.
 */
export interface VisitAuthorizeOptions {
    /** Value of the `view` query parameter (e.g. `login`, `consent`, `session-confirm`). */
    view?: string;
    /** Subset of OAuth parameters to append to the URL. */
    params?: Partial<OAuthParameters>;
    /** Value for the `csrf_token` query parameter. */
    csrfToken?: string;
}

/**
 * Alias names registered by {@link interceptAll}. Tests can `cy.wait('@<name>')`
 * on any of these to block on the corresponding request and then inspect the
 * interception object's `request.body` / `request.url`.
 */
export interface AuthorizeAliases {
    readonly authorize: 'authorizeGet';
    readonly login: 'loginPost';
    readonly consent: 'consentPost';
    readonly logout: 'logoutPost';
    readonly sessionInfo: 'sessionInfoGet';
}

/**
 * The ordered list of OAuth parameter keys serialised by {@link visitAuthorize}.
 *
 * Kept in a stable, well-known order so URL-based assertions in tests are
 * deterministic. The set is the same one declared on `OAuthParameters` in
 * `ui/src/app/open-pages/authorize/authorize.types.ts`.
 */
const OAUTH_PARAM_KEYS: ReadonlyArray<keyof OAuthParameters> = [
    'client_id',
    'redirect_uri',
    'response_type',
    'scope',
    'state',
    'code_challenge',
    'code_challenge_method',
    'nonce',
    'resource',
    'prompt',
    'max_age',
    'id_token_hint',
    'subscriber_tenant_hint',
];

/**
 * Cookie names that are legitimately set by the backend on the `/authorize`
 * flow. {@link assertNoCredentialLeak} ignores these when scanning
 * `document.cookie` — their values are opaque identifiers chosen by the
 * backend and cannot plausibly contain user-supplied credentials.
 */
const IGNORED_COOKIE_NAMES: ReadonlySet<string> = new Set(['sid', 'flow_id']);

/**
 * Build a `/authorize?...` URL from the given options and call `cy.visit` on
 * it. The URL is assembled with {@link URLSearchParams} so values are properly
 * percent-encoded.
 *
 * Usage:
 * ```ts
 * visitAuthorize({
 *   view: 'login',
 *   csrfToken: 'abc123',
 *   params: {
 *     client_id: 'demo.example.com',
 *     redirect_uri: 'https://app.example.com/cb',
 *     response_type: 'code',
 *     scope: 'openid profile',
 *     state: 's1',
 *   },
 * });
 * ```
 */
export function visitAuthorize(opts: VisitAuthorizeOptions = {}): Cypress.Chainable<Cypress.AUTWindow> {
    const qs = new URLSearchParams();

    if (opts.view !== undefined && opts.view !== null) {
        qs.set('view', String(opts.view));
    }
    if (opts.csrfToken !== undefined && opts.csrfToken !== null) {
        qs.set('csrf_token', String(opts.csrfToken));
    }

    const params = opts.params ?? {};
    for (const key of OAUTH_PARAM_KEYS) {
        const value = params[key];
        if (value !== undefined && value !== null && value !== '') {
            qs.set(key, String(value));
        }
    }

    const query = qs.toString();
    const url = query.length > 0 ? `/authorize?${query}` : '/authorize';
    return cy.visit(url);
}

/**
 * Register `cy.intercept` handlers for every endpoint the unified authorization
 * component talks to and expose them as aliases. Each handler uses a default
 * stub response that matches the design contract; individual tests can
 * override a handler by registering another `cy.intercept` for the same URL —
 * Cypress matches intercepts LIFO, so later registrations win.
 *
 * Returns the alias name map so tests can reference them without hard-coding
 * strings: `cy.wait(\`@\${aliases.login}\`)`.
 *
 * Aliases:
 *   - `@authorizeGet`   — `GET /api/oauth/authorize*`
 *   - `@loginPost`      — `POST /api/oauth/login`
 *   - `@consentPost`    — `POST /api/oauth/consent`
 *   - `@logoutPost`     — `POST /api/oauth/logout`
 *   - `@sessionInfoGet` — `GET /api/oauth/session-info`
 */
export function interceptAll(): AuthorizeAliases {
    // `GET /api/oauth/authorize*` — let it pass through to the real backend.
    // The helper only captures the request so tests can inspect the URL it
    // would have followed (used by param-preservation assertions).
    cy.intercept('GET', '**/api/oauth/authorize*').as('authorizeGet');

    cy.intercept('POST', '**/api/oauth/login', {
        statusCode: 200,
        body: {success: true},
    }).as('loginPost');

    cy.intercept('POST', '**/api/oauth/consent', {
        statusCode: 200,
        body: {success: true},
    }).as('consentPost');

    cy.intercept('POST', '**/api/oauth/logout', {
        statusCode: 204,
        body: '',
    }).as('logoutPost');

    cy.intercept('GET', '**/api/oauth/session-info', {
        statusCode: 200,
        body: {email: 'user@example.com'},
    }).as('sessionInfoGet');

    return {
        authorize: 'authorizeGet',
        login: 'loginPost',
        consent: 'consentPost',
        logout: 'logoutPost',
        sessionInfo: 'sessionInfoGet',
    } as const;
}

/**
 * Assert that neither the supplied `email` nor `password` substring appears in
 * any of the browser-side stores the design forbids credentials from entering:
 *
 *   - `window.localStorage`   (all keys and values)
 *   - `window.sessionStorage` (all keys and values)
 *   - `document.cookie`       (all cookies except `sid` and `flow_id`, which
 *                              are legitimately set by the backend and whose
 *                              values are opaque identifiers)
 *   - `window.history.state`  (JSON-serialised)
 *
 * Empty strings are ignored (an empty string is trivially a substring of every
 * string), guarding against `email = ''` misuse.
 *
 * Validates Property 2 "No credential leak to persistent storage" and
 * Requirements 11.1, 11.2, 11.3.
 */
export function assertNoCredentialLeak(email: string, password: string): void {
    const needles: string[] = [];
    if (typeof email === 'string' && email.length > 0) {
        needles.push(email);
    }
    if (typeof password === 'string' && password.length > 0) {
        needles.push(password);
    }
    if (needles.length === 0) {
        // Nothing to look for — defensive no-op.
        return;
    }

    cy.window({log: false}).then((win) => {
        // --- localStorage ---
        const localStorageDump = dumpStorage(win.localStorage);
        for (const needle of needles) {
            expect(
                localStorageDump,
                `localStorage must not contain the credential substring "${redact(needle)}"`,
            ).to.not.include(needle);
        }

        // --- sessionStorage ---
        const sessionStorageDump = dumpStorage(win.sessionStorage);
        for (const needle of needles) {
            expect(
                sessionStorageDump,
                `sessionStorage must not contain the credential substring "${redact(needle)}"`,
            ).to.not.include(needle);
        }

        // --- document.cookie (excluding sid and flow_id) ---
        const cookieDump = dumpCookies(win.document.cookie);
        for (const needle of needles) {
            expect(
                cookieDump,
                `document.cookie (excluding sid/flow_id) must not contain the credential substring "${redact(needle)}"`,
            ).to.not.include(needle);
        }

        // --- window.history.state ---
        const historyDump = dumpHistoryState(win.history.state);
        for (const needle of needles) {
            expect(
                historyDump,
                `window.history.state must not contain the credential substring "${redact(needle)}"`,
            ).to.not.include(needle);
        }
    });
}

/**
 * Concatenate every `(key, value)` pair of a `Storage` instance into a single
 * string so a substring search covers keys as well as values.
 */
function dumpStorage(store: Storage): string {
    const parts: string[] = [];
    for (let i = 0; i < store.length; i += 1) {
        const key = store.key(i);
        if (key === null) {
            continue;
        }
        const value = store.getItem(key) ?? '';
        parts.push(`${key}=${value}`);
    }
    return parts.join('\u0001'); // non-printable separator avoids accidental boundary matches
}

/**
 * Parse the raw `document.cookie` string and return a concatenation of every
 * cookie that is NOT in {@link IGNORED_COOKIE_NAMES}. Values are URL-decoded so
 * a credential substring smuggled via percent-encoding is still caught.
 */
function dumpCookies(rawCookie: string): string {
    if (!rawCookie) {
        return '';
    }
    const keptParts: string[] = [];
    for (const segment of rawCookie.split(';')) {
        const trimmed = segment.trim();
        if (trimmed.length === 0) {
            continue;
        }
        const eqIdx = trimmed.indexOf('=');
        const name = eqIdx === -1 ? trimmed : trimmed.slice(0, eqIdx);
        const rawValue = eqIdx === -1 ? '' : trimmed.slice(eqIdx + 1);
        if (IGNORED_COOKIE_NAMES.has(name)) {
            continue;
        }
        let decoded = rawValue;
        try {
            decoded = decodeURIComponent(rawValue);
        } catch {
            // Malformed encoding — fall back to the raw value.
        }
        keptParts.push(`${name}=${rawValue}\u0002${decoded}`);
    }
    return keptParts.join('\u0001');
}

/**
 * Serialise `window.history.state` (an arbitrary structured-cloneable value)
 * into a string suitable for substring scanning. Falls back to `String(state)`
 * if the value contains cycles or is otherwise not JSON-serialisable.
 */
function dumpHistoryState(state: unknown): string {
    if (state === null || state === undefined) {
        return '';
    }
    try {
        return JSON.stringify(state);
    } catch {
        return String(state);
    }
}

/**
 * Mask most of a credential in assertion messages so test output doesn't
 * accidentally log the exact value that was being searched for.
 */
function redact(value: string): string {
    if (value.length <= 2) {
        return '***';
    }
    return `${value.charAt(0)}***${value.charAt(value.length - 1)}`;
}
