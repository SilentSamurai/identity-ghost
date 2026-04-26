import {
    booleanAttribute,
    Component,
    ContentChild,
    ContentChildren,
    Inject,
    Injector,
    Input,
    OnInit,
    QueryList,
    TemplateRef,
} from '@angular/core';
import {
    ControlValueAccessor,
    FormControl,
    FormControlDirective,
    FormControlName,
    FormGroupDirective,
    NG_VALUE_ACCESSOR,
    NgControl,
    UntypedFormControl,
    Validators,
} from '@angular/forms';
import {InputErrorComponent} from './input-error.component';
import {ValueHelpComponent} from '../value-help/value-help.component';
import {ValueHelpColumnComponent} from '../value-help-input/value-help-column.component';
import {FilterBarColumnComponent} from '../filter-bar/filter-bar.component';
import {ModalResult, ModalService} from '../dialogs/modal.service';
import {DataSource} from '../model/DataSource';
import {randomId} from "../util/utils";

@Component({
    selector: 'app-form-vh-input',
    template: `
        <div class="form-group row mb-2">
            <label
                class="col-auto col-md-4 col-form-label form-label fw-semibold text-end  {{
                    disabled ? 'p-disabled' : ''
                }}"
                for="{{ test_id }}_{{ formControlName }}_INPUT"
            >
                {{ label }}:<span *ngIf="required" class="text-danger">*</span>
            </label>
            <div class="col-auto col-md-8">
                <div class="input-group ">
                    <input
                        [disabled]="disabled"
                        [value]="displayValue"
                        (blur)="onTouched()"
                        class="form-control text-truncate ng-invalid ng-dirty"
                        readonly
                        id="{{ test_id }}_{{ formControlName }}_INPUT"
                        name="{{ formControlName }}"
                        type="text"
                    />

                    <button
                        [disabled]="disabled"
                        (click)="openValueHelp()"
                        class="input-group-text btn btn-outline-secondary"
                        id="{{ test_id }}_{{ formControlName }}-input-vh-btn"
                        type="button"
                        aria-label="Open value help"
                    >
                        <i class="fa fas fa-clone"></i>
                    </button>
                </div>
            </div>
            <div
                *ngIf="control.invalid && (control.dirty || control.touched)"
                class="text-danger text-end"
                role="alert"
            >
                <div *ngIf="control.hasError('required')">
                    {{ label }} is required.
                </div>
                <ng-container *ngFor="let eh of inputErrors">
                    <div *ngIf="control.hasError(eh.field)">
                        <ng-container
                            [ngTemplateOutlet]="eh.template"
                        ></ng-container>
                    </div>
                </ng-container>
            </div>
        </div>
    `,
    styles: [],
    providers: [
        {
            provide: NG_VALUE_ACCESSOR,
            useExisting: FormValueHelpInputComponent,
            multi: true,
        },
    ],
})
export class FormValueHelpInputComponent
    implements OnInit, ControlValueAccessor {
    @Input({required: true}) dataSource!: DataSource<any>;
    @Input({transform: booleanAttribute}) multi: boolean = false;

    @ContentChild('vh_body')
    body: TemplateRef<any> | null = null;
    @ContentChildren(ValueHelpColumnComponent)
    columns!: QueryList<ValueHelpColumnComponent>;
    @ContentChildren(FilterBarColumnComponent)
    filters!: QueryList<FilterBarColumnComponent>;

    @Input() test_id: string = randomId();
    @Input({required: true}) formControlName: string = '';
    @Input({required: true}) displayField: string | ((value: any) => string) =
        '';
    @Input() label: string = '';

    disabled = false;

    values: any[] = [];
    displayValue: string = '';
    required: boolean = false;
    formControl!: UntypedFormControl;
    @ContentChildren(InputErrorComponent)
    inputErrors!: QueryList<InputErrorComponent>;

    constructor(
        private modalService: ModalService,
        @Inject(Injector) private injector: Injector,
    ) {
    }

    get control() {
        return this.formControl!;
    }

    onChange = (value: any) => {
    };

    onTouched = () => {
    };

    async ngOnInit(): Promise<void> {
        // console.log("pool: ", this.disabled)
        this.setFormControl();
        this.required = this.formControl?.hasValidator(Validators.required);
    }

    setFormControl() {
        try {
            const formControl = this.injector.get(NgControl);
            switch (formControl.constructor) {
                case FormControlName:
                    this.formControl = this.injector
                        .get(FormGroupDirective)
                        .getControl(formControl as FormControlName);
                    break;
                default:
                    this.formControl = (formControl as FormControlDirective)
                        .form as FormControl;
                    break;
            }
        } catch (err) {
            console.error(err);
            this.formControl = new FormControl();
        }
    }

    async openValueHelp() {
        let selection = this.values;

        const result: ModalResult<any[]> = await this.modalService.open(
            ValueHelpComponent,
            {
                initData: {
                    name: this.label,
                    body: this.body,
                    columns: this.columns,
                    filters: this.filters,
                    dataSource: this.dataSource,
                    selectedItem: selection,
                    multi: this.multi as boolean,
                },
            },
        );
        if (result.is_ok()) {
            const row = result.data;
            this.changeValue(row);
            console.log(row);
        }
    }

    // sending value to outside
    changeValue(value: any | any[]) {
        if (!this.multi && value.length > 0) {
            value = value[0];
        }
        this.onChange(value);
        this.internalWrite(value);
    }

    convertSelectionToString(values: any[]) {
        try {
            if (typeof this.displayField === 'string') {
                const mapper = (value: any) => {
                    const field = this.displayField as string;
                    if (value != null && value.hasOwnProperty(field)) {
                        return value[field];
                    }
                    return '';
                };
                return values.map(mapper).join(',');
            }
            if (typeof this.displayField === 'function') {
                const mapper = this.displayField;
                return values.map(mapper).join(',');
            }
            return values.map((value: any) => value.toString()).join(',');
        } catch (error) {
            console.error(error);
        }
        return '';
    }

    internalWrite(values: any | any[]) {
        if (Array.isArray(values)) {
            this.values = values;
            this.displayValue = this.convertSelectionToString(values);
        } else if (
            typeof values === 'object' &&
            !Array.isArray(values) &&
            values !== null
        ) {
            values = [values];
            this.values = values;
            this.displayValue = this.convertSelectionToString(values);
        } else {
            console.error('Incorrect value set to value help input', values);
        }
    }

    // getting value from outside
    writeValue(value: any[] | any): void {
        this.internalWrite(value);
    }

    registerOnChange(fn: any): void {
        this.onChange = fn;
    }

    registerOnTouched(fn: any): void {
        this.onTouched = fn;
    }

    setDisabledState(isDisabled: boolean): void {
        this.disabled = isDisabled;
    }
}
