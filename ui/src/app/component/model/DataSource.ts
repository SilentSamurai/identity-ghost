import {Observable, Subject} from "rxjs";
import {Filter} from "./Filters";
import {query, Query} from "./Query";

export interface DataSource<T> {
    fetchData(query: Query): Promise<ReturnedData<T>>;

    totalCount(query: Query): Promise<number>;

    keyFields(): string[];

    updates(): Observable<DataSourceEvents>;

    filter(filters: Filter[]): void;

    refresh(): void;
}

export interface DataSourceEvents {
    type: 'data-updated' | 'unknown';
    source: string;
    data?: any;
}

export interface ReturnedData<T> {
    data: T[];
    count?: number;
    totalCount?: number;
}

export abstract class BaseDataSource<T> implements DataSource<T> {
    protected constructor(
        public _keyFields: string[],
        protected baseQuery: Query = query({}),
        protected eventSubject = new Subject<DataSourceEvents>(),
    ) {
    }

    keyFields(): string[] {
        return this._keyFields;
    }

    fetchData(_query: Query): Promise<ReturnedData<T>> {
        let query = new Query(this.baseQuery);
        query.append(_query);
        return this.queryData(query);
    }

    totalCount(_query: Query): Promise<number> {
        let query = new Query(this.baseQuery);
        query.append(_query);
        return this.queryCount(query);
    }

    filter(filters: Filter[]): void {
        this.baseQuery.update({filters});
        this.eventSubject.next({type: 'data-updated', source: 'filter'});
    }

    updates(): Observable<DataSourceEvents> {
        return this.eventSubject;
    }

    abstract queryData(query: Query): Promise<ReturnedData<T>>;

    abstract queryCount(query: Query): Promise<number>;

    refresh(): void {
        this.eventSubject.next({type: 'data-updated', source: 'refresh'});
    }
}
