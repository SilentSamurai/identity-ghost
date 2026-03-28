import {Component, OnInit, ViewChild} from '@angular/core';
import {UserService} from '../../_services/user.service';
import {NgbModal} from '@ng-bootstrap/ng-bootstrap';
import {AppTableComponent,} from '../../component/table/app-table.component';

import {AuthDefaultService} from '../../_services/auth.default.service';
import {ActivatedRoute, Router} from '@angular/router';
import {GroupService} from '../../_services/group.service';
import {CreateGroupComponent} from './dialogs/create-group.component';
import {ConfirmationService} from '../../component/dialogs/confirmation.service';
import {MessageService} from 'primeng/api';
import {UpdateGroupComponent} from './dialogs/update-group.component';
import {DataSource} from '../../component/model/DataSource';
import {Filter} from '../../component/model/Filters';

@Component({
    selector: 'app-GP01A',
    template: `
        <app-page-view>
            <app-page-view-header>
                <app-fb (onFilter)="onFilter($event)">
                    <app-fb-col label="Name" name="name"></app-fb-col>
                    <app-fb-col label="Tenant Id" name="tenantId"></app-fb-col>
                </app-fb>
                <div class="d-flex justify-content-between">
                    <span class="h4"></span>
                    <button
                        (click)="openCreateModal()"
                        class="btn btn-outline-success btn-sm"
                        type="button"
                    >
                        <i class="fa fa-solid fa-plus me-2"></i>Create Group
                    </button>
                </div>
            </app-page-view-header>
            <app-page-view-body>
                <app-table
                    title="Groups"
                    [dataSource]="groupsDM"
                    multi="true"
                    scrollHeight="75vh"
                >
                    <app-table-col label="Name" name="name"></app-table-col>
                    <app-table-col
                        label="Tenant"
                        name="tenantId"
                    ></app-table-col>
                    <app-table-col
                        label="Create At"
                        name="createdAt"
                    ></app-table-col>
                    <app-table-col label="Action" name="action"></app-table-col>

                    <ng-template #table_body let-group>
                        <td>
                            <a
                                [routerLink]="['/admin/GP02/', group.id]"
                                href="javascript:void(0)"
                            >{{ group.name }}</a
                            >
                        </td>
                        <td>
                            <a
                                [routerLink]="['/admin/TN02/', group.tenantId]"
                                href="javascript:void(0)"
                            >{{ group.tenantId }}</a
                            >
                        </td>
                        <td>
                            <span class="p-column-title">Created At</span
                            >{{ group.createdAt | date }}
                        </td>
                        <td class="d-flex ">
                            <button
                                (click)="openUpdateModal(group)"
                                class="btn "
                                type="button"
                            >
                                <i class="fa fa-edit"></i>
                            </button>
                            <button
                                (click)="openDeleteModal(group)"
                                class="btn "
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
export class GP01AComponent implements OnInit {
    @ViewChild(AppTableComponent)
    table!: AppTableComponent;

    tenantId: string = '';

    groups: any = [];
    groupsDM: DataSource<any>;

    constructor(
        private userService: UserService,
        private authDefaultService: AuthDefaultService,
        private groupService: GroupService,
        private route: ActivatedRoute,
        private router: Router,
        private messageService: MessageService,
        private confirmationService: ConfirmationService,
        private modalService: NgbModal,
    ) {
        this.groupsDM = this.groupService.createDataModel([]);
    }

    async ngOnInit(): Promise<void> {
        this.authDefaultService.setTitle('GP01: Manage Groups');
    }

    async openCreateModal() {
        const modalRef = this.modalService.open(CreateGroupComponent);
        const user = await modalRef.result;
        console.log(user);
        this.ngOnInit();
    }

    async openUpdateModal(group: any) {
        const modalRef = this.modalService.open(UpdateGroupComponent);
        modalRef.componentInstance.groupId = group.id;
        modalRef.componentInstance.form.name = group.name;
        group = await modalRef.result;
        console.log(group);
        this.ngOnInit();
    }

    async openDeleteModal(group: any) {
        await this.confirmationService.confirm({
            message: 'Are you sure you want to continue ?',
            accept: async () => {
                await this.groupService.deleteGroup(group.id);
                this.messageService.add({
                    severity: 'success',
                    summary: 'Successful',
                    detail: 'Group removed',
                });
            },
            reject: async () => {
            },
        });
        this.ngOnInit();
    }

    onFilter(filters: Filter[]) {
        this.table.filter(filters);
    }
}
