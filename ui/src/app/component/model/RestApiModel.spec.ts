import {RestApiModel} from './RestApiModel';
import {HttpClientTestingModule, HttpTestingController,} from '@angular/common/http/testing';
import {TestBed} from '@angular/core/testing';
import {Filter} from './Filters';
import {Operators} from './Operator';
import {HttpClient} from '@angular/common/http';
import {Query, SortConfig} from "./Query";

describe('RestApiModel', () => {
    let httpMock: HttpTestingController;
    let httpClient: HttpClient;
    let apiModel: RestApiModel<any>;
    const apiUrl = '/api/data';

    beforeEach(() => {
        TestBed.configureTestingModule({
            imports: [HttpClientTestingModule],
        });

        httpMock = TestBed.inject(HttpTestingController);
        httpClient = TestBed.inject(HttpClient);
        apiModel = new RestApiModel(httpClient, apiUrl, ['id']);
    });

    afterEach(() => {
        httpMock.verify();
    });

    const verifyRequest = (req: any, expectedBody: any) => {
        expect(req.request.method).toBe('POST');
        expect(req.request.body).toEqual(
            jasmine.objectContaining(expectedBody),
        );
    };

    it('should make correct data fetch requests', async () => {
        const testQuery = new Query({
            pageNo: 0,
            pageSize: 25,
            filters: [new Filter('status', 'Status', 'active', Operators.EQ)],
            orderBy: [{field: 'name', order: 'asc'} as SortConfig],
            expand: ['details'],
        });

        const promise = apiModel.fetchData(testQuery); // Start the call, don't await yet!

        const req = httpMock.expectOne(apiUrl); // Match the outgoing request

        verifyRequest(req, {
            pageNo: 0,
            pageSize: 25,
            where: [
                jasmine.objectContaining({
                    field: 'status',
                    value: 'active',
                    operator: jasmine.objectContaining({
                        label: 'equals',
                        symbol: '=',
                    }),
                }),
            ],
            orderBy: [{field: 'name', order: 'asc'}],
            expand: ['details'],
        });

        req.flush({data: [{id: 1}]}); // Respond to the request

        const result = await promise; // NOW await the promise after flush

        expect(result.data).toEqual([{id: 1}]); // Assertions
    });

    it('should handle count requests', async () => {
        const testQuery = new Query({
            filters: [new Filter('active', 'Active', 'true', Operators.EQ)],
        });

        const promise = apiModel.totalCount(testQuery);

        const req = httpMock.expectOne(apiUrl);
        verifyRequest(req, {
            where: [jasmine.objectContaining({value: 'true'})],
            select: 'count',
        });

        req.flush({count: 5});
        const result = await promise;
        expect(result).toBe(5);
    });

    it('should maintain consistent content headers', async () => {
        const dataPromise = apiModel.fetchData(new Query({}));
        const countPromise = apiModel.totalCount(new Query({}));

        const requests = httpMock.match(apiUrl);
        expect(requests.length).toBe(2);

        requests[0].flush({data: []});
        requests[1].flush({count: 0});

        expect((await dataPromise).data).toEqual([]);
        expect(await countPromise).toBe(0);
    });

    it('should process complex filter combinations', async () => {
        const complexFilters = [
            new Filter('price', 'Price', '100', Operators.GT),
            new Filter('name', 'Name', 'test', Operators.CONTAINS),
        ];

        const testQuery = new Query({
            filters: complexFilters,
        });

        const promise = apiModel.fetchData(testQuery);

        const mock = httpMock.expectOne(apiUrl);
        expect(mock.request.body.where).toEqual(complexFilters);

        mock.flush({data: []});
        expect((await promise).data).toEqual([]);
    });

    it('should handle empty responses', async () => {
        const dataPromise = apiModel.fetchData(new Query({}));
        httpMock.expectOne(apiUrl).flush({data: []});
        expect((await dataPromise).data).toEqual([]);

        const countPromise = apiModel.totalCount(new Query({}));
        httpMock.expectOne(apiUrl).flush({count: 0});
        expect(await countPromise).toBe(0);
    });
});
