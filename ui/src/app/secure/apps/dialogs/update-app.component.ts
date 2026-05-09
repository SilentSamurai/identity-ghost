import {Component, Input, OnInit} from '@angular/core';
import {NgbActiveModal} from '@ng-bootstrap/ng-bootstrap';
import {AppService} from '../../../_services/app.service';
import {SessionService} from '../../../_services/session.service';

@Component({
    selector: 'app-update-app',
    template: `
        <app-standard-dialog title="Update App" subtitle="Modify application details">
            <app-dialog-tab name="App Details">
                <div class="mb-3">
                    <label class="form-label">Client ID</label>
                    <div><code>{{ app.clientId }}</code></div>
                </div>
                <div class="mb-3">
                    <label class="form-label">Alias</label>
                    <div><code>{{ app.alias }}</code></div>
                </div>
                <form (ngSubmit)="onSubmit()">
                    <div class="mb-3">
                        <label for="name" class="form-label">Name</label>
                        <input type="text" class="form-control" id="name" [(ngModel)]="app.name" name="name" required>
                    </div>
                    <div class="mb-3">
                        <label for="appUrl" class="form-label">App URL</label>
                        <input type="text" class="form-control" id="appUrl" [(ngModel)]="app.appUrl" name="appUrl"
                               required>
                    </div>
                    <div class="mb-3">
                        <label for="description" class="form-label">Description</label>
                        <textarea class="form-control" id="description" [(ngModel)]="app.description" name="description"
                                  rows="3"></textarea>
                    </div>
                    <hr>
                    <h6>Onboarding Settings</h6>
                    <div class="mb-3 form-check">
                        <input type="checkbox" class="form-check-input" id="onboardingEnabled" 
                               [(ngModel)]="app.onboardingEnabled" name="onboardingEnabled">
                        <label class="form-check-label" for="onboardingEnabled">Enable tenant onboarding callbacks</label>
                        <small class="form-text text-muted d-block">When enabled, the auth server will call your app's onboard/offboard endpoints when tenants subscribe or unsubscribe.</small>
                    </div>
                    <div class="mb-3" *ngIf="app.onboardingEnabled">
                        <label for="onboardingCallbackUrl" class="form-label">Onboarding Callback URL (optional)</label>
                        <input type="text" class="form-control" id="onboardingCallbackUrl" 
                               [(ngModel)]="app.onboardingCallbackUrl" name="onboardingCallbackUrl"
                               placeholder="Leave empty to use App URL">
                        <small class="form-text text-muted">Base URL for onboarding callbacks. If empty, App URL will be used.</small>
                    </div>
                </form>
            </app-dialog-tab>

            <app-dialog-footer>
                <button type="button" class="btn btn-primary" (click)="onSubmit()">Update</button>
                <button type="button" class="btn btn-secondary" (click)="activeModal.close()">Cancel</button>
            </app-dialog-footer>
        </app-standard-dialog>
    `
})
export class UpdateAppComponent implements OnInit {
    @Input() app: any;

    constructor(
        public activeModal: NgbActiveModal,
        private appService: AppService,
        private sessionService: SessionService
    ) {
    }

    ngOnInit() {
        // Ensure onboardingEnabled has a default value if not set
        if (this.app.onboardingEnabled === undefined) {
            this.app.onboardingEnabled = true;
        }
    }

    async onSubmit() {
        try {
            await this.appService.updateApp(
                this.app.id,
                this.app.name,
                this.app.appUrl,
                this.app.description,
                this.app.onboardingEnabled,
                this.app.onboardingCallbackUrl || null
            );
            this.activeModal.close(this.app);
        } catch (error) {
            console.error('Error updating app:', error);
            this.activeModal.dismiss();
        }
    }
}
