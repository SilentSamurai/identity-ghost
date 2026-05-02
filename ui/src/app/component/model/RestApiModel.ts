import {HttpClient} from '@angular/common/http';
import {lastValueFrom} from 'rxjs';
import {BaseDataSource, ReturnedData} from './DataSource';
import {Query} from './Query';

export interface ApiRequest {
    pageNo: number;
    pageSize: number;
    where: any[];
    orderBy: any[];
    expand: string[];
}

interface SearchResponse<T> {
    data: T[];
    pageNo: number;
    pageSize: number;
    totalCount: number;
}

export class RestApiModel<T> extends BaseDataSource<T> {
    constructor(
        private http: HttpClient,
        private path: string,
        keyFields: string[],
        query: Query = new Query({}),
    ) {
        super(keyFields, query);
    }

    async queryData(query: Query): Promise<ReturnedData<T>> {
        const body: ApiRequest = {
            pageNo: query.pageNo,
            pageSize: query.pageSize,
            where: query.filters,
            orderBy: query.orderBy,
            expand: query.expand,
        };

        const response = await lastValueFrom(
            this.http.post<SearchResponse<T>>(this.path, body),
        );

        return {
            data: response.data,
            totalCount: response.totalCount,
        };
    }

    async queryCount(query: Query): Promise<number> {
        const body = {
            where: query.filters,
            select: 'count',
        };

        const response = await lastValueFrom(
            this.http.post<{ count: number }>(this.path, body),
        );

        return response.count ?? 0;
    }
}
