import {Component, OnInit} from '@angular/core';
import {Router} from '@angular/router';
import {AuthService, TenantInfo} from '../_services/auth.service';
import {MessageService} from 'primeng/api';

interface OAuthParams {
    redirectUri: string;
    state: string;
    scope: string;
    responseType: string;
    codeChallenge: string;
    codeChallengeMethod: string;
    nonce: string;
    resource: string;
}

interface LoginParams {
    email: string;
    password: string;
    client_id: string;
}

@Component({
    selector: 'app-tenant-selection',
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

            <div *ngIf="!loading && error" class="alert alert-danger mt-3" role="alert">
                {{ error }}
            </div>

            <div *ngIf="!loading && !error">
                <div class="card-header">
                    <h4 class="mb-0">Select Tenant</h4>
                </div>
                <div class="card-body">
                    <p class="text-muted mb-4">
                        You have access to this application through multiple tenants. Please select which tenant
                        you want to use:
                    </p>
                    <div class="list-group">
                        <button *ngFor="let tenant of tenants"
                                (click)="selectTenant(tenant)"
                                [disabled]="selecting"
                                class="list-group-item list-group-item-action">
                            <div class="d-flex justify-content-between align-items-center">
                                <div>
                                    <h5 class="mb-1">{{ tenant.name }}</h5>
                                    <small class="text-muted">{{ tenant.domain }}</small>
                                </div>
                                <i class="fa fa-chevron-right"></i>
                            </div>
                        </button>
                    </div>
                </div>
            </div>
        </app-centered-card>
    `,
    styles: [`
        .list-group-item {
            cursor: pointer;
            transition: all 0.2s;
        }

        .list-group-item:hover {
            background-color: #f8f9fa;
        }

        .list-group-item:disabled {
            cursor: not-allowed;
            opacity: 0.6;
        }

        [data-bs-theme="dark"] .list-group-item {
            background-color: var(--bs-dark, #212529);
            border-color: var(--bs-border-color, #495057);
            color: var(--bs-body-color, #f8f9fa);
        }

        [data-bs-theme="dark"] .list-group-item:hover:not(:disabled) {
            background-color: var(--bs-gray-800, #343a40);
        }

        [data-bs-theme="dark"] .text-muted {
            color: var(--bs-secondary-text-emphasis, #adb5bd) !important;
        }
    `]
})
export class TenantSelectionComponent implements OnInit {
    tenants: TenantInfo[] = [];
    loading = true;
    selecting = false;
    error = '';

    private loginParams: LoginParams | null = null;
    private oauthParams: OAuthParams | null = null;

    constructor(
        private router: Router,
        private authService: AuthService,
        private messageService: MessageService
    ) {
    }

    ngOnInit() {
        const state = history.state;
        if (state?.loginParams && state?.tenants && state?.oauthParams) {
            this.loginParams = state.loginParams;
            this.tenants = state.tenants;
            this.oauthParams = state.oauthParams;
            this.loading = false;
        } else {
            // No state — redirect back to login
            this.error = 'Session expired. Please try again.';
            this.loading = false;
            setTimeout(() => {
                this.router.navigate(['/login']);
            }, 2000);
        }
    }

    async selectTenant(tenant: TenantInfo) {
        if (!this.loginParams || !this.oauthParams) {
            this.error = 'Session expired. Please try again.';
            return;
        }

        this.selecting = true;

        try {
            // Re-call /login with the selected tenant hint
            const response = await this.authService.login(
                this.loginParams.email,
                this.loginParams.password,
                this.loginParams.client_id,
                tenant.domain,
            );

            if ('success' in response && response.success) {
                // Session created — redirect to authorize with hint
                const params = new URLSearchParams();
                params.set('client_id', this.loginParams.client_id);
                params.set('redirect_uri', this.oauthParams.redirectUri);
                params.set('response_type', this.oauthParams.responseType || 'code');
                if (this.oauthParams.scope) params.set('scope', this.oauthParams.scope);
                if (this.oauthParams.state) params.set('state', this.oauthParams.state);
                if (this.oauthParams.codeChallenge) {
                    params.set('code_challenge', this.oauthParams.codeChallenge);
                    params.set('code_challenge_method', this.oauthParams.codeChallengeMethod || 'plain');
                }
                if (this.oauthParams.nonce) params.set('nonce', this.oauthParams.nonce);
                if (this.oauthParams.resource) params.set('resource', this.oauthParams.resource);
                params.set('subscriber_tenant_hint', tenant.domain);
                params.set('session_confirmed', 'true');

                // Full-page navigation to authorize endpoint
                window.location.href = `/api/oauth/authorize?${params.toString()}`;
            } else {
                // Unexpected response
                this.error = 'Unexpected response from server. Please try again.';
                this.selecting = false;
            }
        } catch (error: any) {
            console.error('Error during tenant selection:', error);
            this.error = error.error?.message || 'Failed to complete authentication. Please try again.';
            this.selecting = false;
            this.messageService.add({
                severity: 'error',
                summary: 'Error',
                detail: this.error,
                life: 5000,
            });
        }
    }
}
