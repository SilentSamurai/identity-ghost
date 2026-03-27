import {Component, OnInit} from '@angular/core';
import {Router} from '@angular/router';
import {AuthService} from '../_services/auth.service';
import {SessionService} from '../_services/session.service';
import {MessageService} from 'primeng/api';

@Component({
    selector: 'app-tenant-selection',
    template: `
        <app-centered-card
            imageUrl="/assets/logo-img.jpg"
        >
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
    `]
})
export class TenantSelectionComponent implements OnInit {
    tenants: any[] = [];
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
        if (state?.loginParams && state?.tenants && state?.redirectUri) {
            this.loginParams = state.loginParams;
            this.tenants = state.tenants;
            this.redirectUri = state.redirectUri;
            this.state = state.state || '';
        } else {
            this.router.navigate(['/login']);
        }
    }

    async selectTenant(tenant: any) {
        try {
            // Re-call /login with the selected tenant hint
            const data = await this.authService.login(
                this.loginParams.username,
                this.loginParams.password,
                this.loginParams.client_id,
                this.loginParams.code_challenge,
                this.loginParams.code_challenge_method,
                tenant.domain,
            );

            // Now we have the auth code — save and redirect
            this.tokenStorage.saveAuthCode(data.authentication_code);
            const redirectUrl = new URL(this.redirectUri);
            redirectUrl.searchParams.append('code', data.authentication_code);
            if (this.state) {
                redirectUrl.searchParams.append('state', this.state);
            }
            window.location.href = redirectUrl.toString();
        } catch (error) {
            console.error('Error during tenant selection:', error);
            this.messageService.add({
                severity: 'error',
                summary: 'Error',
                detail: 'Failed to complete authentication. Please try again.',
                life: 5000
            });
        }
    }
}
