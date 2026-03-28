import {Component, OnInit, ViewChild} from '@angular/core';
import {AppService} from '../../_services/app.service';
import {AppTableComponent} from '../../component/table/app-table.component';
import {Filter} from '../../component/model/Filters';
import {DataSource} from '../../component/model/DataSource';
import {AuthDefaultService} from '../../_services/auth.default.service';
import {ConfirmationService} from '../../component/dialogs/confirmation.service';
import {MessageService} from 'primeng/api';
import {CreateAppAdminComponent} from './dialogs/create-app-admin.component';
import {UpdateAppComponent} from './dialogs/update-app.component';
import {ModalService} from "../../component/dialogs/modal.service";

@Component({
    selector: 'app-AP01A',
    template: `
        <app-page-view>
            <app-page-view-header>
                <div class="">
                    <app-fb (onFilter)="onFilter($event)">
                        <app-fb-col label="App Id" name="id"></app-fb-col>
                        <app-fb-col label="Name" name="name"></app-fb-col>
                        <app-fb-col label="App URL" name="appUrl"></app-fb-col>
                        <app-fb-col label="Owner Tenant" name="owner.name"></app-fb-col>
                    </app-fb>
                    <div class="d-flex justify-content-between mt-2">
                        <div></div>
                        <button
                            (click)="openCreateModal()"
                            class="btn btn-outline-success btn-sm"
                            type="button"
                        >
                            <i class="fa fa-solid fa-plus me-2"></i> Create App
                        </button>
                    </div>
                </div>
            </app-page-view-header>

            <app-page-view-body>
                <app-table
                    title="Applications List"
                    multi="true"
                    scrollHeight="75vh"
                    [dataSource]="dataSource"
                >
                    <app-table-col label="Name" name="name"></app-table-col>
                    <app-table-col label="Description" name="description"></app-table-col>
                    <app-table-col label="App URL" name="appUrl"></app-table-col>
                    <app-table-col label="Owner Tenant" name="owner.name"></app-table-col>
                    <app-table-col label="Created At" name="createdAt"></app-table-col>
                    <app-table-col>
                        <th style="max-width: 100px">Actions</th>
                    </app-table-col>

                    <ng-template #table_body let-app>
                        <td>{{ app.name }}</td>
                        <td>{{ app.description || '-' }}</td>
                        <td>{{ app.appUrl }}</td>
                        <td>{{ app.owner?.name }}</td>
                        <td>{{ app.createdAt | date:'medium' }}</td>
                        <td class="" style="max-width: 100px">
                            <button
                                (click)="openUpdateModal(app)"
                                class="btn btn-sm btn-primary me-2"
                                type="button"
                            >
                                <i class="fa fa-edit"></i>
                            </button>
                            <button
                                (click)="openDeleteModal(app)"
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
export class AP01AComponent implements OnInit {
    @ViewChild(AppTableComponent)
    table!: AppTableComponent;

    dataSource: DataSource<any>;

    constructor(
        private appService: AppService,
        private authDefaultService: AuthDefaultService,
        private modalService: ModalService,
        private confirmationService: ConfirmationService,
        private messageService: MessageService,
    ) {
        this.dataSource = this.appService.createDataModel();
    }

    async ngOnInit() {
        this.authDefaultService.setTitle('AP01: Manage Applications');
        await this.refreshData();
    }

    async refreshData() {
        this.dataSource.refresh();
    }

    onFilter(event: Filter[]) {
        this.table.filter(event);
    }

    async openCreateModal() {
        const result = await this.modalService.open(CreateAppAdminComponent, {initData: {}});
        if (result.is_ok()) {
            await this.refreshData();
        }
    }

    async openUpdateModal(app: any) {
        const result = await this.modalService.open(UpdateAppComponent, {
            initData: {
                app: app,
            }
        });
        if (result.is_ok()) {
            await this.refreshData();
        }
    }

    async openDeleteModal(app: any) {
        const deletedApp = await this.confirmationService.confirm({
            message: `Are you sure you want to delete <b>${app.name}</b>?`,
            header: 'Confirmation',
            icon: 'pi pi-info-circle',
            accept: async () => {
                try {
                    await this.appService.deleteApp(app.id);
                    this.messageService.add({
                        severity: 'success',
                        summary: 'Success',
                        detail: 'App Deleted'
                    });
                    return app;
                } catch (e) {
                    this.messageService.add({
                        severity: 'error',
                        summary: 'Error',
                        detail: 'App Deletion Failed'
                    });
                }
                return null;
            },
        });
        if (deletedApp) {
            await this.refreshData();
        }
    }
}
