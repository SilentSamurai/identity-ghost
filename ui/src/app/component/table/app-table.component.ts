import {
    booleanAttribute,
    Component,
    ContentChild,
    ContentChildren,
    EventEmitter,
    Input,
    OnDestroy,
    OnInit,
    Output,
    QueryList,
    TemplateRef,
} from '@angular/core';
import {TableColumnComponent} from './app-table-column.component';
import {DataSource, IDataModel, Query} from '../model/DataModels';
import {Filter} from '../model/Filters';
import {Subscription} from 'rxjs';
import {DataModel} from '../model/DataModel';
import {SelectionModel} from './selection-model';
import {SortModel} from './sort-model';
import {TableState} from './table-state';
import {exportToCsv} from './csv-export';

@Component({
    selector: 'app-table',
    template: `
        <!-- Toolbar -->
        <div class="a-table-caption h6 p-2 mb-0 border-bottom">
            <div class="d-flex align-items-center justify-content-between">
                <div class="app-table-body">
                    {{ title }} <span>({{ dataModel.totalRowCount() }})</span>
                </div>
                <div class="d-flex gap-2">
                    <ng-content select="app-table-actions"></ng-content>
                    <button type="button" class="btn btn-sm" (click)="refresh()" pRipple>
                        <i class="pi pi-refresh"></i>
                    </button>
                    <button type="button" class="btn btn-sm" (click)="onExportCsv()" pRipple>
                        <i class="pi pi-download"></i>
                    </button>
                </div>
            </div>
        </div>

        <!-- Error state -->
        <div *ngIf="state.kind === 'error'" class="p-4 text-center text-danger">
            <i class="fa fa-exclamation-triangle me-2"></i>
            {{ state.message }}
            <button class="btn btn-sm btn-outline-secondary ms-2" (click)="refresh()">Retry</button>
        </div>

        <!-- Table -->
        <div
            *ngIf="state.kind !== 'error'"
            class="table-responsive"
            [style.max-height]="scrollHeight"
            appInfiniteScroll
            (reachedEnd)="onLoadMore()"
        >
            <table class="table a-table table-striped table-hover table-sm">
                <thead class="sticky-top top-0 bg-body">
                <tr style="min-height:35px">
                    <th style="width:40px">
                        <input *ngIf="multi"
                               class="form-check-input"
                               type="checkbox"
                               value=""
                               [checked]="selectionModel.isAllSelected ? true : null"
                               (click)="onSelectAll()"/>
                    </th>
                    <ng-container *ngFor="let col of columns">
                        <ng-container
                            *ngIf="col.isTemplateProvided"
                            [ngTemplateOutlet]="col.templateRef"
                        ></ng-container>
                        <ng-container *ngIf="!col.isTemplateProvided">
                            <th
                                scope="col"
                                [class.sortable]="col.sortable"
                                (click)="col.sortable && onSort(col.name)"
                                [style.min-width.px]="col.width || 150"
                            >
                                <div class="d-flex align-items-center">
                                    {{ col.label }}
                                    <i *ngIf="col.sortable"
                                       [class]="sortModel.getIcon(col.name)"
                                       class="ms-1"></i>
                                </div>
                            </th>
                        </ng-container>
                    </ng-container>
                </tr>
                </thead>
                <tbody>
                <ng-container *ngIf="state.kind === 'data'">
                    <tr *ngFor="let row of state.rows"
                        class="a-table-row"
                        style="height:35px"
                        (click)="onRowSelect(row)">
                        <td style="width:40px">
                            <input *ngIf="multi"
                                   class="form-check-input"
                                   type="checkbox" value="" readonly
                                   [checked]="selectionModel.isSelected(row) ? true : null"/>
                            <input *ngIf="!multi"
                                   class="form-check-input"
                                   name="table-selection"
                                   type="radio" value="" readonly
                                   [checked]="selectionModel.isSelected(row) ? true : null"/>
                        </td>
                        <ng-container *ngIf="body">
                            <ng-container
                                *ngTemplateOutlet="body; context: {$implicit: row}"
                            ></ng-container>
                        </ng-container>
                        <ng-container *ngIf="!body"> No data</ng-container>
                    </tr>
                </ng-container>

                <!-- Empty state -->
                <tr *ngIf="state.kind === 'empty'">
                    <td [attr.colspan]="(columns?.length || 0) + 1" class="text-center text-muted p-4">
                        No data available.
                    </td>
                </tr>

                <!-- Loading indicator -->
                <tr style="height:40px" *ngIf="state.kind === 'loading' || (state.kind === 'data' && state.loadingMore)">
                    <td>
                        <div class="loading-text"></div>
                        <p-skeleton [ngStyle]="{width: '100%'}"></p-skeleton>
                    </td>
                    <td *ngFor="let col of columns">
                        <div class="loading-text"></div>
                        <p-skeleton [ngStyle]="{width: '100%'}"></p-skeleton>
                    </td>
                </tr>
                </tbody>
            </table>
        </div>
    `,
    styles: [
        `
            .a-table-caption {
                background-color: var(--bs-card-bg);
                color: var(--bs-body-color);
            }

            .a-table {
                color: var(--bs-body-color);
            }

            .a-table thead th {
                background-color: var(--bs-card-bg);
                color: var(--bs-body-color);
                border-color: var(--bs-border-color);
            }

            .a-table tbody td {
                border-color: var(--bs-border-color);
            }

            .a-table-row:hover {
                background-color: var(
                    --bs-table-hover-bg,
                    rgba(var(--bs-primary-rgb, 13, 110, 253), 0.05)
                );
            }

            .a-table-row.selected {
                background-color: var(
                    --bs-table-active-bg,
                    rgba(var(--bs-primary-rgb, 13, 110, 253), 0.1)
                );
            }

            .btn-sm {
                color: var(--bs-body-color);
            }

            .sortable {
                cursor: pointer;
                user-select: none;
            }

            .sortable:hover {
                background-color: var(
                    --bs-table-hover-bg,
                    rgba(var(--bs-primary-rgb, 13, 110, 253), 0.1)
                );
            }

            [data-bs-theme='dark'] {
                .a-table-caption {
                    background-color: var(--bs-dark);
                    color: var(--bs-light);
                }

                .a-table {
                    color: var(--bs-light);
                }

                .a-table thead th {
                    background-color: var(--bs-dark);
                    color: var(--bs-light);
                    border-color: var(--bs-border-color);
                }

                .a-table tbody td {
                    border-color: var(--bs-border-color);
                }

                .a-table-row:hover {
                    background-color: var(
                        --bs-table-hover-bg,
                        rgba(255, 255, 255, 0.075)
                    );
                }

                .a-table-row.selected {
                    background-color: var(
                        --bs-table-active-bg,
                        rgba(255, 255, 255, 0.1)
                    );
                }

                .btn-sm {
                    color: var(--bs-light);
                }
            }
        `,
    ],
})
export class AppTableComponent implements OnInit, OnDestroy {
    @Input() title: string = '';
    @Input() scrollHeight: string = '65vh';
    @Input({transform: booleanAttribute}) multi: boolean = true;

