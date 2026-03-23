import {Component, OnInit} from '@angular/core';
import {NgbActiveModal} from '@ng-bootstrap/ng-bootstrap';
import {ClientService, CreateClientRequest} from '../../../_services/client.service';

@Component({
    selector: 'app-create-client',
    template: `
        <app-standard-dialog title="Create Client" subtitle="Register a new OAuth client for your tenant">
            <app-dialog-tab name="Client Details">
                <form (ngSubmit)="onSubmit()">
                    <div class="alert alert-danger" *ngIf="errorMessage">
                        {{ errorMessage }}
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
                <button type="button" class="btn btn-primary" (click)="onSubmit()">Create</button>
                <button type="button" class="btn btn-secondary" (click)="activeModal.close()">Cancel</button>
            </app-dialog-footer>
        </app-standard-dialog>
    `
})
export class CreateClientComponent implements OnInit {
    tenantId?: string = undefined;

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
        private clientService: ClientService
    ) {
    }

    ngOnInit() {
        console.log('CreateClientComponent initialized with tenantId:', this.tenantId);
    }

    async onSubmit() {
        try {
            this.errorMessage = '';

            if (!this.tenantId) {
                this.errorMessage = 'Error: Tenant ID is missing. Please try again.';
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
