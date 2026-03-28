import {Component, Input, OnInit} from '@angular/core';
import {NgbActiveModal} from '@ng-bootstrap/ng-bootstrap';
import {ClientService, Client, UpdateClientRequest} from '../../../_services/client.service';

@Component({
    selector: 'app-edit-client-admin',
    template: `
        <app-standard-dialog title="Edit Client" subtitle="Update client configuration">
            <app-dialog-tab name="Client Details">
                <form (ngSubmit)="onSubmit()">
                    <div class="alert alert-danger" *ngIf="errorMessage">
                        {{ errorMessage }}
                    </div>
                    <div class="mb-3">
                        <label for="name" class="form-label">Name</label>
                        <input type="text" class="form-control" id="name" [(ngModel)]="form.name" name="name" required>
                    </div>
                    <div class="mb-3">
                        <label for="redirectUris" class="form-label">Redirect URIs</label>
                        <textarea class="form-control" id="redirectUris" [(ngModel)]="form.redirectUris" name="redirectUris"
                                  rows="3" placeholder="Comma-separated URIs"></textarea>
                    </div>
                    <div class="mb-3 form-check">
                        <input type="checkbox" class="form-check-input" id="requirePkce" [(ngModel)]="form.requirePkce" name="requirePkce">
                        <label class="form-check-label" for="requirePkce">Require PKCE</label>
                    </div>
                    <div class="mb-3 form-check">
                        <input type="checkbox" class="form-check-input" id="allowPasswordGrant" [(ngModel)]="form.allowPasswordGrant" name="allowPasswordGrant">
                        <label class="form-check-label" for="allowPasswordGrant">Allow Password Grant</label>
                    </div>
                    <div class="mb-3 form-check">
                        <input type="checkbox" class="form-check-input" id="allowRefreshToken" [(ngModel)]="form.allowRefreshToken" name="allowRefreshToken">
                        <label class="form-check-label" for="allowRefreshToken">Allow Refresh Token</label>
                    </div>
                </form>
            </app-dialog-tab>

            <app-dialog-footer>
                <button type="button" class="btn btn-primary" (click)="onSubmit()">Update</button>
                <button type="button" class="btn btn-secondary" (click)="activeModal.dismiss()">Cancel</button>
            </app-dialog-footer>
        </app-standard-dialog>
    `
})
export class EditClientAdminComponent implements OnInit {
    @Input() client!: Client;

    form = {
        name: '',
        redirectUris: '',
        requirePkce: false,
        allowPasswordGrant: false,
        allowRefreshToken: true,
    };
    errorMessage = '';

    constructor(
        public activeModal: NgbActiveModal,
        private clientService: ClientService,
    ) {
    }

    ngOnInit() {
        this.form = {
            name: this.client.name || '',
            redirectUris: this.client.redirectUris?.join(', ') || '',
            requirePkce: this.client.requirePkce,
            allowPasswordGrant: this.client.allowPasswordGrant,
            allowRefreshToken: this.client.allowRefreshToken,
        };
    }

    async onSubmit() {
        try {
            this.errorMessage = '';
            if (!this.form.name.trim()) {
                this.errorMessage = 'Client name is required.';
                return;
            }

            const body: UpdateClientRequest = {};
            if (this.form.name.trim() !== this.client.name) body.name = this.form.name.trim();
            const parsedUris = this.form.redirectUris.split(',').map(u => u.trim()).filter(u => u.length > 0);
            const originalUris = (this.client.redirectUris || []).join(', ');
            if (this.form.redirectUris.trim() !== originalUris) body.redirectUris = parsedUris;
            if (this.form.requirePkce !== this.client.requirePkce) body.requirePkce = this.form.requirePkce;
            if (this.form.allowPasswordGrant !== this.client.allowPasswordGrant) body.allowPasswordGrant = this.form.allowPasswordGrant;
            if (this.form.allowRefreshToken !== this.client.allowRefreshToken) body.allowRefreshToken = this.form.allowRefreshToken;

            if (Object.keys(body).length === 0) {
                this.activeModal.close(this.client);
                return;
            }

            const updated = await this.clientService.updateClient(this.client.clientId, body);
            this.activeModal.close(updated);
        } catch (error: any) {
            this.errorMessage = error?.error?.message || error?.message || 'Failed to update client.';
        }
    }
}
