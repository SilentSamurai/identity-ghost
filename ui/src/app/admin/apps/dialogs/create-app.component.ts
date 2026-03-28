import {Component, OnInit} from '@angular/core';
import {NgbActiveModal} from '@ng-bootstrap/ng-bootstrap';
import {AppService} from '../../../_services/app.service';
import {SessionService} from '../../../_services/session.service';

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
                        <input type="text" class="form-control" id="appUrl" [(ngModel)]="app.appUrl" name="appUrl" required>
                    </div>
                    <div class="mb-3">
                        <label for="description" class="form-label">Description</label>
                        <textarea class="form-control" id="description" [(ngModel)]="app.description" name="description"
                                  rows="3"></textarea>
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
    app: any = {};
    tenantId?: string = undefined;

    constructor(
        public activeModal: NgbActiveModal,
        private appService: AppService,
        private sessionService: SessionService
    ) {
    }

    ngOnInit() {
        console.log('CreateAppComponent initialized with tenantId:', this.tenantId);
    }

    async onSubmit() {
        try {
            // Validate tenantId is set
            if (!this.tenantId) {
                console.error('tenantId is not set');
                alert('Error: Tenant ID is missing. Please try again.');
                return;
            }
            
            await this.appService.createApp(
                this.tenantId,
                this.app.name,
                this.app.appUrl,
                this.app.description
            );
            this.activeModal.close(this.app);
        } catch (error) {
            console.error('Error creating app:', error);
            this.activeModal.dismiss();
        }
    }
}
