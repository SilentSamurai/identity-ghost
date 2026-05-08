import {Component, OnInit} from '@angular/core';
import {ActivatedRoute} from '@angular/router';
import {AuthService} from '../_services/auth.service';
import {SessionService} from '../_services/session.service';

@Component({
    selector: 'app-logout',
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

            <div *ngIf="!loading" class="text-center py-4">
                <i class="fa fa-check-circle text-success" style="font-size: 48px;"></i>
                <h4 class="mt-3">You have been logged out</h4>
                <p class="text-muted">Your session has been ended successfully.</p>
            </div>
        </app-centered-card>
    `,
    styles: [`
        .text-success {
            color: #198754;
        }

        .text-muted {
            color: #6c757d;
        }

        [data-bs-theme="dark"] .text-muted {
            color: var(--bs-secondary-text-emphasis, #adb5bd);
        }

        [data-bs-theme="dark"] h4 {
            color: var(--bs-body-color, #f8f9fa);
        }
    `],
})
export class LogoutComponent implements OnInit {
    loading = true;

    private postLogoutRedirectUri = '';
    private state = '';

    constructor(
        private route: ActivatedRoute,
        private authService: AuthService,
        private sessionService: SessionService,
    ) {
    }

    async ngOnInit(): Promise<void> {
        const params = this.route.snapshot.queryParamMap;
        this.postLogoutRedirectUri = params.get('post_logout_redirect_uri') || '';
        this.state = params.get('state') || '';

        // Auto-call session-logout on init — gracefully handle already-logged-out case
        try {
            await this.authService.sessionLogout();
        } catch (e) {
            // Ignore errors — user may already be logged out
            console.error('Session logout error (may already be logged out):', e);
        }

        // Clear local session state
        this.sessionService.clearSession();

        this.loading = false;

        // If a post_logout_redirect_uri was provided, redirect to it with state
        if (this.postLogoutRedirectUri) {
            const redirectUrl = new URL(this.postLogoutRedirectUri);
            if (this.state) {
                redirectUrl.searchParams.set('state', this.state);
            }
            window.location.href = redirectUrl.toString();
        }
        // Otherwise, display the "You have been logged out" message (template handles this)
    }
}
