import {Component, OnInit} from '@angular/core';
import {UserService} from '../../_services/user.service';
import {NgbModal} from '@ng-bootstrap/ng-bootstrap';
import {ActivatedRoute, Router} from '@angular/router';
import {MessageService} from 'primeng/api';
import {AuthDefaultService} from '../../_services/auth.default.service';
import {GroupService} from '../../_services/group.service';
import {DataSource} from '../../component/model/DataSource';

@Component({
    selector: 'app-GP02A-sel',
    template: `
        <div class="container-fluid">
            <div class="row">
                <div class="h4 py-2">Manage Roles</div>
                <div class="col-4">
                    <form class="form-group g-3">
                        <label
                            class="col-3 col-form-label control-label-required"
                            for="Group"
                        >
                            Group
                        </label>
                        <app-value-help-input
                            [dataSource]="groupsDM"
                            [(selection)]="selectedGroup"
                            class="col-3"
                            labelField="name"
                            multi="false"
                            name="Group"
                        >
                            <app-fb-col name="name" label="Name"></app-fb-col>
                            <app-fb-col
                                name="tenant/name"
                                label="Tenant"
                            ></app-fb-col>

                            <app-vh-col name="name" label="Name"></app-vh-col>
                            <app-vh-col
                                name="tenant"
                                label="Tenant"
                            ></app-vh-col>

                            <ng-template #vh_body let-row>
                                <td>{{ row.name }}</td>
                                <td>
                                    {{ row.tenant.name }}
                                </td>
                            </ng-template>
                        </app-value-help-input>

                        <div
                            class=" d-grid gap-2 py-3 d-flex justify-content-end "
                        >
                            <button
                                (click)="continue()"
                                class="btn btn-primary btn-block btn-sm"
                                id="GP02-SEL-CONT-BTN"
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
export class GP02ASelectionComponent implements OnInit {
    groups: any[] = [];
    groupsDM!: DataSource<any>;
    selectedGroup: any[] = [];

    constructor(
        private userService: UserService,
        private groupService: GroupService,
        private route: ActivatedRoute,
        private router: Router,
        private authDefaultService: AuthDefaultService,
        private messageService: MessageService,
        private modalService: NgbModal,
    ) {
    }

    async ngOnInit(): Promise<void> {
        this.authDefaultService.setTitle('GP02: Select Group');
        this.groupsDM = this.groupService.createDataModel([]);
    }

    async continue() {
        console.log({
            group: this.selectedGroup,
        });
        if (this.selectedGroup.length > 0) {
            await this.router.navigate(['/admin/GP02', this.selectedGroup[0].id]);
        } else {
            this.messageService.add({
                severity: 'error',
                summary: 'Error',
                detail: 'Select the group',
            });
        }
    }
}
