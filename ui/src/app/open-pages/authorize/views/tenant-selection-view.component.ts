import {Component, EventEmitter, Input, Output} from '@angular/core';

import {TenantInfo} from '../authorize.types';

/**
 * Tenant-selection view for the Unified OAuth Authorization UI.
 *
 * This is a stateless presentation component. It receives the list of
 * candidate tenants (produced by `POST /api/oauth/login` when the caller is
 * ambiguous across multiple subscriber tenants) and emits the user's choice
 * back to the parent `UnifiedAuthorizeComponent`. The parent owns all state
 * — including `pendingCredentials` / `pendingTenants` and the CSRF token —
 * and is the only component allowed to issue HTTP calls or redirects.
 *
 * This separation enforces:
 *   - Requirement 3.1, 3.3: tenant list is rendered; user picks exactly one
 *     tenant; selection is disabled while the re-login request is in flight.
 *   - Property 9 ("Submit-button mutual exclusion"): the selection control
 *     is disabled and the spinner is visible for exactly the duration of
 *     the in-flight HTTP call.
 *
 * Note on the output name: the `select` identifier collides with the native
 * DOM `select` event (fired on text-selection inside inputs). To avoid any
 * ambiguity in template bindings (`(tenantSelect)="..."` vs `(select)="..."`)
 * the output is named `tenantSelect`. This follows the task guidance to
 * rename when `select` conflicts with native DOM events.
 */
@Component({
    selector: 'app-tenant-selection-view',
    template: `
        <div [attr.data-view]="'tenant-selection'">
            <div *ngIf="errorMessage" class="alert alert-danger mt-3" role="alert">
                {{ errorMessage }}
            </div>

            <div class="card-header">
                <h4 class="mb-0">Select Tenant</h4>
            </div>
            <div class="card-body">
                <p class="text-muted mb-4">
                    You have access to this application through multiple tenants. Please select
                    which tenant you want to use:
                </p>
                <div class="list-group">
                    <button *ngFor="let tenant of tenants; trackBy: trackByTenantId"
                            type="button"
                            class="list-group-item list-group-item-action"
                            [attr.data-tenant-id]="tenant.id"
                            [disabled]="inflight"
                            (click)="onSelect(tenant)">
                        <div class="d-flex justify-content-between align-items-center">
                            <div>
                                <h5 class="mb-1">{{ tenant.name }}</h5>
                                <small class="text-muted">{{ tenant.domain }}</small>
                            </div>
                            <span *ngIf="inflight"
                                  class="spinner-border spinner-border-sm"
                                  role="status"
                                  aria-hidden="true"
                                  [attr.data-spinner]="''"></span>
                            <i *ngIf="!inflight" class="fa fa-chevron-right" aria-hidden="true"></i>
                        </div>
                    </button>
                </div>
            </div>
        </div>
    `,
    styles: [`
        .list-group-item {
            cursor: pointer;
            transition: all 0.2s;
        }

        .list-group-item:hover:not(:disabled) {
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
    `],
})
export class TenantSelectionViewComponent {
    /** Candidate tenants returned by `POST /api/oauth/login`. */
    @Input() tenants: TenantInfo[] = [];

    /**
     * True while the parent is performing the re-login HTTP call for the
     * currently-chosen tenant. While true, all selection buttons are
     * disabled and an in-button spinner is shown (Property 9).
     */
    @Input() inflight = false;

    /**
     * Error text to display above the tenant list. `null` hides the alert.
     * Driven by the parent from login failures during tenant re-login.
     */
    @Input() errorMessage: string | null = null;

    /**
     * Emits the tenant the user picked. The parent is responsible for
     * setting `subscriber_tenant_hint` on the retry login POST and for
     * clearing `pendingCredentials` / `pendingTenants` after success
     * (Requirement 3.7).
     *
     * Named `tenantSelect` to avoid colliding with the native DOM `select`
     * event in template bindings.
     */
    @Output() tenantSelect = new EventEmitter<TenantInfo>();

    onSelect(tenant: TenantInfo): void {
        if (this.inflight) {
            // Defensive guard: buttons are already `disabled`, but a
            // programmatic click (e.g. keyboard during state transition)
            // could still reach here. Drop the event rather than emit a
            // duplicate selection while a request is in flight.
            return;
        }
        this.tenantSelect.emit(tenant);
    }

    trackByTenantId(_index: number, tenant: TenantInfo): string {
        return tenant.id;
    }
}
