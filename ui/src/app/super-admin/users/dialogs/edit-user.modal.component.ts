import {Component, EventEmitter, Input, OnInit, Output} from '@angular/core';
import {UserService} from '../../../_services/user.service';
import {NgbActiveModal} from '@ng-bootstrap/ng-bootstrap';
import {lastValueFrom} from 'rxjs';
import {MessageService} from 'primeng/api';

@Component({
    selector: 'create-user-modal',
    template: `
        <app-standard-dialog title="Update User">
            <app-dialog-tab>
                <form
                    #editUserForm="ngForm"
                    (ngSubmit)="editUserForm.form.valid && onSubmit()"
                    name="editUserForm"
                    novalidate
                >
                    <div class="mb-3 form-group">
                        <label class="form-label" for="edit.user.name"
                        >Name</label
                        >
                        <input
                            #name="ngModel"
                            [(ngModel)]="form.name"
                            class="form-control"
                            id="edit.user.name"
                            name="name"
                            required
                            type="text"
                        />
                        <div
                            *ngIf="name.errors && editUserForm.submitted"
                            class="alert alert-danger"
                            role="alert"
                        >
                            Name is required!
                        </div>
                    </div>
                    <div class="mb-3 form-group">
                        <label class="form-label" for="edit.user.email"
                        >Email address</label
                        >
                        <input
                            #email="ngModel"
                            [(ngModel)]="form.email"
                            class="form-control"
                            id="edit.user.email"
                            name="email"
                            required
                            type="email"
                        />
                        <div
                            *ngIf="email.errors && editUserForm.submitted"
                            class="alert alert-danger"
                            role="alert"
                        >
                            Email is required!
                        </div>
                    </div>
                </form>
            </app-dialog-tab>
            <app-dialog-footer>
                <button
                    class="btn btn-primary"
                    type="submit"
                    (click)="editUserForm.onSubmit(krishna)"
                >
                    Update
                </button>
            </app-dialog-footer>
        </app-standard-dialog>
    `,
    styles: [''],
})
export class EditUserModalComponent implements OnInit {
    @Input() user: any;
    @Output() passEntry: EventEmitter<any> = new EventEmitter();
    form: any;
    krishna: any;

    constructor(
        private userService: UserService,
        private messageService: MessageService,
        public activeModal: NgbActiveModal,
    ) {
    }

    ngOnInit() {
        this.form = {
            name: this.user.name,
            email: this.user.email,
        };
        console.log(this.user);
    }

    async onSubmit() {
        try {
            let editedUser: any = this.userService.editUser(
                this.user.id,
                this.user.name === this.form.name ? null : this.form.name,
                this.user.email === this.form.email ? null : this.form.email,
            );
            editedUser = await lastValueFrom(editedUser);
            this.messageService.add({
                severity: 'success',
                summary: 'Success',
                detail: 'User Updated',
            });
            this.passEntry.emit(editedUser);
            this.activeModal.close(editedUser);
        } catch (e: any) {
            console.error(e);
            this.messageService.add({
                severity: 'error',
                summary: 'Error',
                detail: e.error.message,
            });
        }
    }
}
