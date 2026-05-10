import {Component, Input} from '@angular/core';
import {NgbActiveModal} from '@ng-bootstrap/ng-bootstrap';
import {AppService} from '../../../_services/app.service';

interface WebhookResult {
    url: string;
    status: number | null;
    latencyMs: number;
    ok: boolean;
    error?: string;
    bodyValid: boolean;
    body?: any;
}

interface TestWebhookResponse {
    onboardingEnabled: boolean;
    onboard: WebhookResult | null;
    offboard: WebhookResult | null;
}

@Component({
    selector: 'app-test-webhook-admin',
    template: `
        <app-standard-dialog title="Test Onboarding Webhook" subtitle="Verify your onboard/offboard endpoints are reachable">
            <app-dialog-tab name="Test Results">
                <div *ngIf="!result && !loading && !error" class="text-center py-4">
                    <p class="text-muted mb-3">
                        Fires a dry-run <code>POST /api/onboard/tenant</code> and
                        <code>POST /api/offboard/tenant</code> against your configured URL
                        with <code>X-Webhook-Test: true</code>. No data is created.
                    </p>
                    <div class="mb-3 text-start">
                        <small class="text-muted d-block"><strong>App:</strong> {{ app.name }}</small>
                        <small class="text-muted d-block">
                            <strong>Webhook URL:</strong>
                            {{ app.onboardingCallbackUrl || app.appUrl || '(not set)' }}
                        </small>
                    </div>
                    <button class="btn btn-primary" (click)="runTest()">
                        <i class="fa fa-play me-2"></i> Run Test
                    </button>
                </div>

                <div *ngIf="loading" class="text-center py-4">
                    <div class="spinner-border text-primary" role="status">
                        <span class="visually-hidden">Testing...</span>
                    </div>
                    <p class="mt-2 text-muted">Calling webhook endpoints…</p>
                </div>

                <div *ngIf="error && !loading" class="alert alert-danger">
                    <i class="fa fa-exclamation-triangle me-2"></i>{{ error }}
                </div>

                <div *ngIf="result && !loading">
                    <!-- Onboarding disabled notice -->
                    <div *ngIf="!result.onboardingEnabled" class="alert alert-warning">
                        <i class="fa fa-info-circle me-2"></i>
                        Onboarding callbacks are <strong>disabled</strong> for this app. No webhook calls were made.
                    </div>

                    <!-- No URL configured -->
                    <div *ngIf="result.onboardingEnabled && !result.onboard && !result.offboard" class="alert alert-warning">
                        <i class="fa fa-info-circle me-2"></i>
                        No App URL or Onboarding Callback URL is configured.
                    </div>

                    <!-- Results -->
                    <ng-container *ngIf="result.onboardingEnabled && (result.onboard || result.offboard)">
                        <div class="mb-3">
                            <ng-container *ngTemplateOutlet="resultCard; context: { label: 'Onboard', r: result.onboard }"></ng-container>
                        </div>
                        <div>
                            <ng-container *ngTemplateOutlet="resultCard; context: { label: 'Offboard', r: result.offboard }"></ng-container>
                        </div>
                    </ng-container>

                    <div class="mt-3 d-flex gap-2">
                        <button class="btn btn-outline-secondary btn-sm" (click)="reset()">
                            <i class="fa fa-redo me-1"></i> Run Again
                        </button>
                    </div>
                </div>
            </app-dialog-tab>

            <app-dialog-footer>
                <button type="button" class="btn btn-secondary" (click)="activeModal.close()">Close</button>
            </app-dialog-footer>
        </app-standard-dialog>

        <ng-template #resultCard let-label="label" let-r="r">
            <div *ngIf="r" class="card" [ngClass]="r.ok ? 'border-success' : 'border-danger'">
                <div class="card-header d-flex justify-content-between align-items-center py-2"
                     [ngClass]="r.ok ? 'bg-success-subtle' : 'bg-danger-subtle'">
                    <span class="fw-semibold">{{ label }}</span>
                    <span>
                        <span class="badge me-2" [ngClass]="r.ok ? 'bg-success' : 'bg-danger'">
                            {{ r.status !== null ? r.status : 'No response' }}
                        </span>
                        <small class="text-muted">{{ r.latencyMs }} ms</small>
                    </span>
                </div>
                <div class="card-body py-2">
                    <div class="mb-1">
                        <small class="text-muted">URL: </small>
                        <code style="font-size: 0.75rem">{{ r.url }}</code>
                    </div>
                    <div *ngIf="r.error" class="text-danger mt-1">
                        <small><i class="fa fa-exclamation-circle me-1"></i>{{ r.error }}</small>
                    </div>
                    <div *ngIf="!r.ok && !r.error && r.status" class="text-danger mt-1">
                        <small><i class="fa fa-exclamation-circle me-1"></i>Server returned HTTP {{ r.status }}</small>
                    </div>
                    <div *ngIf="r.ok" class="text-success mt-1">
                        <small><i class="fa fa-check-circle me-1"></i>Endpoint reachable and responded successfully</small>
                    </div>
                    <div *ngIf="r.body" class="mt-2">
                        <small class="text-muted">Response body:</small>
                        <pre class="mt-1 p-2 rounded bg-body-secondary" style="font-size: 0.7rem; max-height: 80px; overflow-y: auto;">{{ r.body | json }}</pre>
                    </div>
                </div>
            </div>
        </ng-template>
    `,
})
export class TestWebhookAdminComponent {
    @Input() app: any;

    loading = false;
    result: TestWebhookResponse | null = null;
    error: string | null = null;

    constructor(
        public activeModal: NgbActiveModal,
        private appService: AppService,
    ) {
    }

    async runTest() {
        this.loading = true;
        this.error = null;
        this.result = null;
        try {
            this.result = await this.appService.testWebhook(this.app.id);
        } catch (e: any) {
            this.error = e?.error?.message || e?.message || 'Unexpected error running webhook test.';
        } finally {
            this.loading = false;
        }
    }

    reset() {
        this.result = null;
        this.error = null;
    }
}
