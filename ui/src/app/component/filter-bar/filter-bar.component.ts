import {Component, ContentChildren, EventEmitter, Input, OnInit, Output, QueryList, ViewChildren,} from '@angular/core';
import {Operators} from '../model/Operator';
import {FilterFieldComponent} from './filter-field.component';
import {FilterSelectFieldComponent, FilterSelectOption} from './filter-select-field.component';
import {Filter} from '../model/Filters';

@Component({
    selector: 'app-fb-col',
    template: '', // No template needed, acts as a data provider
    styles: [],
})
export class FilterBarColumnComponent implements OnInit {
    @Input() label: string = '';
    @Input() name: string = '';
    @Input() type: 'text' | 'select' = 'text';
    @Input() options: FilterSelectOption[] = [];

    constructor() {
    }

    ngOnInit(): void {
    }
}

@Component({
    selector: 'app-fb',
    template: `
        <div class="row">
            <div class="col-md-11 col-sm-12 my-2">
                <div class="row row-cols-auto">
                    <!-- Render a filter field for each projected column -->
                    <div *ngFor="let column of columns" class="col-auto">
                        <app-filter-field
                            *ngIf="visibility && column.type === 'text'"
                            [name]="column.name"
                            [label]="column.label"
                        >
                        </app-filter-field>
                        <app-filter-select-field
                            *ngIf="visibility && column.type === 'select'"
                            [name]="column.name"
                            [label]="column.label"
                            [options]="column.options"
                        >
                        </app-filter-select-field>
                    </div>
                </div>
            </div>
            <div class="col-md-1 col-sm-12 my-2">
                <div class="col d-flex justify-content-end align-items-center">
                    <!-- Go Button: Triggers filtering -->
                    <button
                        *ngIf="visibility"
                        (click)="onGo()"
                        [id]="goButtonId"
                        class="btn btn-primary btn-block btn-sm me-2"
                    >
                        Go
                    </button>
                    <!-- Visibility Toggle Button -->
                    <button
                        (click)="toggleVisibility()"
                        class="btn btn-sm px-3"
                        [attr.aria-label]="
                            visibility ? 'Hide Filters' : 'Show Filters'
                        "
                        title="{{
                            visibility ? 'Hide Filters' : 'Show Filters'
                        }}"
                    >
                        <i
                            class=" fa {{
                                visibility ? 'fa-eye-slash' : 'fa-filter'
                            }}"
                        ></i>
                    </button>
                </div>
            </div>
        </div>
    `,
    styles: [
        // Styles remain the same as they are functional and theme-aware
        `
            .btn {
                transition: background-color 0.3s ease,
                color 0.3s ease,
                border-color 0.3s ease;
            }

            .btn-primary {
                background-color: var(--bs-primary);
                border-color: var(--bs-primary);
                color: var(--bs-primary-text);
            }

            .btn-primary:hover {
                background-color: var(--bs-primary-dark);
                border-color: var(--bs-primary-dark);
            }

            .btn:not(.btn-primary) {
                color: var(--bs-body-color);
                background-color: var(--bs-body-bg);
                border-color: var(--bs-border-color);
            }

            .btn:not(.btn-primary):hover {
                background-color: var(--bs-secondary-bg);
                color: var(--bs-body-color);
            }

            [data-bs-theme='dark'] .btn:not(.btn-primary) {
                background-color: var(--bs-dark);
                color: var(--bs-body-color);
                border-color: var(--bs-border-color);
            }

            [data-bs-theme='dark'] .btn:not(.btn-primary):hover {
                background-color: var(--bs-secondary-bg);
            }
        `,
    ],
})
export class FilterBarComponent implements OnInit {
    // Make Operators enum available in the template if needed by FilterFieldComponent implicitly
    Operators = Operators;

    /** Optional identifier for the filter bar, used for generating unique element IDs. */
    @Input() name: string = 'default';

    /** Controls the visibility of the filter fields and Go button. */
    @Input() visibility: boolean = true;

    /** Emits an array of active filters when the 'Go' button is clicked. */
    @Output() onFilter = new EventEmitter<Filter[]>();

    // Query projected FilterBarColumnComponent instances
    @ContentChildren(FilterBarColumnComponent)
    columns!: QueryList<FilterBarColumnComponent>;

    // Query rendered FilterFieldComponent instances
    @ViewChildren(FilterFieldComponent)
    filterFields!: QueryList<FilterFieldComponent>;

    // Query rendered FilterSelectFieldComponent instances
    @ViewChildren(FilterSelectFieldComponent)
    filterSelectFields!: QueryList<FilterSelectFieldComponent>;

    goButtonId: string = '';

    constructor() {
    }

    ngOnInit(): void {
        this.goButtonId = `${this.name}_FILTER_BAR_GO_BTN`;
    }

    getFilters(): Filter[] {
        const textFilters = this.filterFields
            ? this.filterFields.toArray().flatMap(
                (ff: FilterFieldComponent) =>
                    ff.getFilters ? ff.getFilters() : [],
            )
            : [];
        const selectFilters = this.filterSelectFields
            ? this.filterSelectFields.toArray().flatMap(
                (ff: FilterSelectFieldComponent) =>
                    ff.getFilters ? ff.getFilters() : [],
            )
            : [];
        return [...textFilters, ...selectFilters];
    }

    toggleVisibility(): void {
        this.visibility = !this.visibility;
    }

    onGo(): void {
        const activeFilters = this.getFilters();
        this.onFilter.emit(activeFilters);
    }
}
