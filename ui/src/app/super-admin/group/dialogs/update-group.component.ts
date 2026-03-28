import {Component, EventEmitter, OnInit, Output} from '@angular/core';
import {NgbActiveModal} from '@ng-bootstrap/ng-bootstrap';
import {MessageService} from 'primeng/api';
import {GroupService} from '../../../_services/group.service';
import {TenantService} from '../../../_services/tenant.service';

@Component({
    selector: 'app-update-group',
    template: `
        <app-standard-dialog title="Update Group">
            <app-dialog-tab>
                <form
                    #updateGroupForm="ngForm"
                    (ngSubmit)="updateGroupForm.form.valid && onSubmit()"
                    name="createGroupForm"
                    novalidate
                >
                    <div class="mb-3 form-group">
                        <label class="form-label" for="create.group.name"
                        >Name</label
                        >
                        <input
                            #name="ngModel"
                            [(ngModel)]="form.name"
                            class="form-control"
                            id="create.group.name"
                            name="name"
                            required
                            type="text"
                        />
                        <div
                            *ngIf="name.errors && updateGroupForm.submitted"
                            class="alert alert-danger"
                            role="alert"
                        >
                            Name is required!
                        </div>
                    </div>
                </form>
            </app-dialog-tab>
            <app-dialog-footer>
                <button
                    class="btn btn-primary"
                    type="submit"
                    (click)="updateGroupForm.onSubmit(krishna)"
                >
                    Update
                </button>
            </app-dialog-footer>
        </app-standard-dialog>
    `,
    styles: [''],
})
export class UpdateGroupComponent implements OnInit {
    @Output() passEntry: EventEmitter<any> = new EventEmitter();

    form = {
        name: '',
    };
    groupId: string = '';
    krishna: any;

    constructor(
        private groupService: GroupService,
        private tenantService: TenantService,
        private messageService: MessageService,
        public activeModal: NgbActiveModal,
    ) {
    }

    ngOnInit(): void {
    }

    async onSubmit() {
        try {
            const updatedGroup = await this.groupService.updateGroup(
                this.groupId,
                this.form.name,
            );
            this.messageService.add({
                severity: 'success',
                summary: 'Success',
                detail: 'Group Updated',
            });
            this.passEntry.emit(updatedGroup);
            this.activeModal.close(updatedGroup);
        } catch (e) {
            console.error(e);
            this.messageService.add({
                severity: 'error',
                summary: 'Error',
                detail: 'Group Updation Failed',
            });
        }
    }
}
