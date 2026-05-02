import {Component, OnInit} from '@angular/core';
import {NgbModal} from '@ng-bootstrap/ng-bootstrap';
import {ActivatedRoute, Router} from '@angular/router';
import {MessageService} from 'primeng/api';
import {AuthDefaultService} from '../../_services/auth.default.service';
import {RoleService} from '../../_services/role.service';
import {DataSource} from "../../component/model/DataSource";

@Component({
    selector: 'app-RL02A-sel',
    template: `
        <div class="container-fluid">
            <div class="row">
                <div class="col-4">
                    <h5 class="my-2">Select Role</h5>
                    <form class="form-group g-3">
                        <label
                            class="col-3 col-form-label control-label-required"
                            for="Role"
                        >
                            Role:
                        </label>
                        <app-value-help-input
                            [dataSource]="rolesDM"
                            [(selection)]="selectedRole"
                            class="col-3"
                            labelField="name"
                            multi="false"
                            name="Role"
                        >
                            <app-fb-col name="name" label="Name"></app-fb-col>
                            <app-fb-col
                                name="tenant/domain"
                                label="Tenant Domain"
                            ></app-fb-col>

                            <app-vh-col
                                name="name"
                                label="Role Name"
                            ></app-vh-col>
                            <app-vh-col
                                name="tenant/domain"
                                label="Tenant Domain"
                            ></app-vh-col>
                            <app-vh-col
                                name="tenant/name"
                                label="Tenant Name"
                            ></app-vh-col>

                            <ng-template #vh_body let-row>
                                <td>{{ row.name }}</td>
                                <td>{{ row.tenant.domain }}</td>
                                <td>{{ row.tenant.name }}</td>
                            </ng-template>
                        </app-value-help-input>

                        <div
                            class=" d-grid gap-2 py-3 d-flex justify-content-end "
                        >
                            <button
                                (click)="continue()"
                                class="btn btn-primary btn-block btn-sm"
                            >
                                Continue
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    `,
    styles: [``],
})
export class RL02ASelectionComponent implements OnInit {
    roles = [];
    rolesDM: DataSource<any>;
    tenants: [] = [];
    selectedTenant: any[] = [];
    selectedRole: any[] = [];

    constructor(
        private roleService: RoleService,
        private route: ActivatedRoute,
        private router: Router,
        private authDefaultService: AuthDefaultService,
        private messageService: MessageService,
        private modalService: NgbModal,
    ) {
        this.rolesDM = this.roleService.createDataModel();
    }

    async ngOnInit(): Promise<void> {
        this.authDefaultService.setTitle('RL02: Select Role');
    }

    async continue() {
        console.log({
            roles: this.selectedRole,
        });
        if (this.selectedRole.length > 0) {
            await this.router.navigate([
                '/admin/RL02',
                this.selectedRole[0].tenant.id,
                this.selectedRole[0].id,
            ]);
        }
    }
}
