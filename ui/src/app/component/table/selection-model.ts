import {BehaviorSubject, Observable} from 'rxjs';

export class SelectionModel<T = any> {
    private selectedKeys = new Set<string>();
    private allSelected$ = new BehaviorSubject<boolean>(false);

    constructor(
        private keyFn: (row: T) => string,
        private multi: boolean = true,
    ) {}

    get isAllSelected$(): Observable<boolean> {
        return this.allSelected$.asObservable();
    }

    get isAllSelected(): boolean {
        return this.allSelected$.getValue();
    }

    toggle(row: T): void {
        if (!this.multi) {
            this.selectedKeys.clear();
        }
        const key = this.keyFn(row);
        if (this.selectedKeys.has(key)) {
            this.selectedKeys.delete(key);
        } else {
            this.selectedKeys.add(key);
        }
    }

    isSelected(row: T): boolean {
        return this.selectedKeys.has(this.keyFn(row));
    }

    toggleAll(rows: T[]): void {
        if (this.allSelected$.getValue()) {
            this.selectedKeys.clear();
            this.allSelected$.next(false);
        } else {
            this.selectedKeys = new Set(rows.map(r => this.keyFn(r)));
            this.allSelected$.next(true);
        }
    }

    updateAllSelectedState(rows: T[]): void {
        const allSelected = rows.length > 0 &&
            rows.every(r => this.selectedKeys.has(this.keyFn(r)));
        this.allSelected$.next(allSelected);
    }

    getSelectedRows(rows: T[]): T[] {
        return rows.filter(r => this.selectedKeys.has(this.keyFn(r)));
    }

    clear(): void {
        this.selectedKeys.clear();
        this.allSelected$.next(false);
    }

    setMulti(multi: boolean): void {
        this.multi = multi;
    }
}
