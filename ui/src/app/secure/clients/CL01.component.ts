import {Component, OnInit, ViewChild} from '@angular/core';
import {ActivatedRoute} from '@angular/router';
import {ClientService, Client} from '../../_services/client.service';
import {AppTableComponent} from '../../component/table/app-table.component';
import {Filter} from '../../component/model/Filters';
import {StaticSource} from '../../component/model/StaticSource';
import {AuthDefaultService} from '../../_services/auth.default.service';
import {SessionService} from '../../_services/session.service';
import {ConfirmationService} from '../../component/dialogs/confirmation.service';
import {MessageService} from 'primeng/api';
import {ModalService} from '../../component/dialogs/modal.service';
import {CreateClientComponent} from './dialogs/create-client.component';
import {SecretDisplayComponent} from './dialogs/secret-display.component';

@Component({
    selector: 'app-CL01',
    template: `
        <secure-nav-bar></secure-nav-bar>
        <app-page-view>
            <app-page-view-header>
                <div class="">
                    <app-fb (onFilter)="onFilter($event)">
                        <app-fb-col label="Name" name="name"></app-fb-col>
                        <app-fb-col label="Client ID" name="clientId"></app-fb-col>
                    </app-fb>
                    <div class="d-flex justify-content-between mt-2">
                        <div></div>
                        <button
                            (click)="openCreateModal()"
                            [disabled]="!isTenantAdmin"
                            class="btn btn-outline-success btn-sm"
                            type="button"
                        >
                            <i class="fa fa-solid fa-plus me-2"></i> Create Client
                        </button>
                    </div>
                </div>
            </app-page-view-header>

            <app-page-view-body>
                <app-table
                    title="Clients List"
                    multi="true"
                    scrollHeight="75vh"
                    [dataSource]="dataSource"
                >
                    <app-table-col label="Name" name="name"></app-table-col>
                    <app-table-col label="Client ID" name="clientId"></app-table-col>
                    <app-table-col label="Client Type" name="isPublic"></app-table-col>
                    <app-table-col label="Grant Types" name="grantTypes"></app-table-col>
                    <app-table-col label="Created At" name="createdAt"></app-table-col>
                    <app-table-col>
                        <th style="max-width: 100px">Actions</th>
                    </app-table-col>

                    <ng-template #table_body let-client>
                        <td>
                            <a [routerLink]="['/CL02', tenantId, client.clientId]"
                               href="javascript:void(0)">{{ client.name }}</a>
                        </td>
                        <td>{{ client.clientId }}</td>
                        <td>
                            <span *ngIf="client.isPublic" class="badge bg-info">Public</span>
                            <span *ngIf="!client.isPublic" class="badge bg-secondary">Confidential</span>
                        </td>
                        <td>{{ client.grantTypes }}</td>
                        <td>{{ client.createdAt | date:'medium' }}</td>
                        <td style="max-width: 100px">
                            <button
                                (click)="openDeleteModal(client)"
                                [disabled]="!isTenantAdmin"
                                class="btn btn-sm btn-danger"
                                type="button"
                            >
                                <i class="fa fa-solid fa-trash"></i>
                            </button>
                        </td>
                    </ng-template>
                </app-table>
            </app-page-view-body>
        </app-page-view>
    `,
    styles: ['']
})
export class CL01Component implements OnInit {
    @ViewChild(AppTableComponent)
    table!: AppTableComponent;

    dataSource: StaticSource<Client>;
    tenantId: string = '';
    isTenantAdmin = false;

    constructor(
        private clientService: ClientService,
        private authDefaultService: AuthDefaultService,
        private sessionService: SessionService,
        private modalService: ModalService,
        private confirmationService: ConfirmationService,
        private messageService: MessageService,
        private actRoute: ActivatedRoute,
    ) {
        this.dataSource = new StaticSource<Client>(['id']);
    }

    async ngOnInit() {
        this.tenantId = this.actRoute.snapshot.params['tenantId'];
        this.isTenantAdmin = this.sessionService.isTenantAdmin();
        this.authDefaultService.setTitle('CL01: Manage Clients');
        await this.refreshData();
    }

    async refreshData() {
        const clients = await this.clientService.getClientsByTenant();
        this.dataSource.setData(Array.isArray(clients) ? clients : []);
    }

    onFilter(event: Filter[]) {
        this.table.filter(event);
    }

    async openCreateModal() {
        if (!this.tenantId) {
            console.error('User tenant ID is not available');
            alert('Error: Tenant information is not available. Please log in again.');
            return;
        }
        const result = await this.modalService.open<{ client: Client; clientSecret: string | null }>(CreateClientComponent, {
            initData: {
                tenantId: this.tenantId
            }
        });
        if (result.is_ok()) {
            const data = result.data;
            if (data?.clientSecret) {
                await this.modalService.open(SecretDisplayComponent, {
                    initData: {
                        clientSecret: data.clientSecret
                    }
                });
            }
            await this.refreshData();
        }
    }

    async openDeleteModal(client: Client) {
        const deletedClient = await this.confirmationService.confirm({
            message: `Are you sure you want to delete <b>${client.name}</b>?`,
            header: 'Confirmation',
            icon: 'pi pi-info-circle',
            accept: async () => {
                try {
                    await this.clientService.deleteClient(client.clientId);
                    this.messageService.add({
                        severity: 'success',
                        summary: 'Success',
                        detail: 'Client Deleted'
                    });
                    return client;
                } catch (e) {
                    this.messageService.add({
                        severity: 'error',
                        summary: 'Error',
                        detail: 'Client Deletion Failed'
                    });
                }
                return null;
            },
        });
        if (deletedClient) {
            await this.refreshData();
        }
    }
}
