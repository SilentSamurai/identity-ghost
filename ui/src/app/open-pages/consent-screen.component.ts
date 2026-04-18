import {Component, OnInit} from '@angular/core';
import {Router} from '@angular/router';
import {AuthService} from '../_services/auth.service';
import {SessionService} from '../_services/session.service';
import {MessageService} from 'primeng/api';

@Component({
    selector: 'app-consent-screen',
    template: `
        <app-open-navbar></app-open-navbar>
        <app-centered-card
            imageUrl="/assets/logo-img.jpg"
        >
            <div class="card-header">
                <h4 class="mb-0">{{ clientName }} is requesting access</h4>
            </div>
            <div class="card-body">
                <p class="text-muted mb-4">
                    This application is requesting access to the following information:
                </p>

                <div class="list-group mb-4">
                    <div *ngFor="let scope of requestedScopes"
                         class="list-group-item">
                        <div class="d-flex align-items-center">
                            <i class="fa fa-check-circle text-success me-3"></i>
                            <div>
                                <h6 class="mb-0">{{ getScopeDescription(scope) }}</h6>
                                <small class="text-muted">{{ scope }}</small>
                            </div>
                        </div>
                    </div>
                </div>

                <div *ngIf="error" class="alert alert-danger mb-4" role="alert">
                    {{ error }}
                    <button (click)="clearError()" class="btn btn-sm btn-outline-danger ms-2">
                        Dismiss
                    </button>
                </div>

                <div class="d-grid gap-2">
                    <button (click)="onApprove()"
                            [disabled]="loading"
                            class="btn btn-primary btn-lg">
                        <span *ngIf="!loading">Approve</span>
                        <span *ngIf="loading">
                            <span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                            Approving...
                        </span>
                    </button>
                    <button (click)="onDeny()"
                            [disabled]="loading"
                            class="btn btn-outline-secondary btn-lg">
                        <span *ngIf="!loading">Deny</span>
                        <span *ngIf="loading">Denying...</span>
                    </button>
                </div>
            </div>
        </app-centered-card>
    `,
    styles: [`
        .list-group-item {
            border: 1px solid #dee2e6;
            padding: 12px 16px;
            margin-bottom: 8px;
            border-radius: 4px;
        }
        .me-3 { margin-right: 12px; }
        .ms-2 { margin-left: 8px; }
        .mb-4 { margin-bottom: 24px; }
        .mb-0 { margin-bottom: 0; }
        .text-muted { color: #6c757d; }
        .text-success { color: #198754; }
        h6 { font-weight: 600; font-size: 14px; }
        small { font-size: 12px; }
        [data-bs-theme="dark"] .list-group-item {
            background-color: var(--bs-dark, #212529);
            border-color: var(--bs-border-color, #495057);
        }
        [data-bs-theme="dark"] .text-muted { color: var(--bs-secondary-text-emphasis, #adb5bd); }
        [data-bs-theme="dark"] h6 { color: var(--bs-body-color, #f8f9fa); }
    `]
})
export class ConsentScreenComponent implements OnInit {
    clientName: string = '';
    requestedScopes: string[] = [];
    loading = false;
    error = '';

    private loginParams: any = {};
    private redirectUri: string = '';
    private state: string = '';

    constructor(
        private router: Router,
        private authService: AuthService,
        private tokenStorage: SessionService,
        private messageService: MessageService
    ) {}

    ngOnInit() {
        const state = history.state;
        if (state?.loginParams && state?.client_name && state?.scopes) {
            this.loginParams = state.loginParams;
            this.clientName = state.client_name;
            this.requestedScopes = state.scopes || [];
            this.redirectUri = state.loginParams?.redirect_uri || '';
            this.state = state.loginParams?.state || '';
        } else {
            this.router.navigate(['/authorize']);
        }
    }

    getScopeDescription(scope: string): string {
        const descriptions: { [key: string]: string } = {
            'openid': 'Verify your identity',
            'profile': 'View your profile information (name)',
            'email': 'View your email address',
        };
        return descriptions[scope] || scope;
    }

    async onApprove(): Promise<void> {
        this.loading = true;
        this.error = '';
        try {
            const data = await this.authService.submitConsent({
                email: this.loginParams.username,
                password: this.loginParams.password,
                client_id: this.loginParams.client_id,
                code_challenge: this.loginParams.code_challenge,
                code_challenge_method: this.loginParams.code_challenge_method,
                approved_scopes: this.requestedScopes,
                consent_action: 'approve',
                redirect_uri: this.redirectUri,
                scope: this.loginParams.scope,
                nonce: this.loginParams.nonce,
                subscriber_tenant_hint: this.loginParams.subscriber_tenant_hint,
            });

            if (data.authentication_code) {
                this.tokenStorage.saveAuthCode(data.authentication_code);
                this.redirectToClient(data.authentication_code);
            }
        } catch (err: any) {
            console.error('Error during consent approval:', err);
            this.error = err.error?.message || 'Failed to process consent. Please try again.';
        } finally {
            this.loading = false;
        }
    }

    async onDeny(): Promise<void> {
        this.loading = true;
        this.error = '';
        try {
            const data = await this.authService.submitConsent({
                email: this.loginParams.username,
                password: this.loginParams.password,
                client_id: this.loginParams.client_id,
                code_challenge: this.loginParams.code_challenge,
                code_challenge_method: this.loginParams.code_challenge_method,
                approved_scopes: this.requestedScopes,
                consent_action: 'deny',
                redirect_uri: this.redirectUri,
                scope: this.loginParams.scope,
                nonce: this.loginParams.nonce,
                subscriber_tenant_hint: this.loginParams.subscriber_tenant_hint,
            });

            // On deny, redirect to client with error
            if (data.error) {
                this.redirectWithError(data.error, data.error_description);
            }
        } catch (err: any) {
            console.error('Error during consent denial:', err);
            this.error = err.error?.message || 'Failed to process denial. Please try again.';
        } finally {
            this.loading = false;
        }
    }

    clearError(): void {
        this.error = '';
    }

    private redirectToClient(authCode: string): void {
        const redirectUrl = new URL(this.redirectUri);
        redirectUrl.searchParams.append('code', authCode);
        if (this.state) {
            redirectUrl.searchParams.append('state', this.state);
        }
        window.location.href = redirectUrl.toString();
    }

    private redirectWithError(error: string, errorDescription: string): void {
        const redirectUrl = new URL(this.redirectUri);
        redirectUrl.searchParams.append('error', error);
        redirectUrl.searchParams.append('error_description', errorDescription);
        if (this.state) {
            redirectUrl.searchParams.append('state', this.state);
        }
        window.location.href = redirectUrl.toString();
    }
}
