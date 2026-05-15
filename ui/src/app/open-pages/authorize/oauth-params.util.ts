/**
 * Pure parse / serialize helpers for OAuth parameters in the Unified OAuth
 * Authorization UI.
 *
 * These are the only places where OAuth parameters cross the URL / object
 * boundary. The helpers have no Angular dependencies (only the `ParamMap`
 * type for the parse input), so they are trivially verifiable and never
 * reach into `Component_State` directly.
 *
 * Design references: see `design.md` → "Components and Interfaces
 * → oauth-params.util.ts" and `requirements.md` Requirements 1.2, 1.3, 1.7,
 * 2.6, 7.9, 9.1, 9.5, 9.6, 10.5, 13.4. Related correctness properties: P1
 * (OAuth parameter immutability), P7 (no OAuth params on non-backend
 * redirects), P8 (one-shot flags isolation).
 */

import { ParamMap } from '@angular/router';

import { OAuthParameters } from './authorize.types';

/**
 * The valid set of `view` query values the backend may emit when redirecting
 * to `/authorize`. `tenant-selection` is deliberately excluded: it is an
 * internal component state reached only after a login response with
 * `requires_tenant_selection: true`, never requested via the URL (see
 * `design.md` Architecture).
 */
const VALID_VIEWS: ReadonlyArray<string> = ['login', 'consent', 'session-confirm'];

/**
 * Stable iteration order for serialisation. Matches the field order declared
 * on `OAuthParameters` in `unified-authorize.types.ts`. The order is part of
 * the public contract of `serializeOAuthParameters` — tests assert that the
 * emitted query string is identical across re-serialisation (Property 1,
 * Property 12 on the backend side).
 *
 * `session_confirmed` and `from_logout` are intentionally absent: they are
 * one-shot flags appended exclusively by `AuthorizeRedirectBuilder`
 * (Property 8, Requirements 7.7, 7.8).
 */
