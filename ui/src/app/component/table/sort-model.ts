import {SortConfig} from '../model/Query';

export class SortModel {
    private currentColumn: string | null = null;
    private directions: Record<string, 'asc' | 'desc'> = {};

    toggle(column: string): SortConfig[] {
        if (this.currentColumn !== column) {
            this.currentColumn = column;
            this.directions[column] = 'asc';
        } else {
            this.directions[column] =
                this.directions[column] === 'asc' ? 'desc' : 'asc';
        }
        return [{field: column, order: this.directions[column]}];
    }

    getIcon(column: string): string {
        if (this.currentColumn !== column) return 'fa fa-sort';
        return this.directions[column] === 'asc'
            ? 'fa fa-sort-asc'
            : 'fa fa-sort-desc';
    }
}
