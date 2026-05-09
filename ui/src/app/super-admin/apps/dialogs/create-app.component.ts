import {Component, OnInit} from '@angular/core';
import {NgbActiveModal} from '@ng-bootstrap/ng-bootstrap';
import {AppService} from '../../../_services/app.service';

@Component({
    selector: 'app-create-app',
    template: `
        <app-standard-dialog title="Create App" subtitle="Add a new application to your tenant">
            <app-dialog-tab name="App Details">
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
                <button type="button" class="btn btn-primary" (click)="onSubmit()">Create</button>
                <button type="button" class="btn btn-secondary" (click)="activeModal.close()">Cancel</button>
            </app-dialog-footer>
        </app-standard-dialog>
    `
})
export class CreateAppComponent implements OnInit {
    app: any = {
        onboardingEnabled: true
    };
    tenantId?: string = undefined;

    constructor(
        public activeModal: NgbActiveModal,
        private appService: AppService,
    ) {
    }

    ngOnInit() {
    }

    async onSubmit() {
        try {
            if (!this.tenantId) {
                return;
            }

            await this.appService.createApp(
                this.tenantId,
                this.app.name,
                this.app.appUrl,
                this.app.description,
                this.app.onboardingEnabled,
                this.app.onboardingCallbackUrl || undefined
            );
            this.activeModal.close(this.app);
        } catch (error) {
            console.error('Error creating app:', error);
            this.activeModal.dismiss();
        }
    }
}
