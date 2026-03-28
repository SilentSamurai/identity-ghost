import {Component, OnInit} from '@angular/core';
import {ActivatedRoute, Router} from '@angular/router';
import {MessageService} from 'primeng/api';
import {ClientService, Client} from '../../_services/client.service';
import {AuthDefaultService} from '../../_services/auth.default.service';
import {SessionService} from '../../_services/session.service';
import {ConfirmationService} from '../../component/dialogs/confirmation.service';
import {ModalService} from '../../component/dialogs/modal.service';
import {SecretDisplayComponent} from './dialogs/secret-display.component';
import {EditClientComponent} from './dialogs/edit-client.component';

@Component({
    selector: 'app-CL02',
    template: `
        <secure-nav-bar></secure-nav-bar>
        <app-object-page [loading]="loading">
            <app-op-title>
                {{ client?.name }}
            </app-op-title>
            <app-op-subtitle>
                {{ client?.clientId }}
            </app-op-subtitle>
            <app-op-actions>
                <button
                    (click)="onEditClient()"
                    [disabled]="!isTenantAdmin"
                    id="EDIT_CLIENT_BTN"
                    class="btn btn-primary btn-sm"
                >
                    Edit
                </button>
                <button
                    *ngIf="client && !client.isPublic"
                    (click)="onRotateSecret()"
                    [disabled]="!isTenantAdmin"
                    id="ROTATE_SECRET_BTN"
                    class="btn btn-primary btn-sm ms-2"
                >
                    Rotate Secret
                </button>
                <button
                    (click)="onDeleteClient()"
                    [disabled]="!isTenantAdmin"
                    id="DELETE_CLIENT_BTN"
                    class="btn btn-danger btn-sm ms-2"
                >
                    Delete Client
                </button>
            </app-op-actions>
            <app-op-header>
                <div class="row" *ngIf="client">
                    <div class="col-lg-6">
                        <app-attribute label="Name">
                            {{ client.name }}
                        </app-attribute>
                        <app-attribute label="Client ID">
                            {{ client.clientId }}
                        </app-attribute>
                        <app-attribute label="Client Type">
                            <span *ngIf="client.isPublic" class="badge bg-info">Public</span>
                            <span *ngIf="!client.isPublic" class="badge bg-secondary">Confidential</span>
                        </app-attribute>
                        <app-attribute label="Redirect URIs">
                            {{ client.redirectUris.join(', ') }}
                        </app-attribute>
                        <app-attribute label="Allowed Scopes">
                            {{ client.allowedScopes }}
                        </app-attribute>
                        <app-attribute label="Grant Types">
                            {{ client.grantTypes }}
                        </app-attribute>
                    </div>
                    <div class="col-lg-6">
                        <app-attribute label="Response Types">
                            {{ client.responseTypes }}
                        </app-attribute>
                        <app-attribute label="Token Endpoint Auth Method">
                            {{ client.tokenEndpointAuthMethod }}
                        </app-attribute>
                        <app-attribute label="Require PKCE">
                            {{ client.requirePkce ? 'Yes' : 'No' }}
                        </app-attribute>
                        <app-attribute label="Allow Password Grant">
                            {{ client.allowPasswordGrant ? 'Yes' : 'No' }}
                        </app-attribute>
                        <app-attribute label="Allow Refresh Token">
                            {{ client.allowRefreshToken ? 'Yes' : 'No' }}
                        </app-attribute>
                    </div>
                </div>
            </app-op-header>
        </app-object-page>
    `,
    styles: [''],
})
export class CL02Component implements OnInit {
    loading: boolean = false;
    client: Client | null = null;
    tenantId: string = '';
    isTenantAdmin = false;

    constructor(
        private clientService: ClientService,
        private messageService: MessageService,
        private actRoute: ActivatedRoute,
        private router: Router,
        private confirmationService: ConfirmationService,
        private authDefaultService: AuthDefaultService,
        private sessionService: SessionService,
        private modalService: ModalService,
    ) {
    }

    async ngOnInit() {
        this.loading = true;
        try {
            this.tenantId = this.actRoute.snapshot.params['tenantId'];
            this.isTenantAdmin = this.sessionService.isTenantAdmin();
            const clientId = this.actRoute.snapshot.params['clientId'];
            this.client = await this.clientService.getClient(clientId);
            this.authDefaultService.setTitle('CL02: ' + this.client.name);
        } catch (e) {
            this.messageService.add({
                severity: 'error',
                summary: 'Error',
                detail: 'Failed to load client details',
            });
        } finally {
            this.loading = false;
        }
    }

    async onEditClient() {
        if (!this.client) return;
        const result = await this.modalService.open<Client>(EditClientComponent, {
            initData: {client: this.client},
        });
        if (result.is_ok() && result.data) {
            this.client = result.data;
        }
    }

    async onRotateSecret() {
        if (!this.client) return;
        const rotated = await this.confirmationService.confirm({
            message: `Are you sure you want to rotate the secret for <b>${this.client.name}</b>?`,
            header: 'Confirmation',
            icon: 'pi pi-info-circle',
            accept: async () => {
                try {
                    const response = await this.clientService.rotateSecret(this.client!.clientId);
                    return response;
                } catch (e) {
                    this.messageService.add({
                        severity: 'error',
                        summary: 'Error',
                        detail: 'Failed to rotate client secret',
                    });
                }
                return null;
            },
        });
        if (rotated) {
            await this.modalService.open(SecretDisplayComponent, {
                initData: {
                    clientSecret: rotated.clientSecret,
                }
            });
        }
    }

    async onDeleteClient() {
        if (!this.client) return;
        const deleted = await this.confirmationService.confirm({
            message: `Are you sure you want to delete <b>${this.client.name}</b>?`,
            header: 'Confirmation',
            icon: 'pi pi-info-circle',
            accept: async () => {
                try {
                    await this.clientService.deleteClient(this.client!.clientId);
                    this.messageService.add({
                        severity: 'success',
                        summary: 'Success',
                        detail: 'Client Deleted',
                    });
                    return true;
                } catch (e) {
                    this.messageService.add({
                        severity: 'error',
                        summary: 'Error',
                        detail: 'Client Deletion Failed',
                    });
                }
                return null;
            },
        });
        if (deleted) {
            await this.router.navigate(['/CL01', this.tenantId]);
        }
    }
}
