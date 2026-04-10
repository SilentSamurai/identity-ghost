import {Component, OnInit, ViewChild} from '@angular/core';
import {NgbModal} from '@ng-bootstrap/ng-bootstrap';
import {CreateTenantComponent} from './dialogs/create-tenant.component';
import {UpdateTenantComponent} from './dialogs/update-tenant.component';
import {TenantService} from '../../_services/tenant.service';
import {AdminTenantService} from '../../_services/admin-tenant.service';
import {SessionService} from '../../_services/session.service';
import {AppTableComponent} from '../../component/table/app-table.component';
import {AuthDefaultService} from '../../_services/auth.default.service';
import {ConfirmationService} from '../../component/dialogs/confirmation.service';
import {MessageService} from 'primeng/api';
import {Actions, PermissionService, Subjects,} from '../../_services/permission.service';
import {Filter} from '../../component/model/Filters';
import {DataSource} from "../../component/model/DataSource";

@Component({
    selector: 'app-TN01A',
    template: `
        <app-page-view>
            <app-page-view-header>
                <div class="">
                    <app-fb (onFilter)="onFilter($event)">
                        <app-fb-col label="Tenant Id" name="id"></app-fb-col>
                        <app-fb-col label="Name" name="name"></app-fb-col>
                        <app-fb-col label="Domain" name="domain"></app-fb-col>
                    </app-fb>
                    <div class="d-flex justify-content-between mt-2">
                        <div></div>
                        <button
                            (click)="openCreateModal()"
                            [disabled]="!('create' | ablePure: 'Tenant')"
                            class="btn btn-outline-success btn-sm"
                            id="CREATE_TENANT_DIALOG_BTN"
                            type="button"
                        >
                            <i class="fa fa-solid fa-plus me-2"></i> Create
                            Tenant
                        </button>
                    </div>
                </div>
            </app-page-view-header>

            <app-page-view-body>
                <app-table
                    title="Tenant List"
                    multi="true"
                    scrollHeight="75vh"
                    [dataSource]="dataSource"
                >
                    <app-table-col label="Domain" name="domain"></app-table-col>
                    <app-table-col label="Name" name="name"></app-table-col>
                    <app-table-col label="Active Keys" name="activeKeyCount"></app-table-col>
                    <app-table-col>
                        <th style="max-width: 100px">Action</th>
                    </app-table-col>

                    <ng-template #table_body let-tenant>
                        <td>
                            <a
                                [routerLink]="['/admin/TN02/', tenant.id]"
                                href="javascript:void(0)"
                            >{{ tenant.domain }}</a
                            >
                        </td>
                        <td>{{ tenant.name }}</td>
                        <td>{{ activeKeyCountMap.get(tenant.id) ?? 0 }}</td>
                        <td class="" style="max-width: 100px">
                            <button
                                (click)="openUpdateModal(tenant)"
                                [disabled]="!this.isTenantAdmin"
                                class="btn btn-sm btn-primary me-2"
                                type="button"
                            >
                                <i class="fa fa-edit"></i>
                            </button>
                            <button
                                (click)="openDeleteModal(tenant)"
                                [disabled]="!this.deleteAllowed"
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
    styles: [''],
})
export class TN01AComponent implements OnInit {
    @ViewChild(AppTableComponent)
    table!: AppTableComponent;

    tenants: any = [];
    creationAllowed = false;
    isTenantAdmin = false;
    deleteAllowed = false;
    dataSource: DataSource<any>;
    activeKeyCountMap: Map<string, number> = new Map();

    constructor(
        private tokenStorageService: SessionService,
        private tenantService: TenantService,
        private adminTenantService: AdminTenantService,
        private authDefaultService: AuthDefaultService,
        private confirmationService: ConfirmationService,
        private messageService: MessageService,
        private permissionService: PermissionService,
        private modalService: NgbModal,
    ) {
        this.dataSource = this.tenantService.createDataModel();
    }

    async ngOnInit() {
        this.authDefaultService.setTitle('TN01: Manage Tenants');

        if (
            this.permissionService.isAuthorized(Actions.Create, Subjects.TENANT)
        ) {
            this.creationAllowed = true;
        }
        if (this.tokenStorageService.isTenantAdmin()) {
            this.isTenantAdmin = true;
        }

        // Check for delete privileges
        // (Requires that `Actions.Delete` is defined or recognized in your application)
        if (
            this.permissionService.isAuthorized(Actions.Delete, Subjects.TENANT)
        ) {
            this.deleteAllowed = true;
        }

        await this.refreshData();

        try {
            const tenants: any[] = await this.adminTenantService.getAllTenants();
            this.activeKeyCountMap = new Map(
                tenants.map(t => [t.id, t.activeKeyCount ?? 0])
            );
        } catch (e) {
            // silently fail — column will show 0
        }
    }

    async refreshData() {
        // Forces a fresh load from page 0 with no filters
        // await this.dataSource.apply({ pageNo: 0, append: false });
    }

    async openCreateModal() {
        const modalRef = this.modalService.open(CreateTenantComponent);
        const tenant = await modalRef.result;
        console.log('returned tenant', tenant);
        await this.refreshData();
    }

    async openUpdateModal(tenant: any) {
        const modalRef = this.modalService.open(UpdateTenantComponent);
        modalRef.componentInstance.tenant = tenant;
        const editedTenant = await modalRef.result;
        console.log(editedTenant);
        await this.refreshData();
    }

    async openDeleteModal(tenant: any) {
        const deletedTenant = await this.confirmationService.confirm({
            message: `Are you sure you want to delete <b> ${tenant.domain} </b> ?`,
            header: 'Confirmation',
            icon: 'pi pi-info-circle',
            accept: async () => {
                try {
                    let deletedTenant = await this.adminTenantService.deleteTenant(
                        tenant.id,
                    );
                    this.messageService.add({
                        severity: 'success',
                        summary: 'Success',
                        detail: 'Tenant Deleted',
                    });
                    return deletedTenant;
                } catch (e) {
                    this.messageService.add({
                        severity: 'error',
                        summary: 'Error',
                        detail: 'Tenant Deletion Failed',
                    });
                }
                return null;
            },
        });
        console.log(deletedTenant);
        await this.refreshData();
    }

    onFilter(event: Filter[]) {
        this.table.filter(event);
    }
}
