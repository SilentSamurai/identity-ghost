import {Component, OnInit, ViewChild} from '@angular/core';
import {ClientService, Client} from '../../_services/client.service';
import {AppTableComponent} from '../../component/table/app-table.component';
import {Filter} from '../../component/model/Filters';
import {AuthDefaultService} from '../../_services/auth.default.service';
import {ConfirmationService} from '../../component/dialogs/confirmation.service';
import {MessageService} from 'primeng/api';
import {ModalService} from '../../component/dialogs/modal.service';
import {CreateClientAdminComponent} from './dialogs/create-client-admin.component';
import {SecretDisplayAdminComponent} from './dialogs/secret-display-admin.component';
import {DataSource} from '../../component/model/DataSource';
import {RestApiModel} from '../../component/model/RestApiModel';
import {HttpClient} from '@angular/common/http';
import {query} from '../../component/model/Query';

@Component({
    selector: 'app-CL01A',
    template: `
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
                    <app-table-col label="Owner Tenant" name="tenant.name"></app-table-col>
                    <app-table-col label="Grant Types" name="grantTypes"></app-table-col>
                    <app-table-col label="Created At" name="createdAt"></app-table-col>
                    <app-table-col>
                        <th style="max-width: 100px">Actions</th>
                    </app-table-col>

                    <ng-template #table_body let-client>
                        <td>
                            <a [routerLink]="['/admin/CL02', client.clientId]"
                               href="javascript:void(0)">{{ client.name }}</a>
                        </td>
                        <td>{{ client.clientId }}</td>
                        <td>
                            <span *ngIf="client.isPublic" class="badge bg-info">Public</span>
                            <span *ngIf="!client.isPublic" class="badge bg-secondary">Confidential</span>
                        </td>
                        <td>{{ client.tenant?.name }}</td>
                        <td>{{ client.grantTypes }}</td>
                        <td>{{ client.createdAt | date:'medium' }}</td>
                        <td style="max-width: 100px">
                            <button
                                *ngIf="!client.isPublic"
                                (click)="onRotateSecret(client)"
                                class="btn btn-sm btn-primary me-2"
                                type="button"
                            >
                                <i class="fa fa-refresh"></i>
                            </button>
                            <button
                                (click)="openDeleteModal(client)"
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
export class CL01AComponent implements OnInit {
    @ViewChild(AppTableComponent)
    table!: AppTableComponent;

    dataSource: DataSource<any>;

    constructor(
        private clientService: ClientService,
        private authDefaultService: AuthDefaultService,
        private modalService: ModalService,
        private confirmationService: ConfirmationService,
        private messageService: MessageService,
        private http: HttpClient,
    ) {
        this.dataSource = new RestApiModel(
            this.http,
            '/api/search/Clients',
            ['id'],
            query({expand: ['tenant']}),
        );
    }

    async ngOnInit() {
        this.authDefaultService.setTitle('CL01: Manage Clients');
    }

    async refreshData() {
        this.dataSource.refresh();
    }

    onFilter(event: Filter[]) {
        this.table.filter(event);
    }

    async openCreateModal() {
        const result = await this.modalService.open<{ client: Client; clientSecret: string | null }>(
            CreateClientAdminComponent,
            {initData: {}}
        );
        if (result.is_ok()) {
            const data = result.data;
            if (data?.clientSecret) {
                await this.modalService.open(SecretDisplayAdminComponent, {
                    initData: {clientSecret: data.clientSecret}
                });
            }
            await this.refreshData();
        }
    }

    async onRotateSecret(client: Client) {
        const rotated = await this.confirmationService.confirm({
            message: `Are you sure you want to rotate the secret for <b>${client.name}</b>?`,
            header: 'Confirmation',
            icon: 'pi pi-info-circle',
            accept: async () => {
                try {
                    const response = await this.clientService.rotateSecret(client.clientId);
                    this.messageService.add({
                        severity: 'success',
                        summary: 'Success',
                        detail: 'Secret Rotated'
                    });
                    return response;
                } catch (e) {
                    this.messageService.add({
                        severity: 'error',
                        summary: 'Error',
                        detail: 'Failed to rotate client secret'
                    });
                }
                return null;
            },
        });
        if (rotated) {
            await this.modalService.open(SecretDisplayAdminComponent, {
                initData: {clientSecret: rotated.clientSecret}
            });
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
