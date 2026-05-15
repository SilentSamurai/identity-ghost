/**
 * Builds redirect URLs back to `GET /api/oauth/authorize` from an
 * in-memory `OAuthParameters` object.
 *
 * This is the single place in the UI that produces a URL for the backend
 * authorization endpoint. Centralising it here is what makes Property 1
 * ("OAuth parameter immutability") and Property 8 ("one-shot flags
 * isolation") structurally enforceable: `session_confirmed` and
 * `from_logout` are never members of `OAuthParameters` and never stored in
 * `Component_State`, so they can only enter a URL through this builder's
 * `extras` argument, on a single redirect, at the moment it is needed.
 *
 * Design references: `design.md` → "AuthorizeRedirectBuilder" and
 * `requirements.md` Requirements 4.3, 4.4, 5.15, 7.8, 9.2, 9.3. Related
 * correctness properties: P7 (no OAuth params on non-backend redirects — the
 * complement of this builder's output) and P8 (one-shot flags isolation).
 */

import { Injectable } from '@angular/core';

import { serializeOAuthParameters } from './oauth-params.util';
import { OAuthParameters } from './authorize.types';

/**
 * Extras accepted by `toAuthorizeEndpoint`.
 *
 * The extras are modelled as a discriminated union so that, at the type
 * level, a caller cannot legally pass both `session_confirmed` and
 * `from_logout` at once. This is the structural half of the "at most one
 * flag per call" rule. The runtime half (a defensive throw) lives in
 * `toAuthorizeEndpoint` itself and protects against callers that reach the
 * builder through `any` / JS interop.
 *
 * Both flags are typed as the literal `true` because the redirect URL uses
 * only their presence — `false` would never legitimately be set. Omitting
 * the property altogether is the way to say "do not include this flag".
 */
export type AuthorizeRedirectExtras =
    | { session_confirmed: true; from_logout?: never; consent_denied?: never }
    | { session_confirmed?: never; from_logout: true; consent_denied?: never }
    | { session_confirmed?: never; from_logout?: never; consent_denied: true };

/**
 * Single place that constructs the URL for a redirect back to
 * `GET /api/oauth/authorize`. Every UI code path that wants to hand control
 * back to the backend — after login, after consent, after session-confirm
 * continue, after logout, from the "Start Over" error recovery — funnels
 * through `toAuthorizeEndpoint`.
 */
@Injectable({ providedIn: 'root' })
export class AuthorizeRedirectBuilder {
    /**
     * Build the redirect URL `/api/oauth/authorize?...`.
     *
     * `params` is serialised by `serializeOAuthParameters`, which writes
     * only defined OAuth keys in a stable order (Property 1). The resulting
     * query string is identical across repeated calls with the same input
     * — a property the Cypress tests rely on for byte-exact assertions.
     *
     * `extras` is the ONLY path by which `session_confirmed=true`,
     * `from_logout=true`, or `consent_denied=true` can end up on a redirect URL:
     *   - `session_confirmed` is set by the session-confirm "Continue"
     *     handler (Req 7.8).
     *   - `from_logout` is set by the session-confirm "Log out" handler
     *     immediately after a successful `POST /api/oauth/logout`
     *     (Req 7.5).
     *   - `consent_denied` is set by the consent "Deny" handler so the
     *     backend can redirect with `error=access_denied` (Req 4.4, 6.5).
     * None of these flags are ever read from `Component_State`, the URL, or
     * any other source (P8, Req 7.7, 7.9).
     *
     * Passing more than one flag is a programmer error. TypeScript already
     * forbids it via `AuthorizeRedirectExtras`, and at runtime we
     * additionally throw to catch callers reaching the builder through
     * untyped code.
     */
    toAuthorizeEndpoint(params: OAuthParameters, extras?: AuthorizeRedirectExtras): string {
        const wantsSessionConfirmed = extras?.session_confirmed === true;
        const wantsFromLogout = extras?.from_logout === true;
        const wantsConsentDenied = extras?.consent_denied === true;

        // Runtime guard for callers that bypass the structural type — the
        // three flags mark mutually exclusive "reason I'm bouncing through
        // /authorize right now" signals, so setting more than one would
        // have no coherent meaning for the backend to consume.
        if (
            (wantsSessionConfirmed && wantsFromLogout) ||
            (wantsSessionConfirmed && wantsConsentDenied) ||
            (wantsFromLogout && wantsConsentDenied)
        ) {
            throw new Error(
                'AuthorizeRedirectBuilder: only one of `session_confirmed`, `from_logout`, ' +
                    'or `consent_denied` may be set per redirect.',
            );
        }

        const qs = serializeOAuthParameters(params);

        if (wantsSessionConfirmed) {
            qs.set('session_confirmed', 'true');
        }
        if (wantsFromLogout) {
            qs.set('from_logout', 'true');
        }
        if (wantsConsentDenied) {
            qs.set('consent_denied', 'true');
        }

        return '/api/oauth/authorize?' + qs.toString();
    }
}
