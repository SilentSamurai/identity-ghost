import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { UserService } from '../../../_services/user.service';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { MessageService } from 'primeng/api';
import {FormBuilder, UntypedFormBuilder, UntypedFormGroup, Validators} from '@angular/forms';

@Component({
    selector: 'change-password-modal',
    template: `
        <app-standard-dialog title="Change Password">
            <app-dialog-tab>
                <form [formGroup]="form" name="CHANGE_PASSWORD" novalidate>
                    <div style="position: relative;">
                        <app-password-input
                            formControlName="password"
                            label="New Password"
                        ></app-password-input>
                    </div>
                    <div style="position: relative;">
                        <app-password-input
                            formControlName="confirmPassword"
                            label="Confirm Password"
                        >
                            <app-input-error field="confirmedValidator">
                                Both passwords should match.
                            </app-input-error>
                        </app-password-input>
                    </div>
                </form>
            </app-dialog-tab>
            <app-dialog-footer>
                <button
                    class="btn btn-primary"
                    type="submit"
                    [disabled]="form.invalid"
                    (click)="onSubmit()"
                >
                    Update Password
                </button>
            </app-dialog-footer>
        </app-standard-dialog>
    `,
    styles: [``],
})
export class ChangePasswordModalComponent implements OnInit {
    @Input() user: any;
    @Output() passEntry: EventEmitter<any> = new EventEmitter();

    showPassword = false;
    showConfirmPassword = false;

    form = this.formBuilder.group(
        {
            password: ['', Validators.required],
            confirmPassword: ['', Validators.required],
        },
        {
            validator: this.ConfirmedValidator('password', 'confirmPassword'),
        },
    );

    constructor(
        private userService: UserService,
        private messageService: MessageService,
        private formBuilder: FormBuilder,
        public activeModal: NgbActiveModal,
    ) {}

    ngOnInit() {}

    togglePassword() {
        this.showPassword = !this.showPassword;
    }

    toggleConfirmPassword() {
        this.showConfirmPassword = !this.showConfirmPassword;
    }

    async onSubmit() {
        if (this.form.invalid) return;
        try {
            const data = this.form.value;
            let updatedUser = await this.userService.changeUserPassword(
                this.user.id,
                data.password,
                data.confirmPassword,
            );
            this.messageService.add({
                severity: 'success',
                summary: 'Success',
                detail: 'Password Updated',
            });
            this.passEntry.emit(updatedUser);
            this.activeModal.close(updatedUser);
        } catch (e: any) {
            this.messageService.add({
                severity: 'error',
                summary: 'Error',
                detail: e.error?.message || 'Password update failed',
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
                matchingControl.setErrors({ confirmedValidator: true });
            } else {
                matchingControl.setErrors(null);
            }
        };
    }
}
