import {Component, OnInit} from '@angular/core';
import {UserService} from '../../_services/user.service';
import {NgbModal} from '@ng-bootstrap/ng-bootstrap';
import {ActivatedRoute, Router} from '@angular/router';
import {MessageService} from 'primeng/api';
import {AuthDefaultService} from '../../_services/auth.default.service';
import {DataSource} from "../../component/model/DataSource";

@Component({
    selector: 'app-UR02A-sel',
    template: `
        <div class="container-fluid">
            <div class="row">
                <div class="h4 py-2">Manage Roles</div>
                <div class="col-4">
                    <form class="form-group g-3">
                        <label class="col-3 col-form-label" for="Email">
                            Email
                        </label>
                        <app-value-help-input
                            [dataSource]="usersDM"
                            [(selection)]="selectedUser"
                            class="col-3"
                            labelField="email"
                            multi="false"
                            name="Email"
                        >
                            <app-fb-col name="email" label="Email"></app-fb-col>
                            <app-fb-col name="name" label="Name"></app-fb-col>
                            <app-fb-col
                                name="tenants/domain"
                                label="Domain"
                            ></app-fb-col>

                            <app-vh-col name="name" label="Name"></app-vh-col>
                            <app-vh-col name="email" label="Email"></app-vh-col>

                            <ng-template #vh_body let-row>
                                <td>{{ row.name }} {{ row.surname }}</td>
                                <td>
                                    {{ row.email }}
                                </td>
                            </ng-template>
                        </app-value-help-input>

                        <div
                            class=" d-grid gap-2 py-3 d-flex justify-content-end "
                        >
                            <button
                                (click)="continue()"
                                class="btn btn-primary btn-block btn-sm"
                                id="UR02-SEL-CONT-BTN"
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
export class UR02ASelectionComponent implements OnInit {
    email: string | null = '';
    users: any[] = [];
    selectedUser: any[] = [];
    usersDM!: DataSource<any>;

    constructor(
        private userService: UserService,
        private route: ActivatedRoute,
        private router: Router,
        private authDefaultService: AuthDefaultService,
        private messageService: MessageService,
        private modalService: NgbModal,
    ) {
    }

    async ngOnInit(): Promise<void> {
        this.authDefaultService.setTitle('UR02: Select User');
        this.usersDM = this.userService.createDataModel();
    }

    async continue() {
        console.log({
            users: this.selectedUser,
        });
        if (this.selectedUser.length > 0) {
            await this.router.navigate(['/admin/UR02', this.selectedUser[0].id]);
        }
    }
}
