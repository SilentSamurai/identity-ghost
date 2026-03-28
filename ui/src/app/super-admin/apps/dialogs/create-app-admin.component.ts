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
                <form (ngSubmit)="onSubmit()">
                    <div class="mb-3">
                        <label for="tenantSelect" class="form-label">Owner Tenant</label>
                        <select class="form-select" id="tenantSelect" [(ngModel)]="tenantId" name="tenantSelect" required>
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
                <button type="button" class="btn btn-primary" (click)="onSubmit()" [disabled]="!tenantId">Create</button>
                <button type="button" class="btn btn-secondary" (click)="activeModal.close()">Cancel</button>
            </app-dialog-footer>
        </app-standard-dialog>
    `
})
export class CreateAppAdminComponent implements OnInit {
    app: any = {};
    tenantId?: string = undefined;
    tenants: any[] = [];

    constructor(
        public activeModal: NgbActiveModal,
        private appService: AppService,
        private http: HttpClient,
    ) {
    }

    async ngOnInit() {
        await this.loadTenants();
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

    async onSubmit() {
        try {
            if (!this.tenantId) {
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
