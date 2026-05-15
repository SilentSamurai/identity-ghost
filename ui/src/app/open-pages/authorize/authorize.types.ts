/**
 * Type definitions for the Unified OAuth Authorization UI.
 *
 * These types are the single source of truth for:
 *   - The OAuth parameters the component parses from the URL and preserves in
 *     `Component_State` for the lifetime of the flow (see Property 1:
 *     "OAuth parameter immutability").
 *   - The closed set of render states the component can be in (see Property 4:
 *     "View state closure").
 *   - The DTOs exchanged with `/api/oauth/login`, `/api/oauth/consent`, and
 *     related backend endpoints.
 *
 * This file intentionally has no Angular imports: it is consumed by the
 * component, its sub-views, pure utility functions, and the API wrapper.
 */

/**
 * OAuth parameters captured from the `/authorize?...` URL on component init.
 *
 * The fields mirror exactly the subset of RFC 6749 / OIDC parameters the
 * backend forwards onto `/authorize` UI redirects. They are parsed once from
 * the URL and stored as `Readonly<OAuthParameters>` in the component — see
 * Requirements 9.1, 9.4 and Property 1.
 *
 * Notable exclusions (enforced at the type level to support Property 8):
 *   - `session_confirmed` and `from_logout` are one-shot flags built only by
 *     `AuthorizeRedirectBuilder` at the moment a redirect URL is emitted. They
 *     MUST NOT be stored in `Component_State` nor in this interface.
 *   - `view` and `csrf_token` are UI-routing / CSRF signals, not OAuth
 *     parameters; they live in separate fields of the component state.
 *
 * `max_age` is kept as a string here because the backend coerces it; the UI
 * never interprets it numerically.
 */
export interface OAuthParameters {
    client_id: string;
    redirect_uri: string;
    response_type: string;
    scope?: string;
    state?: string;
    code_challenge?: string;
    code_challenge_method?: string;
    nonce?: string;
    resource?: string;
    prompt?: string;
    max_age?: string;
    id_token_hint?: string;
    subscriber_tenant_hint?: string;
}

/**
 * The closed set of render states for `UnifiedAuthorizeComponent`.
 *
 * At any moment exactly one of these values is active, and the template
 * renders exactly one view branch matching it (Property 4, Requirement 13.4).
 *
 *   - `loading`          — transient state during parse / session-info fetch
 *   - `login`            — email + password entry (backend chose view=login)
 *   - `consent`          — scope approval (backend chose view=consent)
 *   - `session-confirm`  — re-authentication / continue / logout prompt
 *   - `tenant-selection` — internal state reached only after a login response
 *                          with `requires_tenant_selection: true`; never
 *                          requested by the backend via the `view` param
 *   - `error`            — terminal, user must "Start Over" or restart flow
 */
export type ViewKind =
    | 'loading'
    | 'login'
    | 'consent'
    | 'session-confirm'
    | 'tenant-selection'
    | 'error';

/**
 * A subscriber tenant returned by `/api/oauth/login` when the caller is
 * ambiguous about which tenant they want to sign into for the target client.
 *
 * Shape matches the backend `TenantInfo` interface defined in
 * `srv/src/auth/tenant-ambiguity.service.ts`.
 */
export interface TenantInfo {
    id: string;
    name: string;
    domain: string;
}

/**
 * Request body for `POST /api/oauth/login`.
 *
 * `csrf_token` is required by the backend (see task 4.1); the UI carries it
 * verbatim from the `csrf_token` query param parsed during `ngOnInit`
 * (Property 6: "CSRF token fidelity").
 */
export interface LoginBody {
    email: string;
    password: string;
    client_id: string;
    csrf_token: string;
    subscriber_tenant_hint?: string;
}

/**
 * Response body for `POST /api/oauth/login`.
 *
 * - `{ success: true }` — the `sid` cookie has been set; the caller should
 *   redirect back to `GET /api/oauth/authorize` to let the backend choose the
 *   next view.
 * - `{ requires_tenant_selection: true, tenants }` — the user is a member of
 *   multiple subscriber tenants for this client; no session has been created
 *   yet. The caller must render the tenant-selection view and re-POST with
 *   `subscriber_tenant_hint` set (reusing the same `csrf_token`).
 */
export type LoginResponse =
    | { success: true }
    | { requires_tenant_selection: true; tenants: TenantInfo[] };

/**
 * Request body for `POST /api/oauth/consent`.
 *
 * `decision` is either `'grant'` (user approved) or `'deny'` (user rejected).
 * The backend is the single source of truth for the follow-up redirect —
 * the UI simply POSTs the decision and then bounces through
 * `GET /api/oauth/authorize`.
 */
export interface ConsentBody {
    decision: 'grant' | 'deny';
    client_id: string;
    scope: string;
    csrf_token: string;
}
