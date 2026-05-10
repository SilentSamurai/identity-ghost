import {Component, HostBinding} from '@angular/core';

/**
 * `LoadingViewComponent`
 *
 * Presentation-only loading placeholder used by `UnifiedAuthorizeComponent`
 * while it parses the URL and (when required) waits on `GET /api/oauth/session-info`
 * before activating an interactive view (Requirements 1.3, 11.8).
 *
 * This component is deliberately dumb:
 *   - No HTTP calls.
 *   - No `ActivatedRoute` injection / no OAuth parameter handling.
 *   - No outputs — the parent component controls when `viewKind` leaves `loading`.
 *
 * The `[data-view]="loading"` attribute is bound on the host element so
 * Cypress tests can assert exactly one view is active at a time (Property 4:
 * View state closure).
 */
@Component({
    selector: 'app-loading-view',
    template: `
        <div class="align-middle text-center loading-wrapper">
            <div class="spinner-border m-5" role="status" data-spinner>
                <span class="visually-hidden">Loading...</span>
            </div>
        </div>
    `,
    styles: [`
        .loading-wrapper {
            padding-top: 25%;
        }
    `],
})
export class LoadingViewComponent {
    /**
     * Tags the host element with `data-view="loading"` so tests can target
     * exactly the active view branch via `[data-view="loading"]`.
     */
    @HostBinding('attr.data-view') readonly dataView = 'loading';
}