    @Input() selection: any[] = [];
    @Output() selectionChange = new EventEmitter<any[]>();

    @ContentChild('table_body') body: TemplateRef<any> | null = null;
    @ContentChildren(TableColumnComponent) columns!: QueryList<TableColumnComponent>;

    state: TableState = {kind: 'loading'};
    selectionModel!: SelectionModel;
    sortModel = new SortModel();

    private idFields: string[] = [];
    private pagesInProgress = new Set<number>();
    private query = new Query({});
    private _subscriptions = new Subscription();

    _dataModel!: IDataModel<any>;

    get dataModel(): IDataModel<any> {
        return this._dataModel;
    }

    @Input({required: true})
    set dataSource(dataSource: DataSource<any>) {
        // Tear down previous model subscription if re-bound
        this._subscriptions.unsubscribe();
        this._subscriptions = new Subscription();

        this._dataModel = new DataModel(dataSource);
        this.idFields = dataSource.keyFields();
        this.selectionModel = new SelectionModel(
            (row: any) => this.getKeyValue(row),
            this.multi,
        );
    }

    // --- Lifecycle ---

    async ngOnInit(): Promise<void> {
        this._subscriptions.add(
            this._dataModel.dataSourceEvents().subscribe((x) => {
                if (x.type === 'data-updated') {
                    this.refresh();
                }
            }),
        );

        this.selectionModel.setMulti(this.multi);
        this.selection.forEach(item => this.selectRow(item));
        this.refresh();
    }

