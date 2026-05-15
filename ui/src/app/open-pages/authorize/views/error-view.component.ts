import {Component, EventEmitter, HostBinding, Input, Output} from '@angular/core';

/**
 * `ErrorViewComponent`
 *
 * Presentation-only terminal-error view for `UnifiedAuthorizeComponent`.
 *
 * Per Requirement 13.6, the unified component never attempts to recover by
 * switching views on its own — it either stays in an error state or lets the
 * user click "Start Over" to redirect back through
 * `GET /api/oauth/authorize` with the preserved OAuth parameters.
 *
 * Inputs:
 *   - `message`     — human-readable error string chosen by the parent from
 *                     the error table in the design document (Requirement 13.2).
 *   - `recoverable` — when `true`, show the "Start Over" button; when `false`
 *                     (e.g. missing `client_id`/`redirect_uri` — Requirement 9.5,
 *                     9.6), suppress the recovery affordance entirely because
 *                     there is no valid authorize URL to rebuild.
 *
 * Outputs:
 *   - `startOver`   — emitted when the user clicks "Start Over". The parent
 *                     component is responsible for computing the redirect URL
 *                     from its captured OAuth parameters and navigating there.
 *
 * The component makes no HTTP calls and does not read OAuth parameters — it
 * knows nothing about the flow beyond the strings it is handed.
 */
@Component({
    selector: 'app-error-view',
    template: `
        <div class="error-wrapper text-center">
            <div class="error-icon mb-3" aria-hidden="true">
                <i class="fa fa-exclamation-triangle"></i>
            </div>

            <h4 class="mb-3">Authorization error</h4>

            <p class="text-muted mb-4" data-error-message>{{ message }}</p>

            <div *ngIf="recoverable" class="d-grid gap-2">
                <button type="button"
                        class="btn btn-primary btn-lg"
                        data-start-over
                        (click)="onStartOver()">
                    Start Over
                </button>
            </div>
        </div>
    `,
    styles: [`
        .error-wrapper {
            padding: 24px 8px;
        }

        .error-icon {
            font-size: 48px;
            color: var(--bs-danger, #dc3545);
        }

        h4 {
            font-weight: 600;
        }

        .text-muted {
            color: #6c757d;
        }

        [data-bs-theme="dark"] .text-muted {
            color: var(--bs-secondary-text-emphasis, #adb5bd);
        }
    `],
})
export class ErrorViewComponent {
    /**
     * Tags the host element with `data-view="error"` so tests can assert
     * this branch is the one active view (Property 4).
     */
    @HostBinding('attr.data-view') readonly dataView = 'error';

    /**
     * Human-readable error string. Chosen by the parent from the design
     * document's error table — this component does not map error codes.
     */
    @Input() message = '';

    /**
     * Whether to show the "Start Over" button. `false` for cases where there
     * is no valid authorize URL to rebuild (e.g., missing `client_id` /
     * `redirect_uri`, Requirements 9.5 and 9.6).
     */
    @Input() recoverable = false;

    /**
     * Fired when the user clicks "Start Over". The parent (`UnifiedAuthorize
     * Component`) owns the redirect — this keeps the view stateless.
     */
    @Output() readonly startOver = new EventEmitter<void>();

    onStartOver(): void {
        this.startOver.emit();
    }
}
