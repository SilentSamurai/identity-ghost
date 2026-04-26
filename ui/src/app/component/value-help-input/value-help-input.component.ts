import {
    AfterViewInit,
    Component,
    ContentChild,
    ContentChildren,
    EventEmitter,
    Input,
    OnInit,
    Output,
    QueryList,
    TemplateRef,
} from '@angular/core';
import {ActivatedRoute} from '@angular/router';
import {ValueHelpComponent, ValueHelpResult,} from '../value-help/value-help.component';
import {ValueHelpColumnComponent} from './value-help-column.component';
import {FilterBarColumnComponent} from '../filter-bar/filter-bar.component';
import {ModalResult, ModalService} from '../dialogs/modal.service';
import {DataSource} from '../model/DataSource';

function parseBoolean(value: string): boolean {
    const lowerCaseStr = value.toLowerCase();
    return lowerCaseStr === 'true';
}

@Component({
    selector: 'app-value-help-input',
    template: `
        <div class="col-3 input-group">
            <div *ngIf="multi" class="form-control text-truncate">
                <ng-container
                    *ngFor="let row of selection; index as i; first as isFirst"
                >
                    <p-chip [removable]="false" label="{{ getLabel(i) }}">
                    </p-chip>
                </ng-container>
            </div>
            <input
                *ngIf="!multi"
                class="form-control text-truncate"
                id="{{ name }}"
                name="{{ name }}"
                readonly
                placeholder="{{ placeholder }}"
                required
                type="text"
                value="{{ getLabel(0) }}"
            />
            <button
                (click)="openValueHelp()"
                class="input-group-text btn btn-outline-secondary"
                id="{{ name }}-vh-btn"
                type="button"
            >
                <i class="fa fa-clone"></i>
            </button>
        </div>
    `,
    styles: [
        `
            .p-chip-text {
                line-height: 1 !important;
            }
        `,
    ],
})
export class ValueHelpInputComponent implements OnInit, AfterViewInit {
    @Input({required: true}) dataSource!: DataSource<any>;

    @Input() required = false;
    @Input() name: string = '';
    @Input() multi: string | boolean = false;
    @Input() labelField!: string;
    @Input() placeholder: string = '';

    @Input() selection: any[] = [];
    @Output() selectionChange = new EventEmitter<any[]>();

    @ContentChild('vh_body')
    body: TemplateRef<any> | null = null;

    modalInstance!: ValueHelpComponent;

    @ContentChildren(ValueHelpColumnComponent)
    columns!: QueryList<ValueHelpColumnComponent>;

    @ContentChildren(FilterBarColumnComponent)
    filters!: QueryList<FilterBarColumnComponent>;

    constructor(
        private route: ActivatedRoute,
        private modalService: ModalService,
    ) {
    }

    async ngOnInit(): Promise<void> {
        if (typeof this.multi === 'string') {
            this.multi = parseBoolean(this.multi);
        }
    }

    ngAfterViewInit(): void {
        console.log(this.columns?.length);
    }

    changeValue(value: ValueHelpResult) {
        if (!value) {
            return;
        }
        if (Array.isArray(value.selection)) {
            this.selection = value.selection;
            this.selectionChange.emit(this.selection);
        } else {
            this.selection = [value.selection];
            this.selectionChange.emit(this.selection);
        }
    }

    async openValueHelp() {
        const result: ModalResult<ValueHelpResult> =
            await this.modalService.open(ValueHelpComponent, {
                initData: {
                    name: this.name,
                    body: this.body,
                    columns: this.columns,
                    filters: this.filters,
                    dataSource: this.dataSource,
                    selectedItem: this.selection,
                    multi: this.multi as boolean,
                },
            });
        if (result.is_ok()) {
            const row = result.data!;
            this.changeValue(row);
            console.log(row);
        }
    }

    getLabel(index: number) {
        if (this.selection && index >= 0 && index < this.selection.length) {
            const row = this.selection[index] as any;
            return row[this.labelField];
        }
        return '';
    }
}
