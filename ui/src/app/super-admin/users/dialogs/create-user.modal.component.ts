import {Component, EventEmitter, OnInit, Output} from '@angular/core';
import {UserService} from '../../../_services/user.service';
import {NgbActiveModal} from '@ng-bootstrap/ng-bootstrap';
import {MessageService} from 'primeng/api';
import {UntypedFormBuilder, UntypedFormGroup, Validators} from '@angular/forms';

@Component({
    selector: 'create-user-modal',
    template: `
        <app-standard-dialog
            title="Create User"
            subtitle="Create a system user"
        >
            <app-dialog-tab>
                <form [formGroup]="form" name="CREATE_USER" novalidate>
                    <app-text-input
                        test_id="CREATE_USER"
                        formControlName="name"
                        label="Name"
                    ></app-text-input>

                    <app-text-input
                        test_id="CREATE_USER"
                        formControlName="email"
                        label="Email"
                    ></app-text-input>

                    <app-password-input
                        test_id="CREATE_USER"
                        formControlName="password"
                        label="Password"
                    ></app-password-input>

                    <app-password-input
                        test_id="CREATE_USER"
                        formControlName="confirmPassword"
                        label="Confirm Password"
                    >
                        <app-input-error field="confirmedValidator">
                            Both password should match.
                        </app-input-error>
                    </app-password-input>
                </form>
            </app-dialog-tab>
            <app-dialog-footer>
                <button
                    class="btn btn-primary"
                    type="submit"
                    id="CREATE_USER_SUBMIT_BTN"
                    [disabled]="form.invalid"
                    (click)="onSubmit()"
                >
                    Create
                </button>
            </app-dialog-footer>
        </app-standard-dialog>
    `,
    styles: [``],
})
export class CreateUserModalComponent implements OnInit {
    @Output() passEntry: EventEmitter<any> = new EventEmitter();

    form = this.formBuilder.group(
        {
            email: ['', Validators.required],
            name: ['', Validators.required],
            password: ['', Validators.required],
            confirmPassword: ['', Validators.required],
        },
        {
            validator: this.ConfirmedValidator('password', 'confirmPassword'),
        },
    );
    krishna: any;

    constructor(
        private userService: UserService,
        private messageService: MessageService,
        private formBuilder: UntypedFormBuilder,
        public activeModal: NgbActiveModal,
    ) {
    }

    ngOnInit() {
    }

    async onSubmit() {
        let data = this.form.value;
        try {
            let createdUser = await this.userService.createUser(
                data.name,
                data.email,
                data.password,
            );
            this.messageService.add({
                severity: 'success',
                summary: 'Success',
                detail: 'User Created',
            });
            this.passEntry.emit(createdUser);
            this.activeModal.close(createdUser);
        } catch (e: any) {
            console.error(e);
            this.messageService.add({
                severity: 'error',
                summary: 'Error',
                detail: e.error.message,
            });
        }
    }

    ConfirmedValidator(controlName: string, matchingControlName: string) {
        return (formGroup: UntypedFormGroup) => {
            const control = formGroup.controls[controlName];
            const matchingControl = formGroup.controls[matchingControlName];
            if (
                matchingControl.errors &&
                !matchingControl.errors['confirmedValidator']
            ) {
                return;
            }
            if (control.value !== matchingControl.value) {
                matchingControl.setErrors({confirmedValidator: true});
            } else {
                matchingControl.setErrors(null);
            }
        };
    }
}
