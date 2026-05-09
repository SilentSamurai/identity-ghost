import {Component, OnInit} from '@angular/core';
import {NgbActiveModal} from '@ng-bootstrap/ng-bootstrap';
import {AppService} from '../../../_services/app.service';

@Component({
    selector: 'app-create-app',
    template: `
        <app-standard-dialog title="Create App" subtitle="Add a new application to your tenant">
            <app-dialog-tab name="App Details">
                <form (ngSubmit)="onSubmit()" *ngIf="!createdApp">
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
                <button type="button" class="btn btn-primary" (click)="onSubmit()" *ngIf="!createdApp">Create</button>
                <button type="button" class="btn btn-primary" (click)="close()" *ngIf="createdApp">Done</button>
                <button type="button" class="btn btn-secondary" (click)="activeModal.close()">{{ createdApp ? 'Cancel' : 'Cancel' }}</button>
            </app-dialog-footer>
        </app-standard-dialog>
    `
})
export class CreateAppComponent implements OnInit {
    app: any = {};
    tenantId?: string = undefined;
    createdApp: any = null;

    constructor(
        public activeModal: NgbActiveModal,
        private appService: AppService,
    ) {
    }

    ngOnInit() {
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
                this.app.description
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
}
