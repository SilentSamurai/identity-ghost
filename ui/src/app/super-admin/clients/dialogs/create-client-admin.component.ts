import {Component, OnInit} from '@angular/core';
import {NgbActiveModal} from '@ng-bootstrap/ng-bootstrap';
import {ClientService, CreateClientRequest} from '../../../_services/client.service';
import {HttpClient, HttpHeaders} from '@angular/common/http';
import {lastValueFrom} from 'rxjs';

@Component({
    selector: 'app-create-client-admin',
    template: `
        <app-standard-dialog title="Create Client" subtitle="Register a new OAuth client">
            <app-dialog-tab name="Client Details">
                <form (ngSubmit)="onSubmit()">
                    <div class="alert alert-danger" *ngIf="errorMessage">
                        {{ errorMessage }}
                    </div>
                    <div class="mb-3">
                        <label for="tenantSelect" class="form-label">Owner Tenant</label>
                        <select class="form-select" id="tenantSelect" [(ngModel)]="tenantId" name="tenantSelect" required>
                            <option [ngValue]="undefined" disabled>Select a tenant</option>
                            <option *ngFor="let t of tenants" [ngValue]="t.id">{{ t.name }} ({{ t.domain }})</option>
                        </select>
                    </div>
                    <div class="mb-3">
                        <label for="name" class="form-label">Name</label>
                        <input type="text" class="form-control" id="name" [(ngModel)]="name" name="name" required>
                    </div>
                    <div class="mb-3">
                        <label for="redirectUris" class="form-label">Redirect URIs</label>
                        <textarea class="form-control" id="redirectUris" [(ngModel)]="redirectUris" name="redirectUris"
                                  rows="3" placeholder="Comma-separated URIs"></textarea>
                    </div>
                    <div class="mb-3">
                        <label for="allowedScopes" class="form-label">Allowed Scopes</label>
                        <input type="text" class="form-control" id="allowedScopes" [(ngModel)]="allowedScopes" name="allowedScopes">
                    </div>
                    <div class="mb-3">
                        <label for="grantTypes" class="form-label">Grant Types</label>
                        <input type="text" class="form-control" id="grantTypes" [(ngModel)]="grantTypes" name="grantTypes">
                    </div>
                    <div class="mb-3">
                        <label for="responseTypes" class="form-label">Response Types</label>
                        <input type="text" class="form-control" id="responseTypes" [(ngModel)]="responseTypes" name="responseTypes">
                    </div>
                    <div class="mb-3 form-check">
                        <input type="checkbox" class="form-check-input" id="isPublic" [(ngModel)]="isPublic" name="isPublic">
                        <label class="form-check-label" for="isPublic">Public Client</label>
                    </div>
                    <div class="mb-3 form-check">
                        <input type="checkbox" class="form-check-input" id="requirePkce" [(ngModel)]="requirePkce" name="requirePkce">
                        <label class="form-check-label" for="requirePkce">Require PKCE</label>
                    </div>
                    <div class="mb-3 form-check">
                        <input type="checkbox" class="form-check-input" id="allowPasswordGrant" [(ngModel)]="allowPasswordGrant" name="allowPasswordGrant">
                        <label class="form-check-label" for="allowPasswordGrant">Allow Password Grant</label>
                    </div>
                    <div class="mb-3 form-check">
                        <input type="checkbox" class="form-check-input" id="allowRefreshToken" [(ngModel)]="allowRefreshToken" name="allowRefreshToken">
                        <label class="form-check-label" for="allowRefreshToken">Allow Refresh Token</label>
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
export class CreateClientAdminComponent implements OnInit {
    tenantId?: string = undefined;
    tenants: any[] = [];

    name: string = '';
    redirectUris: string = '';
    allowedScopes: string = '';
    grantTypes: string = 'authorization_code';
    responseTypes: string = 'code';
    isPublic: boolean = false;
    requirePkce: boolean = false;
    allowPasswordGrant: boolean = false;
    allowRefreshToken: boolean = true;

    errorMessage: string = '';

    constructor(
        public activeModal: NgbActiveModal,
        private clientService: ClientService,
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
            this.errorMessage = '';

            if (!this.tenantId) {
                return;
            }

            if (!this.name.trim()) {
                this.errorMessage = 'Client name is required.';
                return;
            }

            const parsedUris = this.redirectUris
                .split(',')
                .map(uri => uri.trim())
                .filter(uri => uri.length > 0);

            const body: CreateClientRequest = {
                tenantId: this.tenantId,
                name: this.name.trim(),
                redirectUris: parsedUris,
                allowedScopes: this.allowedScopes || undefined,
                grantTypes: this.grantTypes || undefined,
                responseTypes: this.responseTypes || undefined,
                isPublic: this.isPublic,
                requirePkce: this.requirePkce,
                allowPasswordGrant: this.allowPasswordGrant,
                allowRefreshToken: this.allowRefreshToken,
            };

            const response = await this.clientService.createClient(this.tenantId, body);
            this.activeModal.close({client: response.client, clientSecret: response.clientSecret});
        } catch (error: any) {
            console.error('Error creating client:', error);
            this.errorMessage = error?.error?.message || error?.message || 'An error occurred while creating the client.';
        }
    }
}
