import {Component, OnInit} from '@angular/core';
import {ActivatedRoute} from '@angular/router';
import {FormBuilder, FormGroup, Validators} from '@angular/forms';
import {MessageService} from 'primeng/api';
import {NonceService} from '../_services/nonce.service';
import {StateService} from '../_services/state.service';
import {PKCEService} from '../_services/pkce.service';

const RETURN_PATH_KEY = 'oauth-return-path';
const CLIENT_ID_KEY = 'oauth-client-id';

/**
 * Sign-in bootstrap page.
 *
 * This page is a thin OAuth 2.0 client bootstrapper — it does NOT collect
 * credentials. Its job is:
 *   1. Obtain a `client_id` (from ?client_id= or via a single-field form).
 *   2. Generate OAuth state + OIDC nonce + PKCE (S256) code_verifier/challenge.
 *   3. Persist them in sessionStorage so /oauth/callback can validate.
 *   4. Full-page-navigate to /api/oauth/authorize.
 *
 * Credential entry is handled by the authorization server's credential page
 * (AuthorizeLoginComponent at /authorize), which this server 302s to when no
 * session cookie is present. That keeps this codebase with a single credential
 * UI and matches the RFC 6749 model where interactive authentication is an
 * implementation detail inside the authorization endpoint.
 *
 * Compliance references:
 *   - RFC 6749 §4.1          Authorization Code
 *   - RFC 6749 §10.12 / RFC 9700 §4.7  state CSRF protection
 *   - RFC 7636               PKCE S256
 *   - OIDC Core §3.1.2.1     nonce
 *   - RFC 9700 §2.1.1        browser-based public clients
 */
@Component({
    selector: 'app-login',
    template: `
        <app-open-navbar></app-open-navbar>
        <app-centered-card
            [title]="client_id"
            imageUrl="/assets/logo.svg"
        >
            <div *ngIf="loading" class="align-middle text-center" style="padding-top:25%">
                <div class="spinner-border m-5" role="status">
                    <span class="visually-hidden">Redirecting…</span>
                </div>
                <div class="mt-2">Redirecting to sign in…</div>
            </div>

            <form
                (ngSubmit)="loginForm.valid && onContinue()"
                *ngIf="!loading"
                [formGroup]="loginForm"
                class="mt-3"
                novalidate
            >
                <div class="form-group">
                    <label for="client_id">Client Id</label>
                    <input
                        class="form-control"
                        formControlName="client_id"
                        id="client_id"
                        placeholder="Enter Client ID"
                        type="text"
                    />
                </div>
                <div
                    *ngIf="loginForm.get('client_id')?.invalid && (loginForm.get('client_id')?.touched || loginForm.get('client_id')?.dirty)"
                    class="alert alert-danger mt-2"
                    role="alert">
                    Client Id is required.
                </div>

                <div class="form-group d-grid gap-2 py-3">
                    <button
                        [disabled]="loginForm.get('client_id')?.invalid"
                        class="btn btn-primary btn-block btn-lg"
                        id="continue-btn"
                        type="submit"
                    >
                        Continue
                    </button>
                </div>
            </form>

            <div *ngIf="!loading" class="d-flex justify-content-between">
                <a class="mt-1" routerLink="/forgot-password">
                    Forgot Password
                </a>

                <a class="mt-1" [routerLink]="['/signup']"
                   [queryParams]="{ client_id: (client_id || loginForm.get('client_id')?.value) }"
                   [queryParamsHandling]="'merge'">
                    Sign Up
                </a>
            </div>
        </app-centered-card>
    `,
    styles: [`
        label {
            display: block;
            margin-top: 10px;
        }

        .card-container.card {
            max-width: 400px !important;
            padding: 40px 40px;
        }

        .card {
            background-color: var(--bs-card-bg, #f7f7f7);
            padding: 20px 25px 30px;
            margin: 0 auto 25px;
            margin-top: 50px;
            border-radius: 2px;
            box-shadow: 0px 2px 2px rgba(0, 0, 0, 0.3);
            transition: background-color 0.3s ease, box-shadow 0.3s ease;
        }

        [data-bs-theme="dark"] .card {
            background-color: var(--bs-dark, #212529);
            border-color: var(--bs-border-color, #495057);
            box-shadow: 0px 2px 2px rgba(0, 0, 0, 0.5);
        }

        [data-bs-theme="dark"] .form-control {
            background-color: var(--bs-dark, #212529);
            border-color: var(--bs-border-color, #495057);
            color: var(--bs-body-color, #f8f9fa);
        }

        [data-bs-theme="dark"] .form-control:focus {
            background-color: var(--bs-dark, #212529);
            border-color: var(--bs-primary, #0d6efd);
            color: var(--bs-body-color, #f8f9fa);
            box-shadow: 0 0 0 0.25rem rgba(13, 110, 253, 0.25);
        }

        [data-bs-theme="dark"] label {
            color: var(--bs-body-color, #f8f9fa);
        }

        [data-bs-theme="dark"] .alert-danger {
            background-color: var(--bs-danger-bg-subtle, rgba(220, 53, 69, 0.15));
            border-color: var(--bs-danger-border-subtle, rgba(220, 53, 69, 0.3));
            color: var(--bs-danger-text-emphasis, #ea868f);
        }

        [data-bs-theme="dark"] a {
            color: var(--bs-link-color, #0d6efd);
        }

        [data-bs-theme="dark"] a:hover {
            color: var(--bs-link-hover-color, #0a58ca);
            text-decoration: underline;
        }

        [data-bs-theme="dark"] .btn-primary {
            background-color: var(--bs-primary, #0d6efd);
            border-color: var(--bs-primary, #0d6efd);
        }

        [data-bs-theme="dark"] .btn-primary:hover {
            background-color: var(--bs-primary-dark, #0b5ed7);
            border-color: var(--bs-primary-dark, #0b5ed7);
        }

        [data-bs-theme="dark"] .btn-primary:focus {
            box-shadow: 0 0 0 0.25rem rgba(13, 110, 253, 0.25);
        }
    `],
})
export class LoginComponent implements OnInit {
    loginForm: FormGroup;
    loading = true;
    client_id: string = '';