    ngOnDestroy(): void {
        this._subscriptions.unsubscribe();
    }

    // --- Public API (used by parent via @ViewChild) ---

    filter(filters: Filter[]): void {
        this.fetchData(this.query.update({filters, pageNo: 0}), false);
    }

    refresh(): void {
        this.fetchData(this.query.update({pageNo: 0}), false);
    }

    selectRow(row: any): void {
        this.selectionModel.toggle(row);
        if (this.multi && this.state.kind === 'data') {
            this.selectionModel.updateAllSelectedState(this.state.rows);
        }
    }

    // --- Template event handlers ---

    onSort(column: string): void {
        const orderBy = this.sortModel.toggle(column);
        this.fetchData(this.query.update({orderBy, pageNo: 0}), false);
    }

    onRowSelect(row: any): void {
        this.selectRow(row);
        if (this.state.kind === 'data') {
            this.selection = this.selectionModel.getSelectedRows(this.state.rows);
            this.selectionChange.emit(this.selection);
        }
    }

    onSelectAll(): void {
        if (this.state.kind === 'data') {
            this.selectionModel.toggleAll(this.state.rows);
            this.selection = this.selectionModel.getSelectedRows(this.state.rows);
            this.selectionChange.emit(this.selection);
        }
    }

    onLoadMore(): void {
        if (this.pagesInProgress.size < 1 && this.state.kind === 'data') {
            this.fetchData(this.query, true);
        }
    }

    onExportCsv(): void {
        if (this.state.kind === 'data') {
            const cols = this.columns.map(c => ({label: c.label, name: c.name}));
            exportToCsv(cols, this.state.rows, `${this.title || 'table'}_export.csv`);
        }
    }

    // --- Internal ---

    private getKeyValue(row: any): string {
        return this.idFields
            .map(kf => row[kf]?.toString() ?? 'null')
            .join('|');
    }

    private fetchData(query: Query, append: boolean): void {
        if (!append) {
            this.pagesInProgress.clear();
            query.pageNo = 0;
        } else {
            query.pageNo += 1;
        }

        if (
            this.pagesInProgress.has(query.pageNo) ||
            !this.dataModel.hasPage(query.pageNo, query.pageSize)
        ) {
            return;
        }

        this.pagesInProgress.add(query.pageNo);

        if (!append) {
            this.state = {kind: 'loading'};
        } else if (this.state.kind === 'data') {
            this.state = {...this.state, loadingMore: true};
        }

        this.dataModel.execute(query).then(
            (response) => {
                this.pagesInProgress.delete(query.pageNo);
                if (append && this.state.kind === 'data') {
                    const rows = response.data.length > 0
                        ? [...this.state.rows, ...response.data]
                        : this.state.rows;
                    this.state = {kind: 'data', rows, loadingMore: false};
                } else {
                    this.state = response.data.length > 0
                        ? {kind: 'data', rows: response.data, loadingMore: false}
                        : {kind: 'empty'};
                }
            },
            (error) => {
                this.pagesInProgress.delete(query.pageNo);
                console.error('Table fetch error:', error);
                this.state = {kind: 'error', message: error?.message || 'Failed to load data'};
            },
        );
    }
}