const OAUTH_PARAMETER_KEYS: ReadonlyArray<keyof OAuthParameters> = [
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
 * Discriminator for the failure modes of `parseOAuthParametersFromUrl`. Each
 * value maps to a row in the error table in `design.md` → "Error Handling".
 *
 *   - `missing_client_id`        — Req 9.6
 *   - `missing_redirect_uri`     — Req 9.5
 *   - `invalid_query`            — reserved for future structural failures
 *                                  (e.g. unparseable URL) surfaced by callers
 *   - `legacy_route`             — Req 10.5, bookmark to `/consent`,
 *                                  `/session-confirm`, or `/tenant-selection`
 *   - `prompt_none_with_ui_view` — Req 2.6, `prompt=none` forbids UI
 *   - `unknown_view`             — Req 13.4, unrecognised `view` value
 */
export type OAuthParseError =
    | 'missing_client_id'
    | 'missing_redirect_uri'
    | 'invalid_query'
    | 'legacy_route'
    | 'prompt_none_with_ui_view'
    | 'unknown_view';

/**
 * Result of parsing the `/authorize?...` URL.
 *
 * When `error` is set, `params`, `csrfToken`, and `view` may still be
 * populated with whatever could be extracted — callers typically ignore them
 * and render the error view — except for `missing_client_id`,
 * `missing_redirect_uri`, and `legacy_route` where `params` is `null`
 * because `OAuthParameters` cannot be meaningfully constructed without the
 * two required keys.
 */
export interface ParseOAuthParametersResult {
    params: OAuthParameters | null;
    csrfToken: string | null;
    view: string | null;
    error?: OAuthParseError;
}

/**
 * Parse OAuth parameters, `view`, and `csrf_token` from the URL query string.
 *
 * Exactly the keys declared on `OAuthParameters` are copied across.
 * One-shot flags (`session_confirmed`, `from_logout`, `consent_denied`) and
 * any other non-OAuth query keys are ignored so they can never make it into
 * `Component_State` (Property 8, Req 7.9).
 *
 * Validation order:
 *   1. `error=legacy_route` short-circuits to `{ error: 'legacy_route' }` so
 *      bookmarks to the removed `/consent` / `/session-confirm` /
 *      `/tenant-selection` routes render the legacy-route message even if
 *      they carry no OAuth params (Req 10.5).
 *   2. Missing `client_id`  → `missing_client_id` (Req 9.6).
 *   3. Missing `redirect_uri` → `missing_redirect_uri` (Req 9.5).
 *   4. `view` present but not in `VALID_VIEWS` → `unknown_view` (Req 13.4).
 *   5. `view` present and `prompt=none` → `prompt_none_with_ui_view`
 *      (Req 2.6).
 *   6. `view` absent → default to `'login'` (Req 1.7).
 */
export function parseOAuthParametersFromUrl(queryMap: ParamMap): ParseOAuthParametersResult {
    // (1) Legacy-route bookmark — redirected here from the deprecated routes
    // by `app-routing.module.ts`. Nothing useful to parse; render the
    // "page no longer exists" error (Req 10.5).
    if (queryMap.get('error') === 'legacy_route') {
        return { params: null, csrfToken: null, view: null, error: 'legacy_route' };
    }

    // (2) & (3) Required OAuth parameters. Without these we cannot build an
    // `OAuthParameters` object, so `params` stays `null` and the caller
    // renders the terminal "invalid authorization request" view.
    const clientId = queryMap.get('client_id');
    if (!clientId) {
        return { params: null, csrfToken: null, view: null, error: 'missing_client_id' };
    }

    const redirectUri = queryMap.get('redirect_uri');
    if (!redirectUri) {
        return { params: null, csrfToken: null, view: null, error: 'missing_redirect_uri' };
    }

    // Build the parameter object now — the remaining checks are about how we
    // render, not whether the params themselves are sound. `params` is handed
    // back even in error cases 4 and 5 so the caller has the option of a
    // "Start Over" redirect back to `GET /api/oauth/authorize`.
    const params: OAuthParameters = {
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: queryMap.get('response_type') ?? '',
    };

    // Copy all remaining optional keys only if they are actually present.
    // `session_confirmed` and `from_logout` are NOT in `OAUTH_PARAMETER_KEYS`,
    // so they are never copied (Property 8, Req 7.9).
    for (const key of OAUTH_PARAMETER_KEYS) {
        if (key === 'client_id' || key === 'redirect_uri' || key === 'response_type') {
            continue;
        }
        const value = queryMap.get(key);
        if (value !== null && value !== undefined) {
            params[key] = value;
        }
    }

    const csrfToken = queryMap.get('csrf_token');
    const rawView = queryMap.get('view');

    // (4) `view` given but not one we know how to render.
    if (rawView !== null && rawView !== '' && !VALID_VIEWS.includes(rawView)) {
        return {
            params,
            csrfToken,
            view: rawView,
            error: 'unknown_view',
        };
    }

    // (5) `prompt=none` semantically forbids UI per OIDC Core §3.1.2.1, so
    // combining it with any UI `view` is an inconsistent request.
    if (rawView !== null && rawView !== '' && params.prompt === 'none') {
        return {
            params,
            csrfToken,
            view: rawView,
            error: 'prompt_none_with_ui_view',
        };
    }

    // (6) Default view when the backend did not specify one but the required
    // params are present (Req 1.7).
    const view = rawView && rawView !== '' ? rawView : 'login';

    return { params, csrfToken, view };
}

/**
 * Serialise an `OAuthParameters` object into a `URLSearchParams` for use on
 * the outbound redirect URL to `GET /api/oauth/authorize`.
 *
 * Only defined keys are written, and they are written in the stable order
 * declared by `OAUTH_PARAMETER_KEYS`. This gives `AuthorizeRedirectBuilder`
 * a deterministic query string regardless of the order the keys were assigned
 * at parse time — making test assertions straightforward and satisfying
 * Property 1 (parameter immutability: same input → same serialised output).
 *
 * `session_confirmed` and `from_logout` are deliberately not included:
 * `AuthorizeRedirectBuilder` appends them after calling this function, and
 * then only on the single redirect that legitimately carries them
 * (Property 8, Req 7.8).
 */
export function serializeOAuthParameters(params: OAuthParameters): URLSearchParams {
    const qs = new URLSearchParams();
    for (const key of OAUTH_PARAMETER_KEYS) {
        const value = params[key];
        if (value !== undefined && value !== null && value !== '') {
            qs.set(key, value);
        }
    }
    return qs;
}