    private readonly CODE_CHALLENGE_METHOD = 'S256';

    constructor(
        private route: ActivatedRoute,
        private fb: FormBuilder,
        private messageService: MessageService,
        private nonceService: NonceService,
        private stateService: StateService,
        private pkceService: PKCEService,
    ) {
        this.loginForm = this.fb.group({
            client_id: ['', Validators.required],
        });
    }

    async ngOnInit(): Promise<void> {
        const params = this.route.snapshot.queryParamMap;

        // Post-verification banners
        if (params.has('verified')) {
            const verified = params.get('verified') === 'true';
            this.messageService.add(verified
                ? {
                    severity: 'success',
                    summary: 'Email Verified',
                    detail: 'Your email has been verified successfully. You can now login.',
                }
                : {
                    severity: 'error',
                    summary: 'Verification Failed',
                    detail: 'Email verification failed. Please try again or contact support.',
                });
        }

        // Preserve any OAuth error bounced back from a previous /oauth/callback attempt
        // (e.g. state_required) so the user sees why they ended up here again.
        const oauthError = params.get('error');
        if (oauthError && !params.has('verified')) {
            const description = params.get('error_description') || '';
            this.messageService.add({
                severity: 'warn',
                summary: 'Sign-in interrupted',
                detail: `${oauthError}${description ? ': ' + description : ''}`,
                life: 6000,
            });
        }

        // Carry the originally requested path through the OAuth round trip.
        const redirectUri = params.get('redirect_uri');
        if (redirectUri) {
            window.sessionStorage.setItem(RETURN_PATH_KEY, redirectUri);
        }

        const clientId = params.get('client_id') || '';
        if (clientId) {
            // We already have a client_id → skip the form entirely and go straight
            // to the authorization endpoint.
            await this.startAuthorize(clientId);
            return;
        }

        // No client_id yet — render the single-field form so the user can supply one.
        this.loading = false;
    }

    async onContinue(): Promise<void> {
        const clientId = (this.loginForm.get('client_id')?.value || '').trim();
        if (!clientId) {
            this.loginForm.get('client_id')?.markAsTouched();
            return;
        }
        this.client_id = clientId;
        this.loading = true;
        await this.startAuthorize(clientId);
    }

    /**
     * Generate one-shot OAuth/OIDC parameters and navigate to /api/oauth/authorize.
     * All per-request secrets are stored in sessionStorage (tab-scoped) so that
     * /oauth/callback can validate state/nonce and complete the PKCE exchange.
     */
    private async startAuthorize(clientId: string): Promise<void> {
        try {
            // Fresh PKCE verifier for this flow (prevents verifier reuse across attempts).
            this.pkceService.clearCodeVerifier();
            const codeVerifier = this.pkceService.getCodeVerifier();
            const codeChallenge = await this.pkceService.getCodeChallenge(this.CODE_CHALLENGE_METHOD);
            void codeVerifier; // persisted inside PKCEService

            const state = this.stateService.generate();
            this.stateService.store(state);

            const nonce = this.nonceService.generate();
            this.nonceService.store(nonce);

            window.sessionStorage.setItem(CLIENT_ID_KEY, clientId);
            if (!window.sessionStorage.getItem(RETURN_PATH_KEY)) {
                window.sessionStorage.setItem(RETURN_PATH_KEY, '/home');
            }

            const authorizeParams = new URLSearchParams();
            authorizeParams.set('client_id', clientId);
            authorizeParams.set('response_type', 'code');
            authorizeParams.set('redirect_uri', window.location.origin + '/oauth/callback');
            authorizeParams.set('scope', 'openid profile email');
            authorizeParams.set('state', state);
            authorizeParams.set('nonce', nonce);
            authorizeParams.set('code_challenge', codeChallenge);
            authorizeParams.set('code_challenge_method', this.CODE_CHALLENGE_METHOD);

            // Full-page navigation — the server will either 302 back to /oauth/callback
            // (if a valid sid cookie already exists) or 302 to /authorize for credential entry.
            window.location.href = `/api/oauth/authorize?${authorizeParams.toString()}`;
        } catch (e: any) {
            console.error('Failed to start OAuth flow', e);
            this.messageService.add({
                severity: 'error',
                summary: 'Sign-in error',
                detail: 'Could not start the sign-in flow. Please try again.',
                life: 5000,
            });
            this.loading = false;
        }
    }
}
