import {Component, OnInit} from '@angular/core';
import {NgbActiveModal} from '@ng-bootstrap/ng-bootstrap';
import {AppService} from '../../../_services/app.service';
import {HttpClient, HttpHeaders} from '@angular/common/http';
import {lastValueFrom} from 'rxjs';

@Component({
    selector: 'app-create-app-admin',
    template: `
        <app-standard-dialog title="Create App" subtitle="Add a new application">
            <app-dialog-tab name="App Details">
                <form (ngSubmit)="onSubmit()" *ngIf="!createdApp">
                    <div class="mb-3">
                        <label for="tenantSelect" class="form-label">Owner Tenant</label>
                        <select class="form-select" id="tenantSelect" [(ngModel)]="tenantId" name="tenantSelect"
                                required>
                            <option [ngValue]="undefined" disabled>Select a tenant</option>
                            <option *ngFor="let t of tenants" [ngValue]="t.id">{{ t.name }} ({{ t.domain }})</option>
                        </select>
                    </div>
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
                <div *ngIf="createdApp" class="app-created-info">
                    <div class="alert alert-success">App created successfully</div>
                    <div class="mb-2">
                        <strong>Client ID:</strong>
                        <code>{{ createdApp.clientId }}</code>
                        <button class="btn btn-sm btn-outline-secondary ms-2" (click)="copyToClipboard(createdApp.clientId)">Copy</button>
                    </div>
                    <div class="mb-2">
                        <strong>Alias:</strong>
                        <code>{{ createdApp.alias }}</code>
                        <button class="btn btn-sm btn-outline-secondary ms-2" (click)="copyToClipboard(createdApp.alias)">Copy</button>
                    </div>
                </div>
            </app-dialog-tab>

            <app-dialog-footer>
                <button type="button" class="btn btn-primary" (click)="onSubmit()" [disabled]="!tenantId" *ngIf="!createdApp">Create
                </button>
                <button type="button" class="btn btn-primary" (click)="close()" *ngIf="createdApp">Done</button>
                <button type="button" class="btn btn-secondary" (click)="activeModal.close()">Cancel</button>
            </app-dialog-footer>
        </app-standard-dialog>
    `
})
export class CreateAppAdminComponent implements OnInit {
    app: any = {
        onboardingEnabled: true
    };
    tenantId?: string = undefined;
    tenants: any[] = [];
    createdApp: any = null;

    constructor(
        public activeModal: NgbActiveModal,
        private appService: AppService,
        private http: HttpClient,
    ) {
    }

    async ngOnInit() {
        await this.loadTenants();
    }

    copyToClipboard(text: string) {
        navigator.clipboard.writeText(text);
    }

    async onSubmit() {
        try {
            if (!this.tenantId) {
                return;
            }

            const result = await this.appService.createApp(
                this.tenantId,
                this.app.name,
                this.app.appUrl,
                this.app.description,
                this.app.onboardingEnabled,
                this.app.onboardingCallbackUrl || undefined
            );
            this.createdApp = result;
        } catch (error) {
            console.error('Error creating app:', error);
            this.activeModal.dismiss();
        }
    }

    close() {
        this.activeModal.close(this.createdApp || this.app);
    }

    private async loadTenants() {
        try {
            const result = await lastValueFrom(
                this.http.post<{ data: any[] }>('/api/search/Tenants', {
                    pageNo: 0,
                    pageSize: 1000,
                    where: [],
                    orderBy: [],
                    expand: [],
                }, {headers: new HttpHeaders({'Content-Type': 'application/json'})})
            );
            this.tenants = result.data || [];
        } catch (e) {
            console.error('Failed to load tenants', e);
        }
    }
}
