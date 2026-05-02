import {Component, Input, OnInit} from '@angular/core';
import {Operators} from '../model/Operator';
import {NgbActiveModal} from '@ng-bootstrap/ng-bootstrap';
import {Condition, InternalFilter} from './filter-field.component';

@Component({
    selector: 'app-fvh',
    template: `
        <app-standard-dialog
            title="Filter {{ internalFilter.label }}"
            subtitle="Define additional filters for {{ internalFilter.label }}"
        >
            <app-dialog-tab name="Define Conditons">
                <div
                    class="row my-2"
                    *ngFor="
                        let condition of editConditions;
                        index as i
                    "
                >
                    <div class="col-3">
                        <button
                            aria-expanded="false"
                            class="btn btn-outline-secondary dropdown-toggle text-start"
                            ngbDropdown
                            ngbDropdownToggle
                            type="button"
                        >
                            <b class="">
                                {{ condition.operator.symbol }}
                            </b>
                            <ul class="dropdown-menu " ngbDropdownMenu>
                                <li
                                    *ngFor="let opr of Operators.ALL_OPERATORS"
                                    (click)="condition.operator = opr"
                                >
                                    <a class="dropdown-item ">
                                        {{ opr.label }}
                                    </a>
                                </li>
                            </ul>
                        </button>
                    </div>

                    <div class="col-8">
                        <input
                            type="text"
                            [(ngModel)]="condition.value"
                            class="form-control"
                            placeholder=""
                        />
                    </div>

                    <div class="col-1 px-0 py-1">
                        <button
                            class="btn btn-sm py-0"
                            (click)="removeFilter(i)"
                            aria-label="Remove filter"
                        >
                            <i class="fa fa-close"></i>
                        </button>
                    </div>
                </div>

                <div class="row my-2">
                    <div class="col d-flex justify-content-end mt-3">
                        <button
                            (click)="addFilter()"
                            class="btn btn-sm btn-success"
                        >
                            <i class="fa fa-plus-circle"></i> Add Condition
                        </button>
                    </div>
                </div>
            </app-dialog-tab>
            <app-dialog-footer>
                <button
                    (click)="confirm()"
                    class="btn btn-primary btn-block btn-sm"
                >
                    Done
                </button>
            </app-dialog-footer>
        </app-standard-dialog>
    `,
    styles: [],
})
export class FilterValueHelpComponent implements OnInit {
    @Input() internalFilter!: InternalFilter;

    editConditions: Condition[] = [];

    readonly Operators = Operators;

    constructor(private activeModal: NgbActiveModal) {
    }

    async ngOnInit(): Promise<void> {
        this.editConditions = this.internalFilter.conditions.map(
            c => new Condition(c.operator, c.value)
        );
    }

    addFilter() {
        this.editConditions.push(new Condition(Operators.MATCHES, ''));
    }

    removeFilter(index: number) {
        if (this.editConditions.length > 1) {
            this.editConditions.splice(index, 1);
        }
    }

    cancel() {
        this.activeModal.close();
    }

    confirm() {
        this.internalFilter.conditions = this.editConditions;
        this.activeModal.close(this.internalFilter);
    }
}
