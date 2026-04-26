import {Component, OnInit} from '@angular/core';
import {NgbActiveModal} from '@ng-bootstrap/ng-bootstrap';
import {MessageService} from 'primeng/api';
import {GroupService} from '../../../_services/group.service';

@Component({
    selector: 'app-create-group',
    template: `
        <app-standard-dialog title="Create Group">
            <app-dialog-tab>
                <form
                    #createGroupForm="ngForm"
                    (ngSubmit)="createGroupForm.form.valid && onSubmit()"
                    name="createGroupForm"
                    novalidate
                >
                    <div class="mb-3 form-group">
                        <label class="form-label" for="create.group.name">Name</label>
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
                            *ngIf="name.errors && createGroupForm.submitted"
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
                    (click)="createGroupForm.onSubmit(submitTrigger)"
                >
                    Create
                </button>
            </app-dialog-footer>
        </app-standard-dialog>
    `,
    styles: [''],
})
export class CreateGroupComponent implements OnInit {
    tenantId: string = '';
    form = {name: ''};
    submitTrigger: any;

    constructor(
        private groupService: GroupService,
        private messageService: MessageService,
        public activeModal: NgbActiveModal,
    ) {}

    ngOnInit(): void {}

    async onSubmit() {
        try {
            const createdGroup = await this.groupService.createGroup(this.form.name, this.tenantId);
            this.messageService.add({severity: 'success', summary: 'Success', detail: 'Group Created'});
            this.activeModal.close(createdGroup);
        } catch (e) {
            this.messageService.add({severity: 'error', summary: 'Error', detail: 'Group Creation Failed'});
        }
    }
}
