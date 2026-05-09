import {Component, OnInit} from '@angular/core';
import {ActivatedRoute, Router} from '@angular/router';
import {MessageService} from 'primeng/api';
import {AuthService} from '../_services/auth.service';
import {SessionService} from '../_services/session.service';
import {StateService} from '../_services/state.service';
import {NonceService} from '../_services/nonce.service';
import {PKCEService} from '../_services/pkce.service';

const RETURN_PATH_KEY = 'oauth-return-path';
const CLIENT_ID_KEY = 'oauth-client-id';

/**
 * Handles the OAuth 2.0 authorization code redirect.
 *
 * Compliance notes:
 *  - RFC 6749 §4.1.2: accepts `code` on success or `error`/`error_description` on failure.
 *  - RFC 6749 §10.12 + RFC 9700 §4.7: validates `state` against the value stored in
 *    sessionStorage before doing anything with the code.
 *  - RFC 7636 §4.5: exchanges the code using the stored PKCE code_verifier.
 *  - OIDC Core 1.0 §3.1.2.1 / §15.5.2: validates the `nonce` claim in the ID token
 *    against the stored nonce (handled inside AuthService + NonceService flow).
 *  - RFC 9700 §6.3: scrubs the code/state from the URL via history.replaceState once
 *    the exchange succeeds so the single-use code cannot leak through history/Referer.
 */
@Component({
    selector: 'app-oauth-callback',
    template: `
        <app-open-navbar></app-open-navbar>
        <app-centered-card imageUrl="/assets/logo.svg">
            <div *ngIf="loading" class="align-middle text-center" style="padding-top:25%">
                <div class="spinner-border m-5" role="status">
                    <span class="visually-hidden">Signing you in…</span>
                </div>
                <div class="mt-2">Signing you in…</div>
            </div>

            <div *ngIf="!loading && error" class="alert alert-danger mt-3" role="alert">
                <strong>Sign-in failed.</strong>
                <div class="mt-2 small">{{ error }}</div>
                <div class="mt-3">
                    <a class="btn btn-outline-primary btn-sm" routerLink="/login">Back to login</a>
                </div>
            </div>
        </app-centered-card>
    `,
    styles: [`
        .card {
            max-width: 420px;
            margin: 60px auto 0;
        }
    `],
})
export class OAuthCallbackComponent implements OnInit {
    loading = true;
    error = '';

    constructor(
        private route: ActivatedRoute,
        private router: Router,
        private authService: AuthService,
        private sessionService: SessionService,
        private stateService: StateService,
        private nonceService: NonceService,
        private pkceService: PKCEService,
        private messageService: MessageService,
    ) {
    }

    async ngOnInit(): Promise<void> {
        const params = this.route.snapshot.queryParamMap;

        // 1. Authorization server returned an error per RFC 6749 §4.1.2.1 — surface it, do not exchange.
        const serverError = params.get('error');
        if (serverError) {
            const description = params.get('error_description') || '';
            this.fail(`Authorization failed (${serverError})${description ? `: ${description}` : ''}`);
            return;
        }

        const code = params.get('code');
        const returnedState = params.get('state');
        if (!code) {
            this.fail('Missing authorization code in callback URL.');
            return;
        }

        // 2. CSRF check per RFC 6749 §10.12 / RFC 9700 §4.7.
        // StateService.validate clears the stored value on success and retains it on mismatch.
        if (!this.stateService.validate(returnedState || undefined)) {
            this.fail('Invalid or missing state parameter. This may indicate a CSRF attempt.');
            return;
        }

        const clientId = window.sessionStorage.getItem(CLIENT_ID_KEY);
        if (!clientId) {
            this.fail('Missing client context. Please start the sign-in flow again.');
            return;
        }

        try {
            const verifier = this.sessionService.getCodeVerifier();
            const redirectUri = window.location.origin + '/oauth/callback';
            const data = await this.authService.fetchAccessToken(code, verifier, clientId, redirectUri);

            // 3. Nonce validation per OIDC Core §15.5.2 — only if one was sent.
            const storedNonce = this.nonceService.retrieve();
            if (storedNonce) {
                if (!data.id_token) {
                    this.fail('Authentication failed: missing ID token.');
                    return;
                }
                const decodedIdToken = this.sessionService.decodeIdToken(data.id_token);
                if (!decodedIdToken?.nonce || !this.nonceService.validate(decodedIdToken.nonce)) {
                    this.fail('Authentication failed: nonce mismatch.');
                    return;
                }
            }

            // 4. Persist tokens and hydrate session profile/permissions.
            this.sessionService.saveToken(data.access_token);
            if (data.refresh_token) {
                this.sessionService.saveRefreshToken(data.refresh_token);
            }
            if (data.id_token) {
                this.sessionService.saveIdToken(data.id_token);
            }
            const [rules, profile] = await Promise.all([
                this.authService.fetchPermissions(),
                this.authService.fetchMyProfile(),
            ]);
            this.sessionService.saveUserProfile({
                email: profile.email,
                name: profile.name,
                id: profile.id,
            });
            this.sessionService.savePermissions(rules);

            // 5. Clean up one-shot OAuth state (PKCE verifier is tied to this exchange).
            this.pkceService.clearCodeVerifier();
            const returnPath = window.sessionStorage.getItem(RETURN_PATH_KEY) || '/home';
            window.sessionStorage.removeItem(RETURN_PATH_KEY);
            window.sessionStorage.removeItem(CLIENT_ID_KEY);

            // 6. Scrub code/state from URL (RFC 9700 §6.3) before navigating.
            try {
                window.history.replaceState({}, document.title, '/oauth/callback');
            } catch {
                // best-effort; navigation below will still replace the URL
            }

            await this.router.navigateByUrl(returnPath, {replaceUrl: true});
        } catch (e: any) {
            console.error('OAuth callback exchange failed', e);
            this.sessionService.clearSession();
            this.fail('Failed to complete sign-in. Please try again.');
        }
    }

    private fail(message: string): void {
        this.error = message;
        this.loading = false;
        // Clear partial OAuth state so the next attempt starts fresh.
        this.stateService.clear();
        this.nonceService.clear();
        this.pkceService.clearCodeVerifier();
        window.sessionStorage.removeItem(RETURN_PATH_KEY);
        window.sessionStorage.removeItem(CLIENT_ID_KEY);
        this.messageService.add({
            severity: 'error',
            summary: 'Sign-in failed',
            detail: message,
            life: 6000,
        });
    }
}
