import {Component, OnInit} from '@angular/core';
import {ActivatedRoute, Router} from '@angular/router';
import {AuthService} from '../_services/auth.service';
import {HttpClient} from '@angular/common/http';
import {lastValueFrom} from 'rxjs';

@Component({
    selector: 'app-consent',
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
                <div class="card-header mb-3">
                    <h4 class="mb-0">{{ clientId }} is requesting access</h4>
                </div>

                <p class="text-muted mb-3">
                    Signed in as <strong>{{ email }}</strong>
                </p>

                <p class="text-muted mb-4">
                    This application is requesting access to the following:
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

                <div class="d-grid gap-2">
                    <button type="button"
                            (click)="onGrant()"
                            class="btn btn-primary btn-lg">
                        Approve
                    </button>
                    <button type="button"
                            (click)="onDeny()"
                            class="btn btn-outline-secondary btn-lg">
                        Deny
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

        .me-3 {
            margin-right: 12px;
        }

        .mb-4 {
            margin-bottom: 24px;
        }

        .mb-3 {
            margin-bottom: 16px;
        }

        .mb-0 {
            margin-bottom: 0;
        }

        .text-muted {
            color: #6c757d;
        }

        .text-success {
            color: #198754;
        }

        h6 {
            font-weight: 600;
            font-size: 14px;
        }

        small {
            font-size: 12px;
        }

        [data-bs-theme="dark"] .list-group-item {
            background-color: var(--bs-dark, #212529);
            border-color: var(--bs-border-color, #495057);
        }

        [data-bs-theme="dark"] .text-muted {
            color: var(--bs-secondary-text-emphasis, #adb5bd);
        }

        [data-bs-theme="dark"] h6 {
            color: var(--bs-body-color, #f8f9fa);
        }
    `],
})
export class ConsentComponent implements OnInit {
    loading = true;
    email = '';
    clientId = '';
    requestedScopes: string[] = [];

    // OAuth params
    redirectUri = '';
    responseType = '';
    scope = '';
    state = '';
    codeChallenge = '';
    codeChallengeMethod = '';
    nonce = '';
    resource = '';
    csrfToken = '';
    subscriberTenantHint = '';

    constructor(
        private route: ActivatedRoute,
        private router: Router,
        private authService: AuthService,
        private http: HttpClient,
    ) {
    }

    async ngOnInit(): Promise<void> {
        const params = this.route.snapshot.queryParamMap;

        // Parse OAuth params from query string
        this.clientId = params.get('client_id') || '';
        this.redirectUri = params.get('redirect_uri') || '';
        this.responseType = params.get('response_type') || 'code';
        this.scope = params.get('scope') || '';
        this.state = params.get('state') || '';
        this.codeChallenge = params.get('code_challenge') || '';
        this.codeChallengeMethod = params.get('code_challenge_method') || '';
        this.nonce = params.get('nonce') || '';
        this.resource = params.get('resource') || '';
        this.csrfToken = params.get('csrf_token') || '';
        this.subscriberTenantHint = params.get('subscriber_tenant_hint') || '';

        // Parse requested scopes for display
        this.requestedScopes = this.scope ? this.scope.split(' ').filter(s => s.length > 0) : [];

        // Fetch user email from session-info (cookie-authenticated)
        try {
            const info = await this.authService.getSessionInfo();
            this.email = info.email;
        } catch (e) {
            console.error('Failed to fetch session info:', e);
            // Session invalid — redirect back to authorize
            this.navigateToAuthorize();
            return;
        }

        this.loading = false;
    }

    getScopeDescription(scope: string): string {
        const descriptions: {[key: string]: string} = {
            'openid': 'Verify your identity',
            'profile': 'View your profile information (name)',
            'email': 'View your email address',
            'offline_access': 'Maintain access when you are not present',
        };
        return descriptions[scope] || scope;
    }

    onGrant(): void {
        this.submitDecision('grant');
    }

    onDeny(): void {
        this.submitDecision('deny');
    }

    private async submitDecision(decision: 'grant' | 'deny'): Promise<void> {
        this.loading = true;

        const body = {
            decision,
            client_id: this.clientId,
            scope: this.scope,
            csrf_token: this.csrfToken,
        };

        try {
            // POST to /api/oauth/consent — records consent decision
            await lastValueFrom(
                this.http.post<{success: true}>('/api/oauth/consent', body, {
                    withCredentials: true,
                }),
            );

            // On success, redirect to authorize — it will check consent and handle accordingly
            const params = new URLSearchParams();
            params.set('client_id', this.clientId);
            params.set('redirect_uri', this.redirectUri);
            params.set('response_type', this.responseType || 'code');
            if (this.scope) params.set('scope', this.scope);
            if (this.state) params.set('state', this.state);
            if (this.codeChallenge) params.set('code_challenge', this.codeChallenge);
            if (this.codeChallengeMethod) params.set('code_challenge_method', this.codeChallengeMethod);
            if (this.nonce) params.set('nonce', this.nonce);
            if (this.resource) params.set('resource', this.resource);
            if (this.subscriberTenantHint) params.set('subscriber_tenant_hint', this.subscriberTenantHint);
            window.location.href = `/api/oauth/authorize?${params.toString()}`;
        } catch (err: any) {
            console.error('Consent submission failed:', err);
            this.loading = false;
        }
    }

    private navigateToAuthorize(): void {
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
        if (this.subscriberTenantHint) params.set('subscriber_tenant_hint', this.subscriberTenantHint);
        window.location.href = `/api/oauth/authorize?${params.toString()}`;
    }
}
