import {Component, OnInit} from '@angular/core';
import {ActivatedRoute, Router} from '@angular/router';
import {AuthService} from '../_services/auth.service';

@Component({
    selector: 'session-confirm',
    template: `
        <app-open-navbar></app-open-navbar>
        <app-centered-card
            imageUrl="/assets/logo.svg"
        >
            <div *ngIf="loading" class="align-middle text-center" style="padding-top:25%">
                <div class="spinner-border m-5" role="status">
                    <span class="visually-hidden">Loading...</span>
                </div>
            </div>

            <div *ngIf="!loading">
                <div class="text-center">
                    Logged in as
                </div>

                <div class="text-center py-2">
                    <b>{{ username }}</b>
                </div>

                <div class="form-group d-grid gap-2 py-3">
                    <button (click)="onContinue()" class="btn btn-primary btn-block btn-lg">
                        Continue
                    </button>
                </div>

                <hr>

                <div class="form-group d-grid gap-2">
                    <button (click)="onLogout()" class="btn btn-danger btn-block btn-lg">
                        Logout
                    </button>
                </div>
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

        [data-bs-theme="dark"] .btn-primary {
            background-color: var(--bs-primary, #0d6efd);
            border-color: var(--bs-primary, #0d6efd);
        }
    `],
})
export class SessionConfirmationComponent implements OnInit {
    loading = true;
    username = '';

    // OAuth params parsed from query string
    private clientId = '';
    private redirectUri = '';
    private state = '';
    private scope = '';
    private responseType = '';
    private codeChallenge = '';
    private codeChallengeMethod = '';
    private nonce = '';
    private resource = '';

    constructor(
        private router: Router,
        private route: ActivatedRoute,
        private authService: AuthService,
    ) {
    }

    async ngOnInit(): Promise<void> {
        const params = this.route.snapshot.queryParamMap;

        // Parse all OAuth params from query string
        this.clientId = params.get('client_id') || '';
        this.redirectUri = params.get('redirect_uri') || '';
        this.state = params.get('state') || '';
        this.scope = params.get('scope') || '';
        this.responseType = params.get('response_type') || 'code';
        this.codeChallenge = params.get('code_challenge') || '';
        this.codeChallengeMethod = params.get('code_challenge_method') || '';
        this.nonce = params.get('nonce') || '';
        this.resource = params.get('resource') || '';

        // Fetch user email from session-info endpoint (cookie-authenticated)
        // PII never comes from query params
        try {
            const info = await this.authService.getSessionInfo();
            this.username = info.email;
        } catch (e) {
            console.error('Failed to fetch session info:', e);
            // Session is invalid — navigate back to authorize
            this.navigateToAuthorize();
            return;
        }

        this.loading = false;
    }

    onContinue(): void {
        // Navigate to authorize with all OAuth params + session_confirmed=true
        // The authorize endpoint will issue a fresh code and redirect to the client
        const authorizeParams = this.buildAuthorizeParams();
        authorizeParams.set('session_confirmed', 'true');
        window.location.href = `/api/oauth/authorize?${authorizeParams.toString()}`;
    }

    async onLogout(): Promise<void> {
        try {
            await this.authService.sessionLogout();
        } catch (e) {
            console.error('Logout error (continuing anyway):', e);
        }

        // Navigate to authorize with from_logout=true — server will redirect to login form
        const authorizeParams = this.buildAuthorizeParams();
        authorizeParams.set('from_logout', 'true');
        window.location.href = `/api/oauth/authorize?${authorizeParams.toString()}`;
    }

    private buildAuthorizeParams(): URLSearchParams {
        const params = new URLSearchParams();
        if (this.clientId) params.set('client_id', this.clientId);
        if (this.redirectUri) params.set('redirect_uri', this.redirectUri);
        params.set('response_type', this.responseType || 'code');
        if (this.scope) params.set('scope', this.scope);
        if (this.state) params.set('state', this.state);
        if (this.codeChallenge) {
            params.set('code_challenge', this.codeChallenge);
            params.set('code_challenge_method', this.codeChallengeMethod || 'plain');
        }
        if (this.nonce) params.set('nonce', this.nonce);
        if (this.resource) params.set('resource', this.resource);
        return params;
    }

    private navigateToAuthorize(): void {
        const authorizeParams = this.buildAuthorizeParams();
        window.location.href = `/api/oauth/authorize?${authorizeParams.toString()}`;
    }
}
